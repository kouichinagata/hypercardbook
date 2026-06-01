import type { PageServerLoad } from './$types';
import fs from 'fs';
import path from 'path';

export const load: PageServerLoad = async ({ url }) => {
    const booksParam = url.searchParams.get('books');
    const titleParam = url.searchParams.get('title');
    const logoParam = url.searchParams.get('logo');

    const booksDir = path.resolve('static/books');
    
    // Choose index path based on booksParam
    let indexPath = path.join(booksDir, 'index.json');
    if (booksParam) {
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

    if (bookFiles.length === 0 && !booksParam && fs.existsSync(booksDir)) {
        try {
            const files = fs.readdirSync(booksDir);
            bookFiles = files.filter(f => f.endsWith('.md') && f !== 'index.json');
        } catch (err) {
            console.error('Failed to read books directory', err);
        }
    }

    const books = bookFiles.map(filename => {
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
                    }
                });
            }

            const isCard = playMode === 'card';

            return {
                id,
                filename,
                title,
                author,
                coverImage,
                themeColor: themeColor || (isCard ? 'white' : 'black'),
                isCard,
                subTitle
            };
        } catch (err) {
            console.error(`Failed to parse book file ${filename}:`, err);
            return null;
        }
    }).filter(b => b !== null);

    return {
        books,
        title: titleParam,
        logo: logoParam,
        booksParam
    };
};
