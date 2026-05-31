import type { PageServerLoad } from './$types';
import fs from 'fs';
import path from 'path';

export const load: PageServerLoad = async ({ locals }) => {
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
        }
    }

    // Load sample books from the 'samples' directory
    const samplesDir = path.resolve('samples');
    let sampleBooks: any[] = [];
    if (fs.existsSync(samplesDir)) {
        try {
            const files = fs.readdirSync(samplesDir);
            const mdFiles = files.filter(f => f.endsWith('.md'));
            
            sampleBooks = mdFiles.map(filename => {
                const filePath = path.join(samplesDir, filename);
                try {
                    const content = fs.readFileSync(filePath, 'utf-8');
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
                                // Keep ID file-name based; do not override with frontmatter ID to avoid 404s
                                // if (k === 'id') id = v.replace(/[^a-zA-Z0-9-_]/g, '');
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

                    return {
                        id,
                        slug: id,
                        title,
                        author,
                        coverImage,
                        themeColor: themeColor || (isCard ? 'white' : 'black'),
                        userId: null,
                        isCard,
                        subTitle,
                        isSample: true
                    };
                } catch (err) {
                    console.error(`Failed to read sample file ${filename}:`, err);
                    return null;
                }
            }).filter(b => b !== null);
        } catch (err) {
            console.error('Failed to read samples directory:', err);
        }
    }

    return {
        books: [...formattedBooks, ...sampleBooks],
        currentUserId: session?.user?.id || null
    };
};
