import { sharedDocument, shelfDocument } from '$lib/server/paperoboDocuments';
export const load = async ({ url, setHeaders }: any) => {
    setHeaders({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' });
    const row = await sharedDocument(url.searchParams.get('ticket') || '', 'cover');
    let paired = null;
    const book = shelfDocument(row);
    if (book.hideHyperbook && /^[a-zA-Z0-9_-]{1,200}$/.test(book.hyperbookId || '')) {
        // Only include a paired cover if it is itself accessible to the original selecting owner.
        const { documentClient } = await import('$lib/server/paperoboDocuments');
        const { data } = await documentClient().from('books').select('*').or(`id.eq.${book.hyperbookId},slug.eq.${book.hyperbookId}`).limit(1).maybeSingle();
        if (data && (data.user_id === row.user_id || data.is_public)) paired = shelfDocument(data);
    }
    return { books: paired ? [book,paired] : [book], id: book.id };
};
