import type { PageServerLoad } from './$types';
import fs from 'fs';
import path from 'path';

export const load: PageServerLoad = async ({ url, locals }) => {
    const supabase = locals.supabase;
    const session = locals.session;

    const booksParam = url.searchParams.get('books');
    const titleParam = url.searchParams.get('title');
    const logoParam = url.searchParams.get('logo');

    const booksDir = path.resolve('static/books');
    
    // Choose index path based on booksParam
    let indexPath = path.join(booksDir, 'index.json');
    if (booksParam && !booksParam.includes('-') && !booksParam.includes(',')) {
        indexPath = path.join(booksDir, booksParam);
    }
    
    let bookFiles: string[] = [];
    if (fs.existsSync(indexPath)) {
        try {
            const data = fs.readFileSync(indexPath, 'utf-8');
            bookFiles = JSON.parse(data);
        } catch (err) {
            console.error(`Failed to read books file at ${indexPath}:`, err);
        }
    }

    if (bookFiles.length === 0 && (!booksParam || booksParam.includes(',')) && fs.existsSync(booksDir)) {
        try {
            const files = fs.readdirSync(booksDir);
            bookFiles = files.filter(f => f.endsWith('.md') && f !== 'index.json');
        } catch (err) {
            console.error('Failed to read books directory', err);
        }
    }

    const staticBooks = bookFiles.map(filename => {
        const filePath = path.join(booksDir, filename);
        if (!fs.existsSync(filePath)) return null;

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const fmMatch = content.match(/^---\s*([\s\S]*?)\s*---/);
            
            let id = filename.replace('.md', '');
            let title = '無題の書籍';
            let author = '';
            let coverImage = '';
            let themeColor = '';
            let playMode = 'book';
            let subTitle = '';
            let description = '';
            let hideHyperbook = false;
            let sourceApp = '';

            if (fmMatch) {
                const lines = fmMatch[1].split('\n');
                lines.forEach(line => {
                    const parts = line.split(':');
                    if (parts.length >= 2) {
                        const k = parts[0].trim();
                        const v = parts.slice(1).join(':').trim();
                        if (k === 'id') id = v.replace(/[^a-zA-Z0-9_\-]/g, '');
                        if (k === 'title') title = v;
                        if (k === 'author') author = v;
                        if (k === 'cover_image') coverImage = v;
                        if (k === 'theme_color') themeColor = v;
                        if (k === 'play_mode') playMode = v;
                        if (k === 'sub_title') subTitle = v;
                        if (k === 'description') description = v.replace(/^["']|["']$/g, '');
                        if (k === 'hide_hyperbook') hideHyperbook = v === 'true';
                        if (k === 'source_app') sourceApp = v;
                    }
                });
            }

            const isCard = playMode === 'card';
            const isStack = playMode === 'stack';

            return {
                id,
                filename,
                title,
                author,
                coverImage,
                themeColor: themeColor || (isCard ? 'white' : 'black'),
                isCard,
                isStack,
                subTitle,
                description,
                hideHyperbook,
                sourceApp,
                markdownContent: content
            };
        } catch (err) {
            console.error(`Failed to parse book file ${filename}:`, err);
            return null;
        }
    }).filter(b => b !== null) as any[];

    // Load database books from Supabase
    let dbBooksList: any[] = [];

    // 1. Load logged-in user's books (if logged in)
    if (session?.user?.id && supabase) {
        const { data: myBooks, error } = await supabase
            .from('books')
            .select('id, slug, title, author, cover_image, theme_color, user_id, markdown_content, updated_at')
            .eq('user_id', session.user.id);

        if (error) {
            console.error('Failed to fetch user books from Supabase:', error);
        } else if (myBooks) {
            dbBooksList = [...myBooks];
        }
    }

    // 2. Load public books matching booksParam (if provided)
    if (booksParam && supabase) {
        const allowedIds = booksParam.split(',').map(id => id.trim());
        const uuids = allowedIds.filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
        const slugs = allowedIds.filter(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));

        let orConditions: string[] = [];
        if (uuids.length > 0) {
            orConditions.push(`id.in.(${uuids.map(id => `"${id}"`).join(',')})`);
        }
        if (slugs.length > 0) {
            orConditions.push(`slug.in.(${slugs.map(slug => `"${slug}"`).join(',')})`);
        }

        if (orConditions.length > 0) {
            const { data: pubBooks, error: pubError } = await supabase
                .from('books')
                .select('id, slug, title, author, cover_image, theme_color, user_id, markdown_content, updated_at')
                .eq('is_public', true)
                .or(orConditions.join(','));

            if (pubError) {
                console.error('Failed to fetch public books for bookshelf:', pubError);
            } else if (pubBooks) {
                // Merge with dbBooksList, avoiding duplicates
                pubBooks.forEach(pb => {
                    if (!dbBooksList.some(db => db.id === pb.id)) {
                        dbBooksList.push(pb);
                    }
                });
            }
        }
    }

    let formattedBooks: any[] = [];
    if (dbBooksList.length > 0) {
        formattedBooks = dbBooksList.map(b => {
            const markdown = b.markdown_content || '';
            let playMode = 'book';
            let subTitle = '';
            let launchUrl = '';
            let paperoboSlug = '';
            let hyperbookId = '';
            let description = '';
            let hideHyperbook = false;
            let sourceApp = '';

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
                        if (k === 'source_app') sourceApp = v;
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
                sourceApp,
                markdownContent: markdown
            };
        });
    }

    let allBooks = [...formattedBooks, ...staticBooks];

    // Filter books by booksParam if provided and keep their order
    if (booksParam) {
        const allowedIds = booksParam.split(',').map(id => id.trim());
        const orderedBooks: any[] = [];
        allowedIds.forEach(id => {
            const found = allBooks.find(b => b.id === id || b.slug === id);
            if (found) {
                orderedBooks.push(found);
            }
        });
        allBooks = orderedBooks;
    }

    return {
        books: allBooks,
        title: titleParam,
        logo: logoParam,
        booksParam,
        currentUserId: session?.user?.id || null
    };
};
