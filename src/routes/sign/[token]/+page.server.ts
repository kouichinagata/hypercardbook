import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { adminClient, resolveSignLink } from '$lib/server/signatures';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
    // The link is the credential: never cache it or leak it through the referrer
    setHeaders({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' });
    const admin = adminClient();
    const link = await resolveSignLink(admin, params.token);
    if (!link) throw error(404, 'This sign request link is invalid or has expired.');
    const { data: book } = await admin.from('books').select('markdown_content, version').eq('id', link.bookId).maybeSingle();
    if (!book) throw error(404, 'Document not found.');
    return { markdown: book.markdown_content as string, version: book.version as number, expiresAt: link.expiresAt };
};
