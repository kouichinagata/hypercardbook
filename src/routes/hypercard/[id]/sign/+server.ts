import { certificateIssuance } from '$lib/server/certificates';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminClient, applySignature } from '$lib/server/signatures';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findBook(id: string) {
    const admin = adminClient();
    const query = admin.from('books').select('id, user_id, version, slug');
    const { data } = await (UUID.test(id) ? query.eq('id', id) : query.eq('slug', id)).maybeSingle();
    return { admin, book: data as { id: string; user_id: string; version: number; slug?: string } | null };
}

// Whoever has the card's link can sign its your / MarkdownAIVerify slots, logged in or not. `my` is the owner's.
export const GET: RequestHandler = async ({ params, locals }) => {
    const { admin, book } = await findBook(params.id);
    if (!book) return json({ error: 'Not found' }, { status: 404 });
    const certificate = book.slug?.startsWith('certificate-') ? Boolean(await certificateIssuance(admin, book.id)) : false;
    return json({ certificate, bookId: book.id, version: book.version, isOwner: locals.session?.user.id === book.user_id });
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
    const { admin, book } = await findBook(params.id);
    if (!book) return json({ error: 'Not found' }, { status: 404 });
    const { slot, kind, baseVersion, svg } = await request.json();
    const userId = locals.session?.user.id;
    const actor = userId && userId === book.user_id ? ({ type: 'owner', userId } as const) : ({ type: 'guest', name: null } as const);
    const outcome = await applySignature(admin, { bookId: book.id, slot, kind, baseVersion, svg, actor });
    return outcome.ok ? json(outcome) : json({ error: outcome.error }, { status: outcome.status });
};
