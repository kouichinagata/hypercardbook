import { isCardLike } from './play-mode.ts';
// books テーブルの列（title / slug など）に写す YAML フロントマターの項目を読む。
// /api/save・部分置換編集（card-edit.ts）・画面（AI の返信の反映）で同じ読み方をするために共通化している。
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
    /** id と play_mode の両方が書かれている（本文として扱ってよい全文か） */
    hasIdentity: boolean;
}

export function parseBookFrontmatter(markdown: string): BookFrontmatter {
    const fm: BookFrontmatter = {
        slug: '',
        title: '無題の書籍',
        author: '',
        coverImage: '',
        themeColor: '',
        playMode: 'book',
        ddcCode: '',
        hasIdentity: false
    };
    let hasId = false;
    let hasPlayMode = false;

    const fmMatch = markdown.match(/^---\s*([\s\S]*?)\s*---/);
    if (fmMatch) {
        const fmLines = fmMatch[1].split('\n');
        fmLines.forEach((line: string) => {
            if (/^\s/.test(line)) return;
            const parts = line.split(':');
            if (parts.length >= 2) {
                const k = parts[0].trim();
                const v = parts.slice(1).join(':').trim();
                if (k === 'id') { fm.slug = v.replace(/[^a-zA-Z0-9_\-]/g, ''); hasId = true; }
                if (k === 'title') fm.title = v;
                if (k === 'author') fm.author = v;
                if (k === 'cover_image') fm.coverImage = v;
                if (k === 'theme_color') fm.themeColor = v;
                if (k === 'play_mode') { fm.playMode = v; hasPlayMode = true; }
                if (k === 'is_public') fm.isPublic = v === 'true';
                if (k === 'published_at') fm.publishedAt = v;
                if (k === 'ddc_code') fm.ddcCode = v;
            }
        });
    }
    fm.hasIdentity = hasId && hasPlayMode && !!fm.slug && !!fm.playMode;
    return fm;
}

/** next が current と同じ文書（id と play_mode が同じ）の全文か。current に id が無いときは play_mode だけで比べる */
export function isSameDocument(current: string, next: string): boolean {
    const a = parseBookFrontmatter(current || '');
    const b = parseBookFrontmatter(next || '');
    return b.hasIdentity && a.playMode === b.playMode && (!a.slug || a.slug === b.slug);
}

/** フロントマターから決まる books の列（/api/save と同じ既定値） */
export function bookColumnsFromFrontmatter(fm: BookFrontmatter) {
    return {
        title: fm.title,
        author: fm.author || null,
        cover_image: fm.coverImage || null,
        theme_color: fm.themeColor || (isCardLike(fm.playMode) ? 'white' : 'black'),
        ddc_code: fm.ddcCode || null
    };
}
