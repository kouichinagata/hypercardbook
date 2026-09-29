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

export const BIOGRAPHY_SECTIONS = [
    '基本情報',
    '生い立ち',
    '仕事・学び',
    '家族・人間関係',
    '趣味・関心',
    '成果物の好み',
    '価値観・性格',
    'エピソード',
    '現在'
] as const;

export type BiographyFact = { section: string; text: string };

const MAX_FACT_LENGTH = 300;

function normalizeSection(section: string) {
    const cleaned = String(section || '').replace(/[\r\n]+/g, ' ').replace(/-->/g, '').trim();
    return cleaned || 'その他';
}

function normalizeFactText(text: string) {
    return String(text || '')
        .replace(/\r?\n/g, ' ')
        .replace(/^\s*[-*]\s*/, '')
        .trim()
        .slice(0, MAX_FACT_LENGTH);
}

// 出典〔…〕を除いた本文で重複を判定する
function factKey(line: string) {
    return line
        .replace(/^\s*[-*]\s*/, '')
        .replace(/\s*〔[^〕]*〕\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

/**
 * 事実を該当セクションページの末尾に箇条書きで追記する(無ければページを新設)。
 * 既存の内容(旧形式の伝記文を含む)は消さず、同じ文は追加しない。
 */
export function appendBiographyFacts(markdown: string, facts: BiographyFact[], sourceLabel: string) {
    const { frontmatter, pages } = splitBiographyMarkdown(markdown);
    let added = 0;

    for (const fact of facts) {
        const text = normalizeFactText(fact.text);
        if (!text) continue;

        const section = normalizeSection(fact.section);
        const marker = sectionMarker(section);
        let index = pages.findIndex((item) => item.includes(marker));
        if (index < 0) {
            pages.push(`${marker}\n\n## ${section}`);
            index = pages.length - 1;
        }

        const page = pages[index].trim();
        const known = page
            .split('\n')
            .filter((line) => /^\s*-\s+/.test(line))
            .map(factKey);
        if (known.includes(factKey(text))) continue;

        const lastLine = page.split('\n').pop() || '';
        const separator = /^\s*-\s+/.test(lastLine) ? '\n' : '\n\n';
        pages[index] = `${page}${separator}- ${text} 〔${sourceLabel}〕`;
        added++;
    }

    return {
        markdown: added > 0 ? [frontmatter, ...pages].filter(Boolean).join('\n\n***\n\n') : markdown,
        added
    };
}

export function biographySourceLabel(source: string) {
    return `${source} ${new Date().toISOString().slice(0, 10)}`;
}

/**
 * Biography Bookを読み込み(無ければ作成し)、事実を追記して保存する。
 * HyperCardBookチャットとPapeRobo通話履歴の両方から使う唯一の書き込み口。
 */
export async function appendFactsToBiographyBook(
    supabase: any,
    userId: string,
    facts: BiographyFact[],
    sourceLabel: string,
    userMetadata: Record<string, any> = {}
): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
    const slug = biographySlug(userId);
    const load = () =>
        supabase.from('books').select('id, markdown_content').eq('user_id', userId).eq('slug', slug).maybeSingle();

    let { data: book, error } = await load();
    if (!error && !book) {
        await ensureBiographyBook(supabase, userId, userMetadata);
        ({ data: book, error } = await load());
    }
    if (error || !book) {
        return { ok: false, error: error?.message || 'Biography book not found.' };
    }

    const result = appendBiographyFacts(book.markdown_content || '', facts, sourceLabel);
    if (result.added === 0) return { ok: true, added: 0 };

    const { error: updateError } = await supabase
        .from('books')
        .update({ markdown_content: result.markdown })
        .eq('id', book.id);

    return updateError ? { ok: false, error: updateError.message } : { ok: true, added: result.added };
}

/**
 * AIに渡すための整形済みBiography。frontmatterとマーカーを除き、上限文字数で切る。
 */
export function buildBiographyContext(markdown: string, maxChars = 12000) {
    const { pages } = splitBiographyMarkdown(markdown);
    const text = pages
        .map((page) => page.replace(/<!--\s*biography_section:[^>]*-->/g, '').trim())
        .filter(Boolean)
        .join('\n\n');
    return text.length > maxChars ? `${text.slice(0, maxChars)}\n…(truncated)` : text;
}
