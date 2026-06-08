import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
    const { userId, slug } = params;
    const supabase = locals.supabase;

    if (!userId || !slug) {
        throw error(400, 'Invalid request parameters.');
    }

    const storagePath = `${userId}/published/${slug}.html`;

    // Download the standalone HTML file from Supabase Storage
    const { data, error: downloadError } = await supabase.storage
        .from('HyperCardBookBucket')
        .download(storagePath);

    if (downloadError || !data) {
        console.error(`Failed to download published HTML from storage: ${storagePath}`, downloadError);
        throw error(404, 'Published book not found.');
    }

    try {
        const htmlText = await data.text();
        return new Response(htmlText, {
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-cache'
            }
        });
    } catch (err: any) {
        console.error('Failed to parse storage file content:', err);
        throw error(500, 'Failed to read book content.');
    }
};
