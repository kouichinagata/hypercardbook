import { json, type RequestHandler } from '@sveltejs/kit';
import { PIXABAY_API_KEY } from '$env/static/private';

export const GET: RequestHandler = async ({ url }) => {
    const query = url.searchParams.get('q') || '';
    const page = url.searchParams.get('page') || '1';
    if (!query.trim()) {
        return json({ hits: [], totalHits: 0 });
    }

    if (!PIXABAY_API_KEY) {
        return json({ error: 'PIXABAY_API_KEY is not configured on the server.' }, { status: 500 });
    }

    try {
        // Query Pixabay using 'image_type=all' and support pagination
        const pixabayUrl = `https://pixabay.com/api/?key=${PIXABAY_API_KEY}&q=${encodeURIComponent(query)}&image_type=all&per_page=24&page=${page}`;
        const res = await fetch(pixabayUrl);
        
        if (!res.ok) {
            throw new Error(`Pixabay API responded with status ${res.status}`);
        }

        const data = await res.json();
        
        // Map to a clean, simple representation
        const hits = (data.hits || []).map((hit: any) => ({
            id: hit.id,
            previewUrl: hit.previewURL,
            webformatUrl: hit.webformatURL,
            largeImageUrl: hit.largeImageURL,
            tags: hit.tags
        }));

        return json({ hits, totalHits: data.totalHits || 0 });
    } catch (err: any) {
        console.error('Pixabay search error:', err);
        return json({ error: err.message || 'Pixabay search failed' }, { status: 500 });
    }
};
