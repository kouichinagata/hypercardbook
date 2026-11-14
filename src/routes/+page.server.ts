import { isCardLike } from '$lib/play-mode';
import type { PageServerLoad } from './$types';
import { biographySlug, ensureBiographyBook } from '$lib/server/biography';

const SAMPLE_STACK_ID = 'c9ee4774-d099-41a1-b1e7-b42f7a2b4c68';
const OWN_BOOK_COLUMNS = 'id, slug, title, author, cover_image, theme_color, user_id, markdown_content, updated_at, is_public';

// Reads the top-level keys of a book's YAML frontmatter that the shelf needs.
function parseShelfFrontmatter(markdown: string) {
    const fm = {
        playMode: 'book',
        subTitle: '',
        launchUrl: '',
        paperoboSlug: '',
        paperoboAgentId: '',
        paperoboPublicId: '',
        hyperbookId: '',
        description: '',
        hideHyperbook: false,
        sourceApp: ''
    };
    const fmMatch = markdown.match(/^---\s*([\s\S]*?)\s*---/);
    if (!fmMatch) return fm;
    for (const line of fmMatch[1].split('\n')) {
        if (/^\s/.test(line)) continue;
        const parts = line.split(':');
        if (parts.length < 2) continue;
        const k = parts[0].trim();
        const v = parts.slice(1).join(':').trim();
        if (k === 'play_mode') fm.playMode = v;
        if (k === 'sub_title') fm.subTitle = v;
        if (k === 'launch_url') fm.launchUrl = v;
        if (k === 'paperobo_slug') fm.paperoboSlug = v;
        if (k === 'paperobo_agent_id') fm.paperoboAgentId = v;
        if (k === 'paperobo_public_id') fm.paperoboPublicId = v;
        if (k === 'hyperbook_id') fm.hyperbookId = v;
        if (k === 'description') fm.description = v.replace(/^["']|["']$/g, '');
        if (k === 'hide_hyperbook') fm.hideHyperbook = v === 'true';
        if (k === 'source_app') fm.sourceApp = v;
    }
    return fm;
}

function toShelfBook(b: any, extra: Record<string, unknown>, own = false) {
    const markdown = b.markdown_content || '';
    const fm = parseShelfFrontmatter(markdown);
    const isCard = isCardLike(fm.playMode);
    return {
        id: b.id,
        slug: b.slug,
        title: b.title,
        author: b.author,
        coverImage: b.cover_image,
        themeColor: b.theme_color || (isCard ? 'white' : 'black'),
        userId: b.user_id,
        ...(own ? { isPublic: b.is_public === true } : {}),
        isCard,
        isMiniApp: fm.playMode === 'miniapp',
        isStack: fm.playMode === 'stack',
        playMode: fm.playMode,
        launchUrl: fm.launchUrl,
        paperoboSlug: fm.paperoboSlug,
        ...(own ? { paperoboAgentId: fm.paperoboAgentId, paperoboPublicId: fm.paperoboPublicId } : {}),
        hyperbookId: fm.hyperbookId,
        subTitle: fm.subTitle,
        description: fm.description,
        hideHyperbook: fm.hideHyperbook,
        sourceApp: fm.sourceApp,
        ...extra,
        markdownContent: markdown
    };
}

async function loadOwnBooks(supabase: any, session: any) {
    const userId = session.user.id;
    const fetchBooks = () => supabase
        .from('books')
        .select(OWN_BOOK_COLUMNS)
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

    let { data: books, error } = await fetchBooks();
    // Every user has one Biography book; create it on first visit (idempotent, best effort).
    if (!error && books && !books.some((b: any) => b.slug === biographySlug(userId))) {
        await ensureBiographyBook(supabase, userId, session.user.user_metadata || {});
        ({ data: books, error } = await fetchBooks());
    }
    if (error) {
        console.error('Failed to fetch books from Supabase:', error);
        return [];
    }
    return (books || []).map((b: any) => toShelfBook(b, {}, true));
}

// Sample books come from the public stack 'HyperCardBook Samples', in that stack's order.
async function loadSampleBooks(supabase: any) {
    try {
        const { data: stackData, error: stackError } = await supabase
            .from('books')
            .select('markdown_content')
            .eq('id', SAMPLE_STACK_ID)
            .single();
        if (stackError) {
            console.error('Failed to fetch sample stack from Supabase:', stackError);
            return [];
        }
        const linkedItems: { type: string; id: string }[] = [];
        for (const line of (stackData?.markdown_content || '').split('\n')) {
            const match = line.match(/-\s*\[.*?\]\((book|card|stack):([a-zA-Z0-9_\-]+)\)/);
            if (match) linkedItems.push({ type: match[1], id: match[2] });
        }
        if (linkedItems.length === 0) return [];

        const { data: rawLinkedBooks, error: linkedBooksError } = await supabase
            .from('books')
            .select('id, slug, title, author, cover_image, theme_color, user_id, markdown_content, created_at, updated_at')
            .in('id', linkedItems.map(item => item.id));
        if (linkedBooksError) {
            console.error('Failed to fetch linked books for sample stack:', linkedBooksError);
            return [];
        }
        const mapped = (rawLinkedBooks || []).map((b: any) => toShelfBook(b, { isSample: true }));
        return linkedItems.flatMap(item => mapped.filter((b: any) => b.id === item.id).slice(0, 1));
    } catch (err) {
        console.error('Failed to load dynamic sample books:', err);
        return [];
    }
}

async function loadQuarksChoice(supabase: any) {
    try {
        const { data: rawQuarks, error } = await supabase
            .from('books')
            .select('id, slug, title, author, cover_image, theme_color, user_id, markdown_content, created_at, updated_at, is_quark_choice, published_at')
            .eq('is_quark_choice', true)
            .order('published_at', { ascending: false }); // Newest (left) first
        if (error) {
            console.error('Failed to fetch Quark\'s Choice books from Supabase:', error);
            return [];
        }
        return (rawQuarks || []).map((b: any) => toShelfBook(b, { isQuarkChoice: true }));
    } catch (err) {
        console.error('Failed to load Quark\'s Choice books:', err);
        return [];
    }
}

// The shelf only shows titles and covers. Markdown bodies are kept only where the
// home page reads them: stacks (their item lists) and the books a HyperRobo shows in
// its split view. HyperRobo bodies are read on demand when one is published.
function dropUnneededMarkdown(books: any[]) {
    const referenced = new Set(books.filter(b => b.hyperbookId).map(b => b.hyperbookId));
    return books.map(b => {
        const keep = b.isStack || referenced.has(b.id) || referenced.has(b.slug);
        return keep ? b : { ...b, markdownContent: '' };
    });
}

async function loadShelfBooks(supabase: any, session: any) {
    const [own, samples, quarks] = await Promise.all([
        session?.user?.id ? loadOwnBooks(supabase, session) : Promise.resolve([]),
        loadSampleBooks(supabase),
        loadQuarksChoice(supabase)
    ]);
    return dropUnneededMarkdown([...own, ...samples, ...quarks]);
}

export const load: PageServerLoad = async ({ locals }) => {
    const books = loadShelfBooks(locals.supabase, locals.session);
    // Keep an unhandled rejection from crashing the server; the page handles the failure.
    books.catch(() => {});

    return {
        // Streamed: the page renders right away and shows a loading state until the shelf arrives.
        books,
        // Public books are intentionally loaded only when the user opens that shelf.
        publicBooks: [] as any[],
        hasMorePublic: true,
        currentUserId: locals.session?.user?.id || null
    };
};
