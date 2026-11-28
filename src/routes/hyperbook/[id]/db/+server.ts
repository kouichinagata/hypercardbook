import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminClient } from '$lib/server/signatures';
import { userForApiKey } from '$lib/server/api-keys';
import { isCardMarkdown } from '$lib/play-mode';
import { createRateLimiter } from '$lib/server/rate-limit';
import { documentSecret } from '$lib/server/paperoboDocuments';
import { verifyDocumentTicket } from '$lib/server/paperoboDocumentTicket';
import { isTemplate } from '$lib/signature/contract';
import { createContract } from '$lib/server/contracts';
import { addPage, dbPages, deletePage, parseFieldSelector, refererCard, searchPages, updateField, updatePage, type DbResult } from '$lib/hyperbook-db';

// HyperBook DB HTTP Request API: add / delete / search / get / update the pages of the owner's HyperBook.
//   POST   ?action=add                    body: Markdown of the new page (template: field values)
//   DELETE ?action=delete&page=3
//   GET    ?action=search&keyword=Yamada
//   GET    ?action=get                    every page; ?action=get&page=3 one page
//   PATCH  ?action=update&page=3          body: Markdown of the page (template: field values)
//   PATCH  ?action=update&page=3&input(2) body: {{MarkdownAIinput=Sales}}
// Who may call it:
//   - the owner's own card: a card with the same owner as the book.
//     The card is the page the request comes from (its Referer on the same host), so no key is in the card.
//     In PapeRobo the card runs in a sandboxed iframe (no Referer, opaque origin): it sends the ticket PapeRobo opened it with
//     (the `paperobo_share` parameter of its own URL) as `X-PapeRobo-Share`, and the ticket names the card.
//   - an outside program: Authorization: Bearer <the owner's API key>.
// A template (the class of a DB) is never written. In PapeRobo, a card whose developer owns the template gets the PapeRobo user
// who opened it their own DB made from the template (one per user and template); the card keeps calling with the template's id.
// Opened anywhere else, who opened it is not known, so a template is refused with a message to sign in.
// Body: text/markdown; charset=utf-8. Any origin may call it (no cookies are read), so a sandboxed iframe can.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METHOD: Record<string, string> = { add: 'POST', delete: 'DELETE', search: 'GET', get: 'GET', update: 'PATCH' };
const fail = (status: number, error: string) => json({ error }, { status });
const SIGN_IN = 'This MiniApp keeps your data in your own HyperCardBook. Sign up or sign in to HyperCardBook, then open it from PapeRobo.';
// No cookie is read here: who calls is told by the API key, the PapeRobo ticket, or the Referer (only ever the page's own)
const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-PapeRobo-Share',
    'Access-Control-Max-Age': '600'
};
// Per caller (API key, or the card and the client address), per minute
const limiter = createRateLimiter(120, 60_000);

type Book = { id: string; user_id: string; markdown_content: string | null; version: number };

async function findRow(admin: ReturnType<typeof adminClient>, id: string) {
    const query = admin.from('books').select('id, user_id, markdown_content, version');
    const { data } = await (UUID.test(id) ? query.eq('id', id) : query.eq('slug', id)).maybeSingle();
    return data as Book | null;
}

/** The card's owner (the book's owner is checked after) */
function cardOwner(card: Book | null): string | null {
    return card && isCardMarkdown(card.markdown_content) ? card.user_id : null;
}

/** The user's own DB made from the template: one per user and template (the slug is fixed), made the first time */
async function viewerCopy(admin: ReturnType<typeof adminClient>, template: Book, viewer: string): Promise<Book | null> {
    const slug = `db-${template.id}-${viewer}`;
    const find = async () => {
        const { data } = await admin.from('books').select('id, user_id, markdown_content, version').eq('slug', slug).eq('user_id', viewer).order('created_at').limit(1).maybeSingle();
        return data as Book | null;
    };
    const found = await find();
    if (found) return found;
    const madeId = await createContract(admin, viewer, template.id, slug);
    const copy = await find();
    // Made twice at the same time: keep the first one
    if (madeId && copy && copy.id !== madeId) await admin.from('books').delete().eq('id', madeId);
    return copy;
}

/** The book, when the caller is its owner (API key) or the owner's card; the caller names the rate-limit bucket */
async function ownBook(request: Request, url: URL, id: string, client: string): Promise<{ book: Book; caller: string } | { response: Response }> {
    const admin = adminClient();
    const book = await findRow(admin, id);
    const authorization = request.headers.get('authorization');
    const ticket = request.headers.get('x-paperobo-share');
    let userId: string | null = null;
    let caller = '';
    if (authorization) {
        userId = await userForApiKey(admin, authorization);
        if (!userId) return { response: fail(401, 'A valid API key is required.') };
        caller = `key:${userId}`;
    } else if (ticket) {
        // The card PapeRobo opened, for the PapeRobo user who opened it
        const grant = verifyDocumentTicket(ticket, documentSecret(), 'preview');
        if (!grant) return { response: fail(401, 'The PapeRobo ticket has expired. Open the MiniApp again.') };
        const card = await findRow(admin, grant.id);
        userId = cardOwner(card);
        if (!userId) return { response: fail(401, 'The PapeRobo ticket does not name a card.') };
        caller = `card:${card!.id}:${grant.viewer || client}`;
        // The developer's template: the PapeRobo user who opened the card works in their own DB made from it
        if (book && book.user_id === userId && isTemplate(book.markdown_content || '')) {
            if (!grant.viewer) return { response: fail(401, SIGN_IN) };
            const copy = await viewerCopy(admin, book, grant.viewer);
            if (!copy) return { response: fail(503, 'Could not make your copy of the database.') };
            return { book: copy, caller };
        }
    } else {
        const ref = refererCard(request.headers.get('referer'), url);
        const card = ref ? await findRow(admin, ref) : null;
        userId = cardOwner(card);
        if (!userId) return { response: fail(401, 'Use this from your own card, or send an API key.') };
        caller = `card:${card!.id}:${client}`;
    }
    if (!book) return { response: fail(404, 'Book not found.') };
    if (book.user_id !== userId) return { response: fail(403, 'Not your book.') };
    if (isCardMarkdown(book.markdown_content)) return { response: fail(400, 'This document is not a HyperBook.') };
    if (isTemplate(book.markdown_content || '')) return { response: fail(401, SIGN_IN) };
    return { book, caller };
}

/** Apply a change and save it, only over the version it was made from (tried again if someone saved meanwhile) */
async function save(bookId: string, change: (markdown: string) => DbResult): Promise<Response> {
    const admin = adminClient();
    for (let attempt = 0; attempt < 3; attempt++) {
        const { data: book } = await admin.from('books').select('markdown_content, version').eq('id', bookId).maybeSingle();
        if (!book) return fail(404, 'Book not found.');
        const result = change(book.markdown_content || '');
        if (!result.ok) return fail(result.status, result.error);
        const { data: saved, error } = await admin
            .from('books')
            .update({ markdown_content: result.markdown, version: book.version + 1 })
            .eq('id', bookId)
            .eq('version', book.version)
            .select('version')
            .maybeSingle();
        if (error) {
            console.error('[hyperbook-db] save failed:', error);
            return fail(500, 'Could not save the book.');
        }
        if (saved) return json({ ok: true, ...(result.page ? { page: result.page } : {}), pages: dbPages(result.markdown).length, version: saved.version });
    }
    return fail(409, 'The book is being changed. Try again.');
}

const run: RequestHandler = async ({ params, request, url, getClientAddress }) => {
    const action = url.searchParams.get('action') || '';
    if (!METHOD[action]) return fail(400, 'Unknown action.');
    if (request.method !== METHOD[action]) return fail(405, `Use ${METHOD[action]} for action=${action}.`);
    const found = await ownBook(request, url, params.id, getClientAddress());
    if ('response' in found) return found.response;
    const { book, caller } = found;
    const limit = limiter.take(caller);
    if (!limit.allowed) return json({ error: 'Too many requests. Try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } });

    if (action === 'search') {
        const keyword = url.searchParams.get('keyword') || '';
        if (!keyword) return fail(400, 'A keyword is required.');
        return json({ results: searchPages(book.markdown_content || '', keyword) });
    }
    if (action === 'get') {
        const pages = dbPages(book.markdown_content || '').map((markdown, n) => ({ page: n + 1, markdown }));
        if (!url.searchParams.has('page')) return json({ pages, count: pages.length });
        const one = pages[Number(url.searchParams.get('page')) - 1];
        return one ? json(one) : fail(404, 'No such page.');
    }

    const body = action === 'delete' ? '' : await request.text();
    if (body.length > 200_000) return fail(413, 'The body is too large.');
    if (action === 'add') return save(book.id, (md) => addPage(md, body));
    const page = Number(url.searchParams.get('page'));
    if (!Number.isInteger(page) || page < 1) return fail(400, 'A page number is required.');
    if (action === 'delete') return save(book.id, (md) => deletePage(md, page));
    // A field is named by a parameter of its own: ?action=update&page=3&input(2)
    const selector = [...url.searchParams.keys()].find((k) => parseFieldSelector(k));
    if (selector) return save(book.id, (md) => updateField(md, page, selector, body));
    return save(book.id, (md) => updatePage(md, page, body));
};

const handle: RequestHandler = async (event) => {
    const response = await run(event);
    for (const [k, v] of Object.entries(CORS)) response.headers.set(k, v);
    return response;
};

// The preflight a sandboxed iframe (or any other origin) sends before PATCH / DELETE or a custom header
export const OPTIONS: RequestHandler = async () => new Response(null, { status: 204, headers: CORS });
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
