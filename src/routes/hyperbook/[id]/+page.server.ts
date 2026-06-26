import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';

export const load: PageServerLoad = async ({ params, locals, url, fetch }) => {
    const { id } = params;
    const supabase = locals.supabase;
    const booksParam = url.searchParams.get('books');
    const titleParam = url.searchParams.get('title');
    const logoParam = url.searchParams.get('logo');
    const fromParam = url.searchParams.get('from');

    let markdownContent = '';
    let ownerId = 'global';

    // Check if the book ID matches a file in the 'samples' directory (sample books)
    const sampleFilename = id.endsWith('.md') ? id : `${id}.md`;
    const res = await fetch(`/samples/${sampleFilename}`);
    
    if (res.ok) {
        try {
            markdownContent = await res.text();
        } catch (err) {
            console.error(`Failed to read fetched sample file ${sampleFilename}:`, err);
            throw error(500, { message: 'Failed to read sample file' });
        }
    } else if (booksParam) {
        // 1. If books parameter is specified in the URL, load directly from filesystem, bypass DB
        const booksDir = path.resolve('static/books');
        const filename = id.endsWith('.md') ? id : `${id}.md`;
        const filePath = path.join(booksDir, filename);

        if (fs.existsSync(filePath)) {
            try {
                markdownContent = fs.readFileSync(filePath, 'utf-8');
            } catch (err) {
                console.error(`Failed to read file ${filename}:`, err);
                throw error(500, { message: 'Failed to read book file' });
            }
        } else {
            // Fallback to database lookup if filesystem file does not exist
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
            const query = supabase.from('books').select('markdown_content, user_id');
            if (isUuid) {
                query.eq('id', id);
            } else {
                query.eq('slug', id);
            }

            const { data, error: dbError } = await query.single();

            if (dbError || !data) {
                console.error(`Book not found in DB or file for "${id}":`, dbError);
                throw error(404, { message: 'Book file not found' });
            }
            markdownContent = data.markdown_content;
            ownerId = data.user_id || 'global';
        }
    } else {
        // 2. Otherwise, query Supabase database as usual
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        const query = supabase.from('books').select('markdown_content, user_id');
        if (isUuid) {
            query.eq('id', id);
        } else {
            query.eq('slug', id);
        }

        const { data, error: dbError } = await query.single();

        if (dbError || !data) {
            console.error(`Book not found in DB for ID/slug "${id}":`, dbError);
            throw error(404, { message: 'Book not found' });
        }
        markdownContent = data.markdown_content;
        ownerId = data.user_id || 'global';
    }

        // Check if markdown is actually a "Card" instead of a "Book"
        const isCard = markdownContent.includes('play_mode: card') || (!markdownContent.includes('play_mode: book') && !/Page\s*\d+:/i.test(markdownContent) && !/(?:^|\n)\s*\*\*\*\s*(?:\n|$)/.test(markdownContent));
        if (isCard) {
            const redirectParams = new URLSearchParams(url.searchParams);
            throw redirect(302, `/hypercard/${id}?${redirectParams.toString()}`);
        }

        // Compute back URL with query parameters
        let backUrl = '/';
        if (fromParam === 'hyperbookshelf') {
            const backParams = new URLSearchParams();
            if (booksParam) backParams.set('books', booksParam);
            if (titleParam) backParams.set('title', titleParam);
            if (logoParam) backParams.set('logo', logoParam);
            const queryStr = backParams.toString();
            backUrl = queryStr ? `/hyperbookshelf?${queryStr}` : '/hyperbookshelf';
        }

        const isEmbed = url.searchParams.get('embed') === 'true';
        return {
            markdown: markdownContent,
            id,
            backUrl,
            isEmbed,
            currentUserId: ownerId
        };
};
