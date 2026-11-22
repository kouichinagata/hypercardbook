import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminClient, applyField, applySignature } from '$lib/server/signatures';
import { isTemplate } from '$lib/signature/contract';
import { documentSecret } from '$lib/server/paperoboDocuments';
import { verifyDocumentTicket } from '$lib/server/paperoboDocumentTicket';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findBook(id: string) {
    const admin = adminClient();
    const query = admin.from('books').select('id, user_id, version, slug');
    const { data } = await (UUID.test(id) ? query.eq('id', id) : query.eq('slug', id)).maybeSingle();
    return { admin, book: data as { id: string; user_id: string; version: number; slug?: string } | null };
}

/** Who opened the document from PapeRobo: the viewer in a valid preview ticket for this document, so a signature can be traced to a HyperCardBook user */
function ticketViewer(request: Request, bookId: string): string | undefined {
    const grant = verifyDocumentTicket(request.headers.get('x-paperobo-share') || '', documentSecret(), 'preview');
    return grant && grant.id === bookId ? grant.viewer : undefined;
}

// Whoever has the card's link can sign its your / MarkdownAIverify slots, logged in or not. `my` is the owner's.
export const GET: RequestHandler = async ({ params, locals }) => {
    const { book } = await findBook(params.id);
    if (!book) return json({ error: 'Not found' }, { status: 404 });
    return json({ bookId: book.id, version: book.version, isOwner: locals.session?.user.id === book.user_id });
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
    const { admin, book } = await findBook(params.id);
    if (!book) return json({ error: 'Not found' }, { status: 404 });
    const body = await request.json();
    const { slot, kind, baseVersion, svg, changeable, fields } = body;
    const userId = locals.session?.user.id;
    // A template is edited in the workspace only, even by its owner: here it can be tried but not filled or signed
    const { data: row } = await admin.from('books').select('markdown_content').eq('id', book.id).maybeSingle();
    if (isTemplate(row?.markdown_content || '')) return json({ error: 'Templates can only be edited in the workspace.' }, { status: 403 });
    // Form fields are for the person the card is handed to: anyone with the link fills them, logged in or not
    if (body.field) {
        const actor = userId && userId === book.user_id ? ({ type: 'owner', userId } as const) : ({ type: 'guest', name: null } as const);
        const done = await applyField(admin, { bookId: book.id, index: body.index, value: body.value, actor });
        return done.ok ? json(done) : json({ error: done.error }, { status: done.status });
    }
    const viewer = ticketViewer(request, book.id);
    const actor = userId && userId === book.user_id ? ({ type: 'owner', userId } as const) : ({ type: 'guest', name: null, ...(viewer ? { userId: viewer } : {}) } as const);
    const outcome = await applySignature(admin, { bookId: book.id, slot, kind, baseVersion, svg, changeable, fields, actor });
    return outcome.ok ? json(outcome) : json({ error: outcome.error }, { status: outcome.status });
};
