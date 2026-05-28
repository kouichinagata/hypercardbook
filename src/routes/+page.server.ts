import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    const supabase = locals.supabase;
    const session = locals.session;

    const { data: books, error } = await supabase
        .from('books')
        .select('id, slug, title, author, cover_image, theme_color, user_id')
        .order('slug', { ascending: true });

    if (error) {
        console.error('Failed to fetch books from Supabase:', error);
        return {
            books: [],
            currentUserId: session?.user?.id || null
        };
    }

    const formattedBooks = (books || []).map(b => ({
        id: b.id,
        slug: b.slug,
        title: b.title,
        author: b.author,
        coverImage: b.cover_image,
        themeColor: b.theme_color,
        userId: b.user_id
    }));

    return {
        books: formattedBooks,
        currentUserId: session?.user?.id || null
    };
};
