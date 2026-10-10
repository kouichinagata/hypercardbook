// まんが生成ジョブ（サーバー・ブラウザ共通）。
// 台本づくりは /api/generate のチャット AI（queue_manga_pages ツール）が行い、絵を描く作業はブラウザが
// 1 枚ずつ /api/generate-image を呼んで実行する。数十〜100 ページ以上でも、1 回の通信の時間制限に左右されない。
import { imageRequestHeaders } from '$lib/ai-model';

export const MANGA_SKILL_NAME = 'manga-book';
export const MANGA_JOB_OPEN = '[MANGA_JOB]';
export const MANGA_JOB_CLOSE = '[/MANGA_JOB]';
/** 1 回のツール呼び出しで受け取る最大ページ数（AI の出力量を抑えるため、複数回に分けて呼ばせる） */
export const MANGA_PAGES_PER_CALL = 30;
export const MANGA_PAGES_MAX = 400;
const PAGE_ASPECT = '3:4';
const SHEET_ASPECT = '3:2';
const CONCURRENCY = 4;
const RETRIES = 3;

export interface MangaCharacter {
    id: string;
    appearance: string;
}

export interface MangaPage {
    page: number;
    setting: string;
    characters: string[];
    layout: string;
    panels: string[];
}

export interface MangaJob {
    style?: string;
    characters?: MangaCharacter[];
    aspect_ratio?: string;
    pages: MangaPage[];
    /** 本全体の Markdown。画像の URL は {{PAGE_n}} と書く */
    book_markdown?: string;
}

const clip = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);

/** ツール引数を検証して整える。不正なら error を返す。 */
export function normalizeMangaChunk(args: any): { job: MangaJob } | { error: string } {
    const rawPages = Array.isArray(args?.pages) ? args.pages : [];
    if (rawPages.length === 0) return { error: 'pages must contain at least one page.' };
    if (rawPages.length > MANGA_PAGES_PER_CALL) return { error: `Send at most ${MANGA_PAGES_PER_CALL} pages per call; call the tool again for the rest.` };

    const pages: MangaPage[] = [];
    for (const raw of rawPages) {
        const page = Math.floor(Number(raw?.page));
        const panels = (Array.isArray(raw?.panels) ? raw.panels : []).map((p: unknown) => clip(p, 1_000)).filter(Boolean).slice(0, 10);
        if (!Number.isInteger(page) || page < 1 || page > MANGA_PAGES_MAX) return { error: `Invalid page number: ${raw?.page}` };
        if (panels.length === 0) return { error: `Page ${page} has no panels.` };
        pages.push({
            page,
            setting: clip(raw?.setting, 600),
            characters: (Array.isArray(raw?.characters) ? raw.characters : []).map((c: unknown) => clip(c, 64)).filter(Boolean).slice(0, 8),
            layout: clip(raw?.layout, 1_000),
            panels
        });
    }

    const characters: MangaCharacter[] = (Array.isArray(args?.characters) ? args.characters : [])
        .map((c: any) => ({ id: clip(c?.id, 64), appearance: clip(c?.appearance, 1_500) }))
        .filter((c: MangaCharacter) => c.id && c.appearance)
        .slice(0, 8);

    const job: MangaJob = { pages };
    if (clip(args?.style, 600)) job.style = clip(args.style, 600);
    if (characters.length) job.characters = characters;
    if (clip(args?.aspect_ratio, 8)) job.aspect_ratio = clip(args.aspect_ratio, 8);
    if (clip(args?.book_markdown, 400_000)) job.book_markdown = clip(args.book_markdown, 400_000);
    return { job };
}

/** 複数回のツール呼び出し（チャンク）を 1 つのジョブにまとめる。同じページ番号は後のものを優先。 */
export function mergeMangaJobs(chunks: MangaJob[]): MangaJob {
    const merged: MangaJob = { pages: [] };
    const byNumber = new Map<number, MangaPage>();
    for (const chunk of chunks) {
        if (chunk.style) merged.style = chunk.style;
        if (chunk.characters?.length) merged.characters = chunk.characters;
        if (chunk.aspect_ratio) merged.aspect_ratio = chunk.aspect_ratio;
        if (chunk.book_markdown) merged.book_markdown = chunk.book_markdown;
        for (const page of chunk.pages) byNumber.set(page.page, page);
    }
    merged.pages = [...byNumber.values()].sort((a, b) => a.page - b.page);
    return merged;
}

/** ストリーム文字列から [MANGA_JOB]…[/MANGA_JOB] をすべて取り出す。 */
export function extractMangaJob(text: string): MangaJob | null {
    const chunks: MangaJob[] = [];
    const pattern = /\[MANGA_JOB\]([\s\S]*?)\[\/MANGA_JOB\]/g;
    for (const match of text.matchAll(pattern)) {
        try {
            const parsed = JSON.parse(match[1]);
            if (Array.isArray(parsed?.pages)) chunks.push(parsed);
        } catch {
            // 壊れたチャンクは無視する
        }
    }
    return chunks.length ? mergeMangaJobs(chunks) : null;
}

const DEFAULT_STYLE = 'Japanese commercial manga style, full color, clean linework, high contrast, easy to read';

export function buildCharacterSheetPrompt(job: MangaJob): string | null {
    if (!job.characters?.length) return null;
    return `Character reference sheet for a manga, ${job.style || DEFAULT_STYLE}. Plain white background, no text, no labels.
Characters:
${job.characters.map((c, i) => `${i + 1}. ${c.appearance}`).join('\n')}
For each character show: a full-body front view, a full-body side view, and a row of four face close-ups (neutral, happy, surprised, troubled). Characters are arranged side by side with equal size, clean consistent design, same outfit in every view.`;
}

export function buildPagePrompt(job: MangaJob, page: MangaPage, hasReference: boolean): string {
    const appearances = page.characters
        .map((id) => job.characters?.find((c) => c.id === id))
        .filter((c): c is MangaCharacter => Boolean(c));
    return `A single full page of a Japanese manga, vertical portrait page, full color, ${job.style || DEFAULT_STYLE}.
Reading order: left to right, top to bottom. Panels are separated by white gutters and thin black borders. Exactly ${page.panels.length} panels on this page.
${appearances.length ? `\nCharacters (keep identical on every page):\n${appearances.map((c) => `- ${c.appearance}`).join('\n')}\n` : ''}${page.setting ? `\nSetting: ${page.setting}\n` : ''}
${page.layout ? `Page layout: ${page.layout}\n` : ''}Panel content, in reading order:
${page.panels.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Text rules: Render every Japanese line exactly as written inside round speech bubbles, in a clear bold Japanese font, with correct characters. All dialogue is written HORIZONTALLY (left to right, never vertical text). Keep every speech bubble and all text at least 6% away from the page edges. Any text shown on screens or signs must be very short; if unsure, leave screens without readable text. Do not add any other text, captions, page numbers, logos, or watermarks. Each bubble's tail points to its speaker.${hasReference ? '\n\nThe attached image is the character reference sheet. Every character must keep exactly the same face, hairstyle, hair color, body type and outfit as in the reference sheet on every panel.' : ''}`;
}

export interface MangaProgress {
    done: number;
    total: number;
    failed: number;
    phase: 'sheet' | 'pages';
}

export interface MangaResult {
    sheetUrl?: string;
    urls: Map<number, string>;
    failed: number[];
}

/** 1 枚生成して URL を返す。429/5xx などの一時的な失敗は間隔をあけて再試行する。 */
export async function requestImage(prompt: string, aspectRatio: string, referenceImages: string[], signal?: AbortSignal): Promise<string> {
    let lastError = 'Image generation failed.';
    for (let attempt = 0; attempt < RETRIES; attempt++) {
        if (signal?.aborted) throw new Error('Cancelled.');
        try {
            const res = await fetch('/api/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...imageRequestHeaders() },
                body: JSON.stringify({ prompt, count: 1, aspectRatio, source: 'workspace', referenceImages }),
                signal
            });
            const data = await res.json().catch(() => ({}));
            const url = data?.images?.[0]?.url;
            if (res.ok && url) return url;
            lastError = data?.error || `HTTP ${res.status}`;
            // 認証・権限・容量の問題は再試行しても直らない
            if (res.status === 401 || res.status === 403 || /storage limit/i.test(lastError)) break;
        } catch (err: any) {
            if (signal?.aborted) throw new Error('Cancelled.');
            lastError = err?.message || lastError;
        }
        await new Promise((resolve) => setTimeout(resolve, 2_000 * (attempt + 1) ** 2));
    }
    throw new Error(lastError);
}

/** 同時に concurrency 件ずつ処理する。各項目の結果（成功は値、失敗は null）を同じ順で返す。 */
export async function runPool<T>(items: T[], concurrency: number, work: (item: T, index: number) => Promise<void>): Promise<void> {
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const index = next++;
            await work(items[index], index);
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

/** ジョブを実行する: キャラシート → 全ページ（並列）。失敗したページは failed に入る。 */
export async function runMangaJob(job: MangaJob, onProgress: (p: MangaProgress) => void, signal?: AbortSignal): Promise<MangaResult> {
    const result: MangaResult = { urls: new Map(), failed: [] };
    const total = job.pages.length;
    const pageAspect = job.aspect_ratio || PAGE_ASPECT;

    const sheetPrompt = buildCharacterSheetPrompt(job);
    if (sheetPrompt) {
        onProgress({ done: 0, total, failed: 0, phase: 'sheet' });
        // キャラシートが無いとキャラがぶれるので、失敗したらジョブ全体を失敗にする
        result.sheetUrl = await requestImage(sheetPrompt, SHEET_ASPECT, [], signal);
    }

    let done = 0;
    await runPool(job.pages, CONCURRENCY, async (page) => {
        try {
            const url = await requestImage(buildPagePrompt(job, page, Boolean(result.sheetUrl)), pageAspect, result.sheetUrl ? [result.sheetUrl] : [], signal);
            result.urls.set(page.page, url);
        } catch (err: any) {
            if (signal?.aborted) throw err;
            result.failed.push(page.page);
        }
        onProgress({ done: ++done, total, failed: result.failed.length, phase: 'pages' });
    });
    result.failed.sort((a, b) => a - b);
    return result;
}

/** {{PAGE_n}} に画像 URL を入れる。生成できなかったページの画像行は注記に置き換える。 */
export function assembleMangaBook(job: MangaJob, result: MangaResult, currentMarkdown: string): string {
    let template = job.book_markdown?.trim();
    if (!template) {
        // AI が本の Markdown を渡さなかったとき: 今の本の見出し（YAML）を引き継いで、画像だけのページを並べる
        const fm = currentMarkdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        const header = (fm ? fm[1].split(/\r?\n/).filter((line) => !/^\s*layout\s*:/.test(line)).join('\n') : '').trim();
        template = `---\n${header ? `${header}\n` : ''}layout: fill\n---\n\n${job.pages.map((p) => `![Page ${p.page}]({{PAGE_${p.page}}})`).join('\n\n***\n\n')}\n`;
    }
    return template
        .replace(/!\[[^\]]*\]\(\s*\{\{PAGE_(\d+)\}\}\s*\)/g, (_m, n) => {
            const url = result.urls.get(Number(n));
            return url ? `![Page ${n}](${url})` : `（Page ${n} could not be drawn）`;
        })
        .replace(/\{\{PAGE_(\d+)\}\}/g, (_m, n) => result.urls.get(Number(n)) ?? '');
}
