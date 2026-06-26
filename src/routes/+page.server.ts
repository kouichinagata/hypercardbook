import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, fetch }) => {
    const supabase = locals.supabase;
    const session = locals.session;

    let formattedBooks: any[] = [];

    // Query books from Supabase only if the user is logged in (session exists)
    if (session?.user?.id) {
        const { data: books, error } = await supabase
            .from('books')
            .select('id, slug, title, author, cover_image, theme_color, user_id, markdown_content, updated_at')
            .eq('user_id', session.user.id)
            .order('updated_at', { ascending: false });

        if (error) {
            console.error('Failed to fetch books from Supabase:', error);
        } else if (books) {
            formattedBooks = books.map(b => {
                const markdown = b.markdown_content || '';
                let playMode = 'book';
                let subTitle = '';
                let launchUrl = '';
                let paperoboSlug = '';
                let hyperbookId = '';
                let description = '';
                let hideHyperbook = false;

                const fmMatch = markdown.match(/^---\s*([\s\S]*?)\s*---/);
                if (fmMatch) {
                    const fmLines = fmMatch[1].split('\n');
                    fmLines.forEach((line: string) => {
                        const parts = line.split(':');
                        if (parts.length >= 2) {
                            const k = parts[0].trim();
                            const v = parts.slice(1).join(':').trim();
                            if (k === 'play_mode') playMode = v;
                            if (k === 'sub_title') subTitle = v;
                            if (k === 'launch_url') launchUrl = v;
                            if (k === 'paperobo_slug') paperoboSlug = v;
                            if (k === 'hyperbook_id') hyperbookId = v;
                            if (k === 'description') description = v.replace(/^["']|["']$/g, '');
                            if (k === 'hide_hyperbook') hideHyperbook = v === 'true';
                        }
                    });
                }

                const isCard = playMode === 'card';
                const isStack = playMode === 'stack';

                return {
                    id: b.id,
                    slug: b.slug,
                    title: b.title,
                    author: b.author,
                    coverImage: b.cover_image,
                    themeColor: b.theme_color || (isCard ? 'white' : 'black'),
                    userId: b.user_id,
                    isCard,
                    isStack,
                    playMode,
                    launchUrl,
                    paperoboSlug,
                    hyperbookId,
                    subTitle,
                    description,
                    hideHyperbook,
                    markdownContent: markdown
                };
            });
        }
    }

    // Load sample books dynamically from the public stack 'HyperCardBook Samples' (ID: c9ee4774-d099-41a1-b1e7-b42f7a2b4c68)
    let sampleBooks: any[] = [];
    try {
        // Fetch the stack book
        const { data: stackData, error: stackError } = await supabase
            .from('books')
            .select('markdown_content')
            .eq('id', 'c9ee4774-d099-41a1-b1e7-b42f7a2b4c68')
            .single();

        if (stackError) {
            console.error('Failed to fetch sample stack from Supabase:', stackError);
        } else if (stackData) {
            const markdown = stackData.markdown_content || '';
            // Parse linked book IDs and their playModes
            const linkedItems: { type: string; id: string }[] = [];
            const lines = markdown.split('\n');
            lines.forEach((line: string) => {
                const match = line.match(/-\s*\[.*?\]\((book|card|stack):([a-zA-Z0-9_\-]+)\)/);
                if (match) {
                    linkedItems.push({ type: match[1], id: match[2] });
                }
            });

            if (linkedItems.length > 0) {
                const targetIds = linkedItems.map(item => item.id);
                // Fetch the actual book details from Supabase
                const { data: rawLinkedBooks, error: linkedBooksError } = await supabase
                    .from('books')
                    .select('id, slug, title, author, cover_image, theme_color, user_id, markdown_content, created_at, updated_at')
                    .in('id', targetIds);

                if (linkedBooksError) {
                    console.error('Failed to fetch linked books for sample stack:', linkedBooksError);
                } else if (rawLinkedBooks) {
                    // Map details and parse YAML frontmatter for each linked book
                    const mappedBooks = rawLinkedBooks.map(b => {
                        const content = b.markdown_content || '';
                        let playMode = 'book';
                        let subTitle = '';
                        let launchUrl = '';
                        let paperoboSlug = '';
                        let hyperbookId = '';
                        let description = '';
                        let hideHyperbook = false;

                        const fmMatch = content.match(/^---\s*([\s\S]*?)\s*---/);
                        if (fmMatch) {
                            const fmLines = fmMatch[1].split('\n');
                            fmLines.forEach((line: string) => {
                                const parts = line.split(':');
                                if (parts.length >= 2) {
                                    const k = parts[0].trim();
                                    const v = parts.slice(1).join(':').trim();
                                    if (k === 'play_mode') playMode = v;
                                    if (k === 'sub_title') subTitle = v;
                                    if (k === 'launch_url') launchUrl = v;
                                    if (k === 'paperobo_slug') paperoboSlug = v;
                                    if (k === 'hyperbook_id') hyperbookId = v;
                                    if (k === 'description') description = v.replace(/^["']|["']$/g, '');
                                    if (k === 'hide_hyperbook') hideHyperbook = v === 'true';
                                }
                            });
                        }

                        const isCard = playMode === 'card';
                        const isStack = playMode === 'stack';

                        return {
                            id: b.id,
                            slug: b.slug,
                            title: b.title,
                            author: b.author,
                            coverImage: b.cover_image,
                            themeColor: b.theme_color || (isCard ? 'white' : 'black'),
                            userId: b.user_id,
                            isCard,
                            isStack,
                            playMode,
                            launchUrl,
                            paperoboSlug,
                            hyperbookId,
                            subTitle,
                            description,
                            hideHyperbook,
                            isSample: true, // Identify as a Sample Book for the front-end
                            markdownContent: content
                        };
                    });

                    // Sort the fetched books according to the original linkedItems order (Stack's order)
                    linkedItems.forEach(item => {
                        const found = mappedBooks.find(b => b.id === item.id);
                        if (found) {
                            sampleBooks.push(found);
                        }
                    });
                }
            }
        }
    } catch (err) {
        console.error('Failed to load dynamic sample books:', err);
    }

    // Load 'Quark\'s Choice' dynamically from Supabase (id/slug: hypercardbook-oss-launch)
    let quarksChoiceBooks: any[] = [];
    try {
        const { data: b, error: dbError } = await supabase
            .from('books')
            .select('id, slug, title, author, cover_image, theme_color, user_id, markdown_content, created_at, updated_at')
            .eq('id', 'hypercardbook-oss-launch')
            .single();

        let bookData = b;
        if (dbError || !b) {
            // Fallback to checking by slug in case 'hypercardbook-oss-launch' is a slug
            const { data: bBySlug, error: slugError } = await supabase
                .from('books')
                .select('id, slug, title, author, cover_image, theme_color, user_id, markdown_content, created_at, updated_at')
                .eq('slug', 'hypercardbook-oss-launch')
                .single();
            if (!slugError && bBySlug) {
                bookData = bBySlug;
            }
        }

        if (bookData) {
            const content = bookData.markdown_content || '';
            let playMode = 'book';
            let subTitle = '';
            let launchUrl = '';
            let paperoboSlug = '';
            let hyperbookId = '';
            let description = '';
            let hideHyperbook = false;

            const fmMatch = content.match(/^---\s*([\s\S]*?)\s*---/);
            if (fmMatch) {
                const fmLines = fmMatch[1].split('\n');
                fmLines.forEach((line: string) => {
                    const parts = line.split(':');
                    if (parts.length >= 2) {
                        const k = parts[0].trim();
                        const v = parts.slice(1).join(':').trim();
                        if (k === 'play_mode') playMode = v;
                        if (k === 'sub_title') subTitle = v;
                        if (k === 'launch_url') launchUrl = v;
                        if (k === 'paperobo_slug') paperoboSlug = v;
                        if (k === 'hyperbook_id') hyperbookId = v;
                        if (k === 'description') description = v.replace(/^["']|["']$/g, '');
                        if (k === 'hide_hyperbook') hideHyperbook = v === 'true';
                    }
                });
            }

            const isCard = playMode === 'card';
            const isStack = playMode === 'stack';

            quarksChoiceBooks.push({
                id: bookData.id,
                slug: bookData.slug,
                title: bookData.title,
                author: bookData.author,
                coverImage: bookData.cover_image,
                themeColor: bookData.theme_color || (isCard ? 'white' : 'black'),
                userId: bookData.user_id,
                isCard,
                isStack,
                playMode,
                launchUrl,
                paperoboSlug,
                hyperbookId,
                subTitle,
                description,
                hideHyperbook,
                isQuarkChoice: true, // Identify as Quark's Choice for the front-end
                markdownContent: content
            });
        }
    } catch (err) {
        console.error('Failed to load Quark\'s Choice book:', err);
    }

    // Fetch initial 50 public books (ordered by published_at ASC)
    let publicBooks: any[] = [];
    let hasMorePublic = false;

    const { data: rawPublicBooks, error: publicDbError } = await supabase
        .from('books')
        .select('id, slug, title, author, cover_image, theme_color, user_id, markdown_content, created_at, updated_at, is_public, published_at')
        .eq('is_public', true)
        .order('published_at', { ascending: true })
        .range(0, 50);

    if (publicDbError) {
        console.error('Failed to fetch public books from Supabase:', publicDbError);
    } else if (rawPublicBooks) {
        hasMorePublic = rawPublicBooks.length > 50;
        const booksToReturn = hasMorePublic ? rawPublicBooks.slice(0, 50) : rawPublicBooks;

        publicBooks = booksToReturn.map(b => {
            const markdown = b.markdown_content || '';
            let playMode = 'book';
            let subTitle = '';
            let launchUrl = '';
            let paperoboSlug = '';
            let hyperbookId = '';
            let description = '';
            let hideHyperbook = false;

            const fmMatch = markdown.match(/^---\s*([\s\S]*?)\s*---/);
            if (fmMatch) {
                const fmLines = fmMatch[1].split('\n');
                fmLines.forEach((line: string) => {
                    const parts = line.split(':');
                    if (parts.length >= 2) {
                        const k = parts[0].trim();
                        const v = parts.slice(1).join(':').trim();
                        if (k === 'play_mode') playMode = v;
                        if (k === 'sub_title') subTitle = v;
                        if (k === 'launch_url') launchUrl = v;
                        if (k === 'paperobo_slug') paperoboSlug = v;
                        if (k === 'hyperbook_id') hyperbookId = v;
                        if (k === 'description') description = v.replace(/^["']|["']$/g, '');
                        if (k === 'hide_hyperbook') hideHyperbook = v === 'true';
                    }
                });
            }

            const isCard = playMode === 'card';
            const isStack = playMode === 'stack';

            return {
                id: b.id,
                slug: b.slug,
                title: b.title,
                author: b.author,
                coverImage: b.cover_image,
                themeColor: b.theme_color || (isCard ? 'white' : 'black'),
                userId: b.user_id,
                isCard,
                isStack,
                playMode,
                launchUrl,
                paperoboSlug,
                hyperbookId,
                subTitle,
                description,
                hideHyperbook,
                markdownContent: markdown,
                createdAt: b.created_at,
                updatedAt: b.updated_at,
                isPublic: b.is_public,
                publishedAt: b.published_at
            };
        });
    }

    return {
        books: [...formattedBooks, ...sampleBooks, ...quarksChoiceBooks],
        publicBooks,
        hasMorePublic,
        currentUserId: session?.user?.id || null
    };
};
