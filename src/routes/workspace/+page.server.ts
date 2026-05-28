import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ url, locals }) => {
    const bookId = url.searchParams.get('id');
    const supabase = locals.supabase;

    if (!bookId) {
        return {
            markdown: '',
            bookId: null,
            initialChatHistory: []
        };
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookId);

    const bookQuery = supabase.from('books').select('id, markdown_content');
    if (isUuid) {
        bookQuery.eq('id', bookId);
    } else {
        bookQuery.eq('slug', bookId);
    }

    const { data: book, error: dbError } = await bookQuery.single();

    if (dbError || !book) {
        console.error(`Workspace: Book not found for ID/slug "${bookId}":`, dbError);
        throw error(404, { message: 'Book not found' });
    }

    // Fetch chat history
    const { data: messages, error: chatError } = await supabase
        .from('chat_messages')
        .select('role, text')
        .eq('book_id', book.id)
        .order('created_at', { ascending: true });

    if (chatError) {
        console.error('Failed to fetch chat history:', chatError);
    }

    return {
        markdown: book.markdown_content,
        bookId: book.id,
        initialChatHistory: messages || []
    };
};
