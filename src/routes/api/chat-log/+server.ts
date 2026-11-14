import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Saves a result message that the browser shows after a drawing / editing job (e.g. "🎨 Drawn 0/1 … Blocked by the image safety filter").
// /api/generate saves only the user's prompt and the AI's reply, so without this the result is lost when the page is reopened,
// and the AI no longer knows what was drawn or why it failed.
const MAX_TEXT = 20_000;

export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        const session = locals.session;
        if (!session) return json({ error: 'Unauthorized. Please login first.' }, { status: 401 });
        const { bookId, text } = await request.json();
        const message = String(text ?? '').trim().slice(0, MAX_TEXT);
        if (typeof bookId !== 'string' || !bookId || !message) return json({ error: 'bookId and text are required.' }, { status: 400 });

        const supabase = locals.supabase;
        const { data: book } = await supabase
            .from('books')
            .select('id')
            .eq('id', bookId)
            .eq('user_id', session.user.id)
            .single();
        if (!book) return json({ error: 'Book not found.' }, { status: 404 });

        const { error } = await supabase.from('chat_messages').insert({ book_id: bookId, role: 'model', text: message });
        if (error) throw error;
        return json({ success: true });
    } catch (err: any) {
        console.error('[Chat-Log Error]:', err);
        return json({ error: err?.message || 'Could not save the chat message.' }, { status: 500 });
    }
};
