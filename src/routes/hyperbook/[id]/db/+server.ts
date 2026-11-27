import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminClient } from '$lib/server/signatures';
import { userForApiKey } from '$lib/server/api-keys';
import { isCardMarkdown } from '$lib/play-mode';
import { createRateLimiter } from '$lib/server/rate-limit';
import { addPage, dbPages, deletePage, linkedDb, parseFieldSelector, refererCard, searchPages, updateField, updatePage, type DbResult } from '$lib/hyperbook-db';

// HyperBook DB HTTP Request API: add / delete / search / update the pages of the owner's HyperBook.
//   POST   ?action=add                    body: Markdown of the new page (template: field values)
//   DELETE ?action=delete&page=3
//   GET    ?action=search&keyword=Yamada
//   PATCH  ?action=update&page=3          body: Markdown of the page (template: field values)
//   PATCH  ?action=update&page=3&input(2) body: {{MarkdownAIinput=Sales}}
// Who may call it:
//   - the owner's own card: a card whose frontmatter has `hyperbook_db: <this book>`, with the same owner as the book.
//     The card is the page the request comes from (its Referer on the same host), so no key is in the card.
//   - an outside program: Authorization: Bearer <the owner's API key>.
// Body: text/markdown; charset=utf-8.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METHOD: Record<string, string> = { add: 'POST', delete: 'DELETE', search: 'GET', update: 'PATCH' };
const fail = (status: number, error: string) => json({ error }, { status });
// Per caller (API key, or the card and the client address), per minute
const limiter = createRateLimiter(120, 60_000);

type Book = { id: string; user_id: string; markdown_content: string | null; version: number };

async function findRow(admin: ReturnType<typeof adminClient>, id: string) {
    const query = admin.from('books').select('id, slug, user_id, markdown_content, version');
    const { data } = await (UUID.test(id) ? query.eq('id', id) : query.eq('slug', id)).maybeSingle();
    return data as (Book & { slug: string | null }) | null;
}

/** The book, when the caller is its owner (API key) or the owner's card linked to it; the caller names the rate-limit bucket */
async function ownBook(request: Request, url: URL, id: string, client: string): Promise<{ book: Book; caller: string } | { response: Response }> {
    const admin = adminClient();
    const book = await findRow(admin, id);
    const authorization = request.headers.get('authorization');
    let userId: string | null = null;
    let caller = '';
    if (authorization) {
        userId = await userForApiKey(admin, authorization);
        if (!userId) return { response: fail(401, 'A valid API key is required.') };
        caller = `key:${userId}`;
    } else {
        const ref = refererCard(request.headers.get('referer'), url);
        const card = ref ? await findRow(admin, ref) : null;
        const linked = card && isCardMarkdown(card.markdown_content) ? linkedDb(card.markdown_content || '') : null;
        if (!card || !linked || !book || (linked !== book.id && linked !== book.slug)) {
            return { response: fail(401, 'Use this from a card linked to this book (hyperbook_db in its frontmatter), or send an API key.') };
        }
        userId = card.user_id;
        caller = `card:${card.id}:${client}`;
    }
    if (!book) return { response: fail(404, 'Book not found.') };
    if (book.user_id !== userId) return { response: fail(403, 'Not your book.') };
    if (isCardMarkdown(book.markdown_content)) return { response: fail(400, 'This document is not a HyperBook.') };
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

const handle: RequestHandler = async ({ params, request, url, getClientAddress }) => {
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

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
