/**
 * ユーザーごとに1冊だけ存在する「Biography」Bookの共通ヘルパー。
 * 生成AI(HyperCardBook)、PapeRobo/HyperTV向け読み取りAPI双方から利用される。
 */

export const BIOGRAPHY_SPECIAL_KEY = 'biography';

export function biographySlug(userId: string) {
    return `biography-${userId}`;
}

export function buildInitialBiographyMarkdown(authorName: string) {
    return `---
title: Biography
author: HyperCardBook
theme_color: purple
play_mode: book
special_book_key: ${BIOGRAPHY_SPECIAL_KEY}
source_app: hypercardbook
is_public: false
---

<!-- biography_section: intro -->

# ${authorName || 'このユーザー'}の伝記

これはAIとの対話を通じて少しずつ書き加えられていく、あなただけの伝記です。
まだ何も分かっていません。会話の中で少しずつ明らかになっていきます。
`;
}

/**
 * 指定した userId のBiography Bookが存在しなければ作成する。
 * ログイン済みユーザーのページ読み込み時に呼び出すことで、新規登録・既存ユーザーの両方をカバーする。
 */
export async function ensureBiographyBook(
    supabase: any,
    userId: string,
    userMetadata: Record<string, any> = {}
): Promise<void> {
    if (!userId) return;

    const slug = biographySlug(userId);
    const { data: existing, error: findError } = await supabase
        .from('books')
        .select('id')
        .eq('user_id', userId)
        .eq('slug', slug)
        .maybeSingle();

    if (findError) {
        console.error('Failed to check for existing Biography book:', findError);
        return;
    }

    if (existing) return;

    const authorName = userMetadata.nickname || userMetadata.full_name || 'Anonymous';

    const { error: insertError } = await supabase.from('books').insert({
        user_id: userId,
        slug,
        title: 'Biography',
        author: 'HyperCardBook',
        cover_image: null,
        theme_color: 'purple',
        markdown_content: buildInitialBiographyMarkdown(authorName),
        is_public: false,
        published_at: null
    });

    if (insertError) {
        console.error('Failed to create Biography book:', insertError);
    }
}

function splitBiographyMarkdown(markdown: string) {
    const trimmed = (markdown || '').trim();
    const frontmatterMatch = trimmed.match(/^(---\s*[\s\S]*?\s*---)([\s\S]*)$/);
    const frontmatter = frontmatterMatch ? frontmatterMatch[1].trim() : '';
    const body = frontmatterMatch ? frontmatterMatch[2].trim() : trimmed;
    const pages = body
        .split(/(?:^|\n)\s*\*\*\*\s*(?:\n|$)/)
        .map((page) => page.trim())
        .filter(Boolean);

    return { frontmatter, pages };
}

function sectionMarker(section: string) {
    return `<!-- biography_section: ${section} -->`;
}

/**
 * 指定セクションのページを、内容が既存すれば置換、なければ追加する形でBiography本文を更新する。
 * call-history webhookの upsertCallPage と同じマーカーベースの方式。
 */
export function upsertBiographySection(markdown: string, section: string, content: string) {
    const marker = sectionMarker(section);
    const page = `${marker}\n\n${content.trim()}\n`;
    const { frontmatter, pages } = splitBiographyMarkdown(markdown);

    const existingIndex = pages.findIndex((item) => item.includes(marker));
    const newPages =
        existingIndex >= 0
            ? pages.map((item, index) => (index === existingIndex ? page : item))
            : [...pages, page];

    return [frontmatter, ...newPages].filter(Boolean).join('\n\n***\n\n');
}
