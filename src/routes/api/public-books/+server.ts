import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
    try {
        const supabase = locals.supabase;
        const offset = parseInt(url.searchParams.get('offset') || '0', 10);
        const limit = parseInt(url.searchParams.get('limit') || '50', 10);

        // Fetch public books (ordered by published_at ASC)
        // We select limit + 1 records to easily determine if there are more pages
        const { data: rawBooks, error: dbError } = await supabase
            .from('books')
            .select('*')
            .eq('is_public', true)
            .order('published_at', { ascending: true })
            .range(offset, offset + limit);

        if (dbError) {
            console.error('Database fetch error:', dbError);
            return json({ error: dbError.message }, { status: 500 });
        }

        const hasMore = rawBooks.length > limit;
        const booksToReturn = hasMore ? rawBooks.slice(0, limit) : rawBooks;

        // Map database records to formatted book objects
        const formattedBooks = booksToReturn.map((b: any) => {
            let isStack = false;
            let playMode = 'book';
            let launchUrl = '';
            let paperoboSlug = '';
            let hyperbookId = '';
            let description = '';
            let hideHyperbook = false;
            let sourceApp = '';
            
            const fmMatch = b.markdown_content?.match(/^---\s*([\s\S]*?)\s*---/);
            if (fmMatch) {
                const lines = fmMatch[1].split('\n');
                lines.forEach((line: string) => {
                    const parts = line.split(':');
                    if (parts.length >= 2) {
                        const k = parts[0].trim();
                        const v = parts.slice(1).join(':').trim();
                        if (k === 'play_mode') playMode = v;
                        if (k === 'launch_url') launchUrl = v;
                        if (k === 'paperobo_slug') paperoboSlug = v;
                        if (k === 'hyperbook_id') hyperbookId = v;
                        if (k === 'description') description = v.replace(/^["']|["']$/g, '');
                        if (k === 'hide_hyperbook') hideHyperbook = v === 'true';
                        if (k === 'source_app') sourceApp = v;
                    }
                });
            }
            
            isStack = playMode === 'stack';
            const isCard = playMode === 'card';

            return {
                id: b.id,
                userId: b.user_id,
                slug: b.slug,
                title: b.title,
                author: b.author,
                coverImage: b.cover_image,
                themeColor: b.theme_color,
                markdownContent: b.markdown_content,
                createdAt: b.created_at,
                updatedAt: b.updated_at,
                isPublic: b.is_public,
                publishedAt: b.published_at,
                playMode,
                launchUrl,
                paperoboSlug,
                hyperbookId,
                description,
                hideHyperbook,
                sourceApp,
                isCard,
                isStack
            };
        });

        return json({ books: formattedBooks, hasMore });
    } catch (err: any) {
        console.error('Public books API error:', err);
        return json({ error: err.message || 'Failed to load public books.' }, { status: 500 });
    }
};
