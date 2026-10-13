// books テーブルの列（title / slug など）に写す YAML フロントマターの項目を読む。
// /api/save と部分置換編集（card-edit.ts）で同じ読み方をするために共通化している。
export interface BookFrontmatter {
    slug: string;
    title: string;
    author: string;
    coverImage: string;
    themeColor: string;
    playMode: string;
    isPublic?: boolean;
    publishedAt?: string;
    ddcCode: string;
}

export function parseBookFrontmatter(markdown: string): BookFrontmatter {
    const fm: BookFrontmatter = {
        slug: '',
        title: '無題の書籍',
        author: '',
        coverImage: '',
        themeColor: '',
        playMode: 'book',
        ddcCode: ''
    };

    const fmMatch = markdown.match(/^---\s*([\s\S]*?)\s*---/);
    if (fmMatch) {
        const fmLines = fmMatch[1].split('\n');
        fmLines.forEach((line: string) => {
            if (/^\s/.test(line)) return;
            const parts = line.split(':');
            if (parts.length >= 2) {
                const k = parts[0].trim();
                const v = parts.slice(1).join(':').trim();
                if (k === 'id') fm.slug = v.replace(/[^a-zA-Z0-9_\-]/g, '');
                if (k === 'title') fm.title = v;
                if (k === 'author') fm.author = v;
                if (k === 'cover_image') fm.coverImage = v;
                if (k === 'theme_color') fm.themeColor = v;
                if (k === 'play_mode') fm.playMode = v;
                if (k === 'is_public') fm.isPublic = v === 'true';
                if (k === 'published_at') fm.publishedAt = v;
                if (k === 'ddc_code') fm.ddcCode = v;
            }
        });
    }
    return fm;
}

/** フロントマターから決まる books の列（/api/save と同じ既定値） */
export function bookColumnsFromFrontmatter(fm: BookFrontmatter) {
    return {
        title: fm.title,
        author: fm.author || null,
        cover_image: fm.coverImage || null,
        theme_color: fm.themeColor || (fm.playMode === 'card' ? 'white' : 'black'),
        ddc_code: fm.ddcCode || null
    };
}
