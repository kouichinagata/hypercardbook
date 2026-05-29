import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        const { markdown, id } = await request.json();
        const session = locals.session;
        const supabase = locals.supabase;

        if (!session) {
            return json({ error: 'Unauthorized. Please login first.' }, { status: 401 });
        }

        if (!markdown) {
            return json({ error: 'No markdown content provided.' }, { status: 400 });
        }

        let slug = '';
        let title = '無題の書籍';
        let author = '';
        let coverImage = '';
        let themeColor = 'black';

        const fmMatch = markdown.match(/^---\s*([\s\S]*?)\s*---/);
        if (fmMatch) {
            const fmLines = fmMatch[1].split('\n');
            fmLines.forEach((line: string) => {
                const parts = line.split(':');
                if (parts.length >= 2) {
                    const k = parts[0].trim();
                    const v = parts.slice(1).join(':').trim();
                    if (k === 'id') slug = v.replace(/[^a-zA-Z0-9-_]/g, '');
                    if (k === 'title') title = v;
                    if (k === 'author') author = v;
                    if (k === 'cover_image') coverImage = v;
                    if (k === 'theme_color') themeColor = v;
                }
            });
        }

        const bookData: any = {
            user_id: session.user.id,
            title,
            author: author || null,
            cover_image: coverImage || null,
            theme_color: themeColor || 'black',
            markdown_content: markdown
        };

        if (id) {
            bookData.id = id;
            // Fetch existing slug to prevent overwriting with timestamp
            const { data: existingBook } = await supabase
                .from('books')
                .select('slug')
                .eq('id', id)
                .single();

            if (existingBook) {
                bookData.slug = slug || existingBook.slug;
            } else {
                bookData.slug = slug || `book-${Date.now()}`;
            }
        } else {
            bookData.slug = slug || `book-${Date.now()}`;
        }

        const { data, error: dbError } = await supabase
            .from('books')
            .upsert(bookData)
            .select('id')
            .single();

        if (dbError) {
            console.error('Database save error:', dbError);
            return json({ error: dbError.message }, { status: 500 });
        }

        return json({ success: true, id: data.id });
    } catch (err: any) {
        console.error('Save API Error:', err);
        return json({ error: err.message || 'Failed to save book.' }, { status: 500 });
    }
};
