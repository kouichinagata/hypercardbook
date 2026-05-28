import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        const { id } = await request.json();
        const session = locals.session;
        const supabase = locals.supabase;

        if (!session) {
            return json({ error: 'Unauthorized. Please login first.' }, { status: 401 });
        }

        if (!id) {
            return json({ error: 'No book ID provided.' }, { status: 400 });
        }

        const { error: dbError } = await supabase
            .from('books')
            .delete()
            .eq('id', id)
            .eq('user_id', session.user.id);

        if (dbError) {
            console.error('Database delete error:', dbError);
            return json({ error: dbError.message }, { status: 500 });
        }

        return json({ success: true });
    } catch (err: any) {
        console.error('Delete Book Error:', err);
        return json({ error: err.message || 'Failed to delete book.' }, { status: 500 });
    }
};
