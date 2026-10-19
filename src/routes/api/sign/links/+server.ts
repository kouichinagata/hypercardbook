import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminClient, createSignLink } from '$lib/server/signatures';

// Issue (or re-issue) the sign link of one of your own documents
export const POST: RequestHandler = async ({ request, locals, url }) => {
    const userId = locals.session?.user.id;
    if (!userId) return json({ error: 'Unauthorized' }, { status: 401 });
    const { bookId } = await request.json();
    const admin = adminClient();
    const { data: book } = await admin.from('books').select('id, user_id').eq('id', String(bookId ?? '')).maybeSingle();
    if (!book || book.user_id !== userId) return json({ error: 'Not your document.' }, { status: 403 });
    const { token, expiresAt } = await createSignLink(admin, book.id, userId);
    return json({ url: `${url.origin}/sign/${token}`, expiresAt });
};
