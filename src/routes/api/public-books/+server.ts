import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const PUBLIC_BOOK_COLUMNS =
    'id, user_id, slug, title, author, cover_image, theme_color, markdown_content, created_at, updated_at, is_public, published_at, ddc_code';
const FETCH_BATCH_SIZE = 1000;

export const GET: RequestHandler = async ({ url, locals }) => {
    try {
        const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0);
        const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '100', 10) || 100));
        const type = url.searchParams.get('type') || 'all';
        const ddc = (url.searchParams.get('ddc') || '').trim();
        const titleKeyword = normalizeSearchText(url.searchParams.get('title') || '');
        const authorKeyword = normalizeSearchText(url.searchParams.get('author') || '');
        const rawBooks: any[] = [];

        for (let batchOffset = 0; ; batchOffset += FETCH_BATCH_SIZE) {
            const { data: batch, error } = await locals.supabase
                .from('books')
                .select(PUBLIC_BOOK_COLUMNS)
                .eq('is_public', true)
                .order('published_at', { ascending: false, nullsFirst: false })
                .order('id', { ascending: false })
                .range(batchOffset, batchOffset + FETCH_BATCH_SIZE - 1);

            if (error) {
                console.error('Database fetch error:', error);
                return json({ error: error.message }, { status: 500 });
            }

            rawBooks.push(...(batch || []));
            if (!batch || batch.length < FETCH_BATCH_SIZE) break;
        }

        const matchingBooks = rawBooks
            .map(formatPublicBook)
            .filter((book) => matchesPublicBookType(book, type))
            .filter((book) => !ddc || book.ddcCode.startsWith(ddc))
            .filter((book) => !titleKeyword || normalizeSearchText(book.title).includes(titleKeyword))
            .filter((book) => !authorKeyword || normalizeSearchText(book.author).includes(authorKeyword));
        const books = matchingBooks.slice(offset, offset + limit);

        return json({
            books,
            hasMore: offset + books.length < matchingBooks.length,
            total: matchingBooks.length
        });
    } catch (err: any) {
        console.error('Public books API error:', err);
        return json({ error: err.message || 'Failed to load public books.' }, { status: 500 });
    }
};

function formatPublicBook(book: any) {
    let playMode = 'book';
    let launchUrl = '';
    let paperoboSlug = '';
    let hyperbookId = '';
    let description = '';
    let hideHyperbook = false;
    let sourceApp = '';
    const markdownContent = book.markdown_content || '';
    const frontmatter = markdownContent.match(/^---\s*([\s\S]*?)\s*---/);

    if (frontmatter) {
        for (const line of frontmatter[1].split('\n')) {
            const parts = line.split(':');
            if (parts.length < 2) continue;
            const key = parts[0].trim();
            const value = parts.slice(1).join(':').trim();
            if (key === 'play_mode') playMode = value;
            if (key === 'launch_url') launchUrl = value;
            if (key === 'paperobo_slug') paperoboSlug = value;
            if (key === 'hyperbook_id') hyperbookId = value;
            if (key === 'description') description = value.replace(/^["']|["']$/g, '');
            if (key === 'hide_hyperbook') hideHyperbook = value === 'true';
            if (key === 'source_app') sourceApp = value;
        }
    }

    return {
        id: book.id,
        userId: book.user_id,
        slug: book.slug,
        title: book.title || '',
        author: book.author || '',
        coverImage: book.cover_image,
        themeColor: book.theme_color,
        markdownContent,
        createdAt: book.created_at,
        updatedAt: book.updated_at,
        isPublic: book.is_public,
        publishedAt: book.published_at,
        playMode,
        launchUrl,
        paperoboSlug,
        hyperbookId,
        description,
        hideHyperbook,
        sourceApp,
        isCard: playMode === 'card',
        isStack: playMode === 'stack',
        isAiLiveBook: /(?:^|\n)ai_live_book:\s*true\s*(?:\n|$)/i.test(markdownContent),
        isGraphicBook: /(?:^|\n)\s*(?:layout|mode|page_mode):\s*(fill|full)\s*(?:\n|$)/i.test(markdownContent),
        ddcCode: book.ddc_code || ''
    };
}

function matchesPublicBookType(book: ReturnType<typeof formatPublicBook>, type: string) {
    if (type === 'book') {
        return !book.isCard && book.playMode !== 'paperobo' && book.playMode !== 'hyperrobo' &&
            book.playMode !== 'stack' && book.sourceApp !== 'hypertv';
    }
    if (type === 'graphic') return book.isGraphicBook;
    if (type === 'ai_live') return book.isAiLiveBook;
    if (type === 'paperobo') return book.playMode === 'paperobo';
    if (type === 'hyperrobo') return book.playMode === 'hyperrobo';
    if (type === 'hypertv') return book.sourceApp === 'hypertv';
    if (type === 'card') return book.isCard;
    return true;
}

function normalizeSearchText(value: unknown) {
    return String(value || '').normalize('NFKC').toLocaleLowerCase();
}
