import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminClient } from '$lib/server/signatures';
import { userForApiKey } from '$lib/server/api-keys';
import { isCardMarkdown } from '$lib/play-mode';
import { addPage, dbPages, deletePage, parseFieldSelector, searchPages, updateField, updatePage, type DbResult } from '$lib/hyperbook-db';

// HyperBook DB HTTP Request API: add / delete / search / update the pages of the owner's HyperBook.
//   POST   ?action=add                    body: Markdown of the new page (template: field values)
//   DELETE ?action=delete&page=3
//   GET    ?action=search&keyword=Yamada
//   PATCH  ?action=update&page=3          body: Markdown of the page (template: field values)
//   PATCH  ?action=update&page=3&input(2) body: {{MarkdownAIinput=Sales}}
// Authorization: Bearer <the owner's API key>. Body: text/markdown; charset=utf-8.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METHOD: Record<string, string> = { add: 'POST', delete: 'DELETE', search: 'GET', update: 'PATCH' };
const fail = (status: number, error: string) => json({ error }, { status });

type Book = { id: string; user_id: string; markdown_content: string | null; version: number };

async function ownBook(request: Request, id: string): Promise<{ book: Book } | { response: Response }> {
    const admin = adminClient();
    const userId = await userForApiKey(admin, request.headers.get('authorization'));
    if (!userId) return { response: fail(401, 'A valid API key is required.') };
    const query = admin.from('books').select('id, user_id, markdown_content, version');
    const { data } = await (UUID.test(id) ? query.eq('id', id) : query.eq('slug', id)).maybeSingle();
    if (!data) return { response: fail(404, 'Book not found.') };
    if (data.user_id !== userId) return { response: fail(403, 'Not your book.') };
    if (isCardMarkdown(data.markdown_content)) return { response: fail(400, 'This document is not a HyperBook.') };
    return { book: data as Book };
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

const handle: RequestHandler = async ({ params, request, url }) => {
    const action = url.searchParams.get('action') || '';
    if (!METHOD[action]) return fail(400, 'Unknown action.');
    if (request.method !== METHOD[action]) return fail(405, `Use ${METHOD[action]} for action=${action}.`);
    const found = await ownBook(request, params.id);
    if ('response' in found) return found.response;
    const { book } = found;

    if (action === 'search') {
        const keyword = url.searchParams.get('keyword') || '';
        if (!keyword) return fail(400, 'A keyword is required.');
        return json({ results: searchPages(book.markdown_content || '', keyword) });
    }

    const body = action === 'delete' ? '' : await request.text();
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
