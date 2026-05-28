import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
    const { id } = params;
    const supabase = locals.supabase;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    const query = supabase.from('books').select('markdown_content');
    if (isUuid) {
        query.eq('id', id);
    } else {
        query.eq('slug', id);
    }

    const { data, error: dbError } = await query.single();

    if (dbError || !data) {
        console.error(`Book not found for ID/slug "${id}":`, dbError);
        throw error(404, {
            message: 'Book not found'
        });
    }

    return {
        markdown: data.markdown_content
    };
};
