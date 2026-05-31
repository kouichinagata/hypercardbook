import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    const supabase = locals.supabase;
    const session = locals.session;

    const { data: books, error } = await supabase
        .from('books')
        .select('id, slug, title, author, cover_image, theme_color, user_id, markdown_content')
        .order('slug', { ascending: true });

    if (error) {
        console.error('Failed to fetch books from Supabase:', error);
        return {
            books: [],
            currentUserId: session?.user?.id || null
        };
    }

    const formattedBooks = (books || []).map(b => {
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

        return {
            id: b.id,
            slug: b.slug,
            title: b.title,
            author: b.author,
            coverImage: b.cover_image,
            themeColor: b.theme_color || (isCard ? 'white' : 'black'),
            userId: b.user_id,
            isCard,
            subTitle
        };
    });

    return {
        books: formattedBooks,
        currentUserId: session?.user?.id || null
    };
};
