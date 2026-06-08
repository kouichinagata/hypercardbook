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
                    subTitle,
                    markdownContent: markdown
                };
            });
        }
    }

    // Load sample books from the static files
    const SAMPLE_FILES = ['sample001.md', 'sample002.md', 'sample003.md', 'sample004.md', 'sample005.md'];
    let sampleBooks: any[] = [];

    for (const filename of SAMPLE_FILES) {
        try {
            const res = await fetch(`/samples/${filename}`);
            if (!res.ok) continue;
            
            const content = await res.text();
            const fmMatch = content.match(/^---\s*([\s\S]*?)\s*---/);
            
            let id = filename.replace('.md', '');
            let title = '無題のサンプル';
            let author = '';
            let coverImage = '';
            let themeColor = '';
            let playMode = 'book';
            let subTitle = '';

            if (fmMatch) {
                const lines = fmMatch[1].split('\n');
                lines.forEach((line: string) => {
                    const parts = line.split(':');
                    if (parts.length >= 2) {
                        const k = parts[0].trim();
                        const v = parts.slice(1).join(':').trim();
                        if (k === 'title') title = v;
                        if (k === 'author') author = v;
                        if (k === 'cover_image') coverImage = v;
                        if (k === 'theme_color') themeColor = v;
                        if (k === 'play_mode') playMode = v;
                        if (k === 'sub_title') subTitle = v;
                    }
                });
            }

            const isCard = playMode === 'card';
            const isStack = playMode === 'stack';

            sampleBooks.push({
                id,
                slug: id,
                title,
                author,
                coverImage,
                themeColor: themeColor || (isCard ? 'white' : 'black'),
                userId: null,
                isCard,
                isStack,
                subTitle,
                isSample: true,
                markdownContent: content
            });
        } catch (err) {
            console.error(`Failed to fetch sample book ${filename}:`, err);
        }
    }

    return {
        books: [...formattedBooks, ...sampleBooks],
        currentUserId: session?.user?.id || null
    };
};
