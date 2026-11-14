// 絵本生成ジョブ（サーバー・ブラウザ共通）。manga-job.ts と同じ仕組み:
// 台本づくりは /api/generate のチャット AI（queue_picture_book_pages ツール）が行い、絵はブラウザが 1 枚ずつ描く。
// 文章は画像に焼き込まず、Markdown 側（book_markdown）で管理する。
import { imageRequestHeaders } from '$lib/ai-model';
import { runPool } from '$lib/manga-job';

export const PICTURE_SKILL_NAME = 'picture-book';
export const PICTURE_JOB_OPEN = '[PICTURE_JOB]';
export const PICTURE_JOB_CLOSE = '[/PICTURE_JOB]';
/** 1 回のツール呼び出し・1 回の実行（1 ターン）で受け取る最大ユニット数。シートが要るときはシートも 1 枚に数えるので 3 */
export const PICTURE_UNITS_PER_CALL = 4;
export const PICTURE_RUN_MAX = 4;
export const pictureRunCap = (hasSheet: boolean) => (hasSheet ? PICTURE_RUN_MAX : PICTURE_RUN_MAX - 1);
export const PICTURE_UNITS_MAX = 120;
const PAGE_ASPECT = '3:4';
const SPREAD_ASPECT = '3:2';
const SHEET_ASPECT = '3:2';
/** 1 回の波で描く最大枚数（キャラシートも 1 枚に数える）。波ごとに結果を確認してから次へ進む */
export const PICTURE_IMAGES_PER_BATCH = 4;
const CONCURRENCY = 2;

/** cover: front cover picture with the book's title and author drawn into it / single: 1 scene on one page / multi: 2–4 soft-framed scenes on one page / wide: one picture across a double-page spread / grid: 2 or 4 separate page pictures drawn in ONE image and cut apart (the cheap default for many pages) */
export type PictureUnitType = 'cover' | 'single' | 'multi' | 'wide' | 'grid';

export interface PictureCharacter {
    id: string;
    appearance: string;
}

export interface PictureUnit {
    unit: number;
    type: PictureUnitType;
    setting: string;
    characters: string[];
    /** Camera / composition, e.g. "wide establishing shot from a low angle" */
    composition: string;
    /** single/wide: 1 scene. multi: 2–4 scenes in reading order. */
    scenes: string[];
    /** wide / grid のみ: 生成済みの画像の URL。あれば描かずに、切る作業だけをやり直す */
    source_url?: string;
    /** cover のみ: 表紙の絵に描き込むタイトルと作者名 */
    title?: string;
    author?: string;
}

export interface PictureJob {
    style?: string;
    characters?: PictureCharacter[];
    /** 既存の本のキャラシート画像。あれば再利用し、新しく描かない（部分的な描き直し用） */
    character_sheet_url?: string;
    units: PictureUnit[];
    /** 本全体の Markdown。画像は {{UNIT_n}}、見開きは {{UNIT_n_L}} / {{UNIT_n_R}} と書く */
    book_markdown?: string;
}

const clip = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);

export function normalizePictureChunk(args: any): { job: PictureJob } | { error: string } {
    const raw = Array.isArray(args?.units) ? args.units : [];
    if (raw.length === 0) return { error: 'units must contain at least one unit.' };
    if (raw.length > PICTURE_UNITS_PER_CALL) return { error: `Send at most ${PICTURE_UNITS_PER_CALL} units per call; call the tool again for the rest.` };

    const units: PictureUnit[] = [];
    for (const r of raw) {
        const unit = Math.floor(Number(r?.unit));
        const type = r?.type as PictureUnitType;
        const scenes = (Array.isArray(r?.scenes) ? r.scenes : []).map((s: unknown) => clip(s, 800)).filter(Boolean);
        if (!Number.isInteger(unit) || unit < 1 || unit > PICTURE_UNITS_MAX) return { error: `Invalid unit number: ${r?.unit}` };
        if (type !== 'cover' && type !== 'single' && type !== 'multi' && type !== 'wide' && type !== 'grid') return { error: `Unit ${unit}: type must be "cover", "single", "multi", "wide" or "grid".` };
        if (type === 'grid' && scenes.length !== 2 && scenes.length !== 4) return { error: `Unit ${unit}: a grid unit needs exactly 2 or 4 scenes (one per page).` };
        if (type === 'multi' ? scenes.length < 2 || scenes.length > 4 : scenes.length < 1) return { error: `Unit ${unit}: ${type === 'multi' ? 'a multi unit needs 2 to 4 scenes' : 'at least one scene is required'}.` };
        units.push({
            unit,
            type,
            setting: clip(r?.setting, 600),
            characters: (Array.isArray(r?.characters) ? r.characters : []).map((c: unknown) => clip(c, 64)).filter(Boolean).slice(0, 8),
            composition: clip(r?.composition, 600),
            scenes: type === 'multi' || type === 'grid' ? scenes.slice(0, 4) : scenes.slice(0, 1),
            ...((type === 'wide' || type === 'grid') && /^https:\/\//.test(clip(r?.source_url, 1_000)) ? { source_url: clip(r.source_url, 1_000) } : {}),
            ...(type === 'cover' && clip(r?.title, 200) ? { title: clip(r.title, 200) } : {}),
            ...(type === 'cover' && clip(r?.author, 100) ? { author: clip(r.author, 100) } : {})
        });
    }

    const characters: PictureCharacter[] = (Array.isArray(args?.characters) ? args.characters : [])
        .map((c: any) => ({ id: clip(c?.id, 64), appearance: clip(c?.appearance, 1_500) }))
        .filter((c: PictureCharacter) => c.id && c.appearance)
        .slice(0, 8);

    const job: PictureJob = { units };
    if (clip(args?.style, 600)) job.style = clip(args.style, 600);
    if (characters.length) job.characters = characters;
    if (/^https:\/\//.test(clip(args?.character_sheet_url, 1_000))) job.character_sheet_url = clip(args.character_sheet_url, 1_000);
    if (clip(args?.book_markdown, 400_000)) job.book_markdown = clip(args.book_markdown, 400_000);
    return { job };
}

export function mergePictureJobs(chunks: PictureJob[]): PictureJob {
    const merged: PictureJob = { units: [] };
    const byNumber = new Map<number, PictureUnit>();
    for (const chunk of chunks) {
        if (chunk.style) merged.style = chunk.style;
        if (chunk.characters?.length) merged.characters = chunk.characters;
        if (chunk.character_sheet_url) merged.character_sheet_url = chunk.character_sheet_url;
        if (chunk.book_markdown) merged.book_markdown = chunk.book_markdown;
        for (const unit of chunk.units) byNumber.set(unit.unit, unit);
    }
    merged.units = [...byNumber.values()].sort((a, b) => a.unit - b.unit);
    return merged;
}

export function extractPictureJob(text: string): PictureJob | null {
    const chunks: PictureJob[] = [];
    for (const match of text.matchAll(/\[PICTURE_JOB\]([\s\S]*?)\[\/PICTURE_JOB\]/g)) {
        try {
            const parsed = JSON.parse(match[1]);
            if (Array.isArray(parsed?.units)) chunks.push(parsed);
        } catch {
            // 壊れたチャンクは無視する
        }
    }
    return chunks.length ? mergePictureJobs(chunks) : null;
}

const DEFAULT_STYLE = 'soft watercolor picture-book illustration, warm gentle colors, hand-painted paper texture';
const NO_TEXT = 'Do NOT draw any text, letters, captions, speech bubbles, numbers, logos, or watermarks anywhere in the picture.';

// The cover's title and author: from the cover unit, else from the book's frontmatter.
function coverText(job: PictureJob, unit: PictureUnit) {
    const fm = job.book_markdown?.match(/^---\s*([\s\S]*?)\s*---/)?.[1] || '';
    const field = (key: string) => fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1].trim().replace(/^["']|["']$/g, '') || '';
    return { title: unit.title || field('title'), author: unit.author || field('author') };
}

export function buildPictureSheetPrompt(job: PictureJob): string | null {
    if (!job.characters?.length) return null;
    return `Character reference sheet for a children's picture book, ${job.style || DEFAULT_STYLE}. Plain off-white background.
Characters:
${job.characters.map((c, i) => `${i + 1}. ${c.appearance}`).join('\n')}
For each character show a full-body front view, a full-body side view, and a row of four face close-ups (neutral, happy, surprised, sad). Equal size, same outfit and colors in every view. ${NO_TEXT}`;
}

function coverLettering(job: PictureJob, unit: PictureUnit) {
    const { title, author } = coverText(job, unit);
    if (!title) return NO_TEXT;
    return `Draw the book's title and author name on the cover as part of the artwork, in a beautiful hand-lettered picture-book style that matches the illustration, exactly as written (same characters, no extra words, no typos):
- Title (large, near the top): ${title}
${author ? `- Author (small, near the bottom): ${author}\n` : ''}Keep the lettering clearly readable and away from the edges, and do not cover the main character's face. No other text, numbers, logos, or watermarks.`;
}

export function buildPicturePrompt(job: PictureJob, unit: PictureUnit, hasReference: boolean): string {
    const appearances = unit.characters
        .map((id) => job.characters?.find((c) => c.id === id))
        .filter((c): c is PictureCharacter => Boolean(c));
    const cast = appearances.length ? `\nCharacters (keep identical on every page):\n${appearances.map((c) => `- ${c.appearance}`).join('\n')}\n` : '';
    const setting = unit.setting ? `\nSetting: ${unit.setting}\n` : '';
    const composition = unit.composition ? `Composition: ${unit.composition}\n` : '';
    const ref = hasReference ? '\n\nThe attached image is the character reference sheet. Every character must keep exactly the same face, body, colors and outfit as in the reference sheet.' : '';
    const style = job.style || DEFAULT_STYLE;

    if (unit.type === 'multi') {
        return `One single picture-book page (vertical portrait), ${style}.
The page shows exactly ${unit.scenes.length} small scenes of one continuous moment, blended into ONE harmonious illustration. The scenes have different sizes, shapes and angles (for example a large scene, plus diagonal or rounded smaller scenes); they are NOT an even grid. Scene borders are soft painted edges or thin warm-colored lines — no thick black comic frames, no speech bubbles. Read order: top to bottom, left to right.
${cast}${setting}${composition}Scenes in reading order:
${unit.scenes.map((s, i) => `${i + 1}. ${s}`).join('\n')}

${NO_TEXT} Keep important subjects away from the page edges.${ref}`;
    }
    if (unit.type === 'grid') {
        const n = unit.scenes.length;
        const layout = n === 2 ? 'two panels side by side (left and right)' : 'a 2 x 2 arrangement of four equal panels (top-left, top-right, bottom-left, bottom-right)';
        return `One image that contains ${n} SEPARATE full-page picture-book illustrations, arranged as ${layout}, ${style}.
The panels are cut apart afterwards, so each panel must be a complete, self-contained illustration that fills its own cell edge to edge (vertical portrait cell, 3:4). Draw NO borders, NO frames, NO gutters, NO white gaps and NO dividing lines between the panels; each panel's artwork simply ends at its cell edge. Nothing from one panel may cross into another. Keep important subjects away from each cell's edges. Each panel has some calm empty space (sky, ground, wall) for text later.
${cast}${setting}${composition}Panels in reading order (${n === 2 ? 'left, right' : 'top-left, top-right, bottom-left, bottom-right'}):
${unit.scenes.map((s, i) => `${i + 1}. ${s}`).join('\n')}

${NO_TEXT}${ref}`;
    }
    if (unit.type === 'cover') {
        return `The front cover illustration of a picture book (vertical portrait), ${style}.
Iconic, inviting and charming: the main character(s) large and centered in a representative moment, with the story's key setting behind them. Balanced composition, calm space around the subject, bright and warm.
${cast}${setting}${composition}Scene: ${unit.scenes[0]}

${coverLettering(job, unit)}${ref}`;
    }
    if (unit.type === 'wide') {
        return `One wide double-page spread picture for a picture book (landscape), ${style}.
It is a single continuous scene across two facing pages. The vertical center line is the book's binding: keep faces, characters and important objects at least 8% away from the center line (to the left or right of it); let sky, ground, water or background flow across it.
${cast}${setting}${composition}Scene: ${unit.scenes[0]}

${NO_TEXT}${ref}`;
    }
    return `One single picture-book page (vertical portrait), ${style}. One scene, illustration-first, with some calm empty space (sky, ground, wall) where text could be placed later.
${cast}${setting}${composition}Scene: ${unit.scenes[0]}

${NO_TEXT} Keep important subjects away from the page edges.${ref}`;
}

export type PictureFailureKind = 'rate_limit' | 'auth' | 'storage' | 'safety' | 'split' | 'not_attempted' | 'other';

export interface PictureFailure {
    kind: PictureFailureKind;
    message: string;
}

export interface PictureProgress {
    done: number;
    total: number;
    failed: number;
    phase: 'sheet' | 'pages';
}

export interface PictureResult {
    sheetUrl?: string;
    /** key: single/multi/cover → "n", wide → "n_L" and "n_R", grid → "n_1"…"n_4" */
    urls: Map<string, string>;
    /** unit 番号 → 失敗の理由 */
    failures: Map<number, PictureFailure>;
    /** 横長画像は描けたが、左右に切れなかったもの（unit 番号 → 横長画像の URL） */
    wideSources: Map<number, string>;
    /** 429 などで、途中で止めた */
    stopped?: PictureFailureKind;
}

export function classifyImageError(status: number, message: string): PictureFailureKind {
    if (status === 429 || /429|resource.?exhausted|quota|rate.?limit|too many requests/i.test(message)) return 'rate_limit';
    if (/storage limit/i.test(message)) return 'storage';
    if (status === 401 || status === 403) return 'auth';
    if (/safety|blocked|prohibited|policy|recitation/i.test(message)) return 'safety';
    return 'other';
}

class PictureImageError extends Error {
    kind: PictureFailureKind;
    constructor(kind: PictureFailureKind, message: string) {
        super(message);
        this.kind = kind;
    }
}

/** 1 枚生成する。429・権限・容量・安全フィルターは再試行しない（無駄な消費を避ける）。その他は 1 回だけ再試行。 */
async function requestPictureImage(prompt: string, aspectRatio: string, referenceImages: string[], signal?: AbortSignal): Promise<string> {
    let last = new PictureImageError('other', 'Image generation failed.');
    for (let attempt = 0; attempt < 2; attempt++) {
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
            const message = String(data?.error || `HTTP ${res.status}`);
            last = new PictureImageError(classifyImageError(res.status, message), message);
        } catch (err: any) {
            if (signal?.aborted) throw new Error('Cancelled.');
            last = new PictureImageError('other', err?.message || 'Network error.');
        }
        if (last.kind !== 'other') break;
        await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
    throw last;
}

async function splitImage(url: string, cols: number, rows: number, signal?: AbortSignal): Promise<string[]> {
    let last = 'Could not split the picture.';
    for (let attempt = 0; attempt < 2; attempt++) {
        if (signal?.aborted) throw new Error('Cancelled.');
        try {
            const res = await fetch('/api/split-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...imageRequestHeaders() },
                body: JSON.stringify({ url, cols, rows }),
                signal
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && Array.isArray(data?.urls) && data.urls.length === cols * rows) return data.urls as string[];
            last = `${data?.error || 'Request failed'} (HTTP ${res.status})`;
        } catch (err: any) {
            if (signal?.aborted) throw new Error('Cancelled.');
            last = err?.message || last;
        }
        await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
    throw new PictureImageError('split', last);
}

/**
 * 4 枚ずつの波で描く（キャラシートも 1 枚に数える。見開きは生成 1 回なので 1 枚）。
 * 1 枚できるたびに onUnit を呼ぶ（呼び出し側がすぐ本に反映する）。
 * 429 などで波の全部が落ちたり、429 が出たときは、そこで止めて残りは描かない。
 */
export async function runPictureJob(
    job: PictureJob,
    onProgress: (p: PictureProgress) => void,
    signal?: AbortSignal,
    onUnit?: (unit: PictureUnit, result: PictureResult) => void
): Promise<PictureResult> {
    const result: PictureResult = { urls: new Map(), failures: new Map(), wideSources: new Map() };
    const total = job.units.length;

    result.sheetUrl = job.character_sheet_url;
    const sheetPrompt = result.sheetUrl ? null : buildPictureSheetPrompt(job);
    let budget = PICTURE_IMAGES_PER_BATCH;
    if (sheetPrompt) {
        onProgress({ done: 0, total, failed: 0, phase: 'sheet' });
        try {
            // キャラシートが無いと登場人物がぶれるので、失敗したらジョブ全体を止める
            result.sheetUrl = await requestPictureImage(sheetPrompt, SHEET_ASPECT, [], signal);
        } catch (err: any) {
            if (signal?.aborted) throw err;
            for (const unit of job.units) result.failures.set(unit.unit, { kind: 'not_attempted', message: 'Stopped: the character sheet could not be drawn.' });
            result.stopped = err?.kind || 'other';
            result.failures.set(0, { kind: err?.kind || 'other', message: `Character sheet: ${err?.message || 'failed'}` });
            return result;
        }
        budget -= 1;
    }

    let done = 0;
    let index = 0;
    let first = true;
    while (index < job.units.length && !result.stopped) {
        const size = first && sheetPrompt ? budget : PICTURE_IMAGES_PER_BATCH;
        first = false;
        const wave = job.units.slice(index, index + size);
        index += size;
        let waveFailures = 0;
        await runPool(wave, CONCURRENCY, async (unit) => {
            try {
                const cut = unit.type === 'wide' ? { cols: 2, rows: 1, keys: ['L', 'R'] } : unit.type === 'grid' ? (unit.scenes.length === 2 ? { cols: 2, rows: 1, keys: ['1', '2'] } : { cols: 2, rows: 2, keys: ['1', '2', '3', '4'] }) : null;
                const aspect = unit.type === 'wide' || (cut && cut.rows === 1) ? SPREAD_ASPECT : PAGE_ASPECT;
                let wideUrl = unit.source_url;
                if (cut) {
                    // 切る前に URL を控える。切るのだけ失敗しても、描き直さずに済む
                    if (!wideUrl) wideUrl = await requestPictureImage(buildPicturePrompt(job, unit, Boolean(result.sheetUrl)), aspect, result.sheetUrl ? [result.sheetUrl] : [], signal);
                    result.wideSources.set(unit.unit, wideUrl);
                    const parts = await splitImage(wideUrl, cut.cols, cut.rows, signal);
                    cut.keys.forEach((k, i) => result.urls.set(`${unit.unit}_${k}`, parts[i]));
                    result.wideSources.delete(unit.unit);
                } else {
                    const url = await requestPictureImage(buildPicturePrompt(job, unit, Boolean(result.sheetUrl)), aspect, result.sheetUrl ? [result.sheetUrl] : [], signal);
                    result.urls.set(String(unit.unit), url);
                }
                onUnit?.(unit, result);
            } catch (err: any) {
                if (signal?.aborted) throw err;
                waveFailures++;
                const kind: PictureFailureKind = err?.kind || 'other';
                result.failures.set(unit.unit, { kind, message: err?.message || 'Failed.' });
                if (kind === 'rate_limit' || kind === 'auth' || kind === 'storage') result.stopped = kind;
            }
            onProgress({ done: ++done, total, failed: result.failures.size, phase: 'pages' });
        });
        // 波の全部が落ちたら、続けても無駄なので止める
        if (waveFailures === wave.length && waveFailures > 0 && !result.stopped) result.stopped = 'other';
    }
    for (const unit of job.units.slice(index)) {
        if (!result.failures.has(unit.unit)) result.failures.set(unit.unit, { kind: 'not_attempted', message: 'Not attempted: drawing stopped earlier.' });
    }
    return result;
}

const KEY_LABEL = (key: string) => key.replace('_', ' ');
const placeholder = (key: string) =>
    `<span class="pb-missing" data-unit="${key}">Not generated yet. Other illustrations are saved. Ask to redraw illustration ${KEY_LABEL(key)}.</span>`;

/**
 * 本のテンプレート（{{UNIT_n}} 入り）に URL を入れる。まだ無い絵は「未生成」の枠にする。
 * 枠は data-unit を持つので、あとで fillPictureUnits で 1 枚ずつ埋められる。
 */
export function assemblePictureBook(job: PictureJob, result: Pick<PictureResult, 'urls' | 'sheetUrl'>, currentMarkdown: string): string {
    let template = job.book_markdown?.trim();
    if (!template) {
        const fm = currentMarkdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        const header = (fm ? fm[1].split(/\r?\n/).filter((line) => !/^\s*layout\s*:/.test(line)).join('\n') : '').trim();
        template = `---\n${header ? `${header}\n` : ''}layout: full\n---\n\n${job.units.map((u) => `<div class="pb-page"><img src="{{UNIT_${u.unit}}}" alt=""></div>`).join('\n\n***\n\n')}\n`;
    }
    return template
        .replace(/<img\b[^>]*\bsrc="\{\{UNIT_(\d+(?:_[LR1-4])?)\}\}"[^>]*>/g, (tag, key) => {
            const url = result.urls.get(key);
            return url ? tag.replace(/\{\{UNIT_[^}]*\}\}/, url) : placeholder(key);
        })
        .replace(/!\[[^\]]*\]\(\s*\{\{UNIT_(\d+(?:_[LR1-4])?)\}\}\s*\)/g, (_m, key) => {
            const url = result.urls.get(key);
            return url ? `![Illustration ${KEY_LABEL(key)}](${url})` : placeholder(key);
        })
        .replace(/\{\{UNIT_(\d+(?:_[LR1-4])?)\}\}/g, (_m, key) => result.urls.get(key) ?? '')
        .replace(/\{\{SHEET\}\}/g, result.sheetUrl ?? '');
}

/**
 * 今の本の「未生成」の枠に、できた絵を 1 つずつ入れる。他の絵・文章には触らない。
 * 古い形式の枠（"Illustration N could not be drawn"）にも対応する。表紙（type: cover）は cover_image に入れる。
 */
export function fillPictureUnits(markdown: string, units: PictureUnit[], urls: Map<string, string>): string {
    let out = markdown;
    for (const unit of units) {
        const keys = unit.type === 'wide' ? [`${unit.unit}_L`, `${unit.unit}_R`] : unit.type === 'grid' ? unit.scenes.map((_, i) => `${unit.unit}_${i + 1}`) : [String(unit.unit)];
        if (unit.type === 'cover') {
            const url = urls.get(String(unit.unit));
            if (url) out = out.replace(/^(cover_image:)[ \t]*.*$/m, `$1 ${url}`);
            continue;
        }
        for (const key of keys) {
            const url = urls.get(key);
            if (!url) continue;
            // A frame with data-unit="N" is found by its number, whatever text is inside it
            const byKey = new RegExp(`<span class="pb-missing"[^>]*\\bdata-unit="${key}"[^>]*>[^<]*</span>`, 'g');
            // Old frames have no data-unit; "illustration 1" must not match "illustration 10"
            const escaped = key.replace('_', '[ _]');
            const legacy = new RegExp(`<span class="pb-missing">[^<]*[Ii]llustration ${escaped}(?![0-9A-Za-z])[^<]*</span>`, 'g');
            out = out.replace(byKey, `<img src="${url}" alt="">`).replace(legacy, `<img src="${url}" alt="">`);
        }
    }
    return out;
}

/** 本の中で「未生成」の枠として残っている絵の番号（再開の対象） */
export function findMissingPictureKeys(markdown: string): string[] {
    const keys = new Set<string>();
    for (const m of markdown.matchAll(/<span class="pb-missing"(?: data-unit="([^"]+)")?>([^<]*)<\/span>/g)) {
        const key = m[1] || m[2].match(/[Ii]llustration (\d+(?: [LR1-4])?)/)?.[1]?.replace(' ', '_');
        if (key) keys.add(key);
    }
    return [...keys];
}

const KIND_TEXT: Record<PictureFailureKind, string> = {
    rate_limit: 'Rate limit or quota reached (429). Not retried automatically. Wait about 1 minute (per-minute limit) or until tomorrow (daily limit) before asking again.',
    auth: 'Not allowed (sign-in or plan).',
    storage: 'Image storage limit reached. Delete unused images first.',
    safety: 'Blocked by the image safety filter. Change the scene description.',
    split: 'Drawn, but cutting the picture into pages failed.',
    not_attempted: 'Not attempted because drawing stopped earlier.',
    other: 'Image generation failed.'
};

/**
 * 結果の説明（チャットに表示し、AI にも見える）。
 * 描けた絵は 1 枚ずつ、本に入ったかどうかを markdown で確かめ、URL も出す（入らなかった絵を AI が edit で枠に入れられるように）。
 */
export function describePictureResult(job: PictureJob, result: PictureResult, markdown: string, cancelled = false): string {
    const total = job.units.length;
    const failed = [...result.failures.entries()].filter(([unit]) => unit > 0);
    const drawn = job.units.filter((u) => [...result.urls.keys()].some((k) => k === String(u.unit) || k.startsWith(`${u.unit}_`)));
    const lines: string[] = [];
    const placedLines: string[] = [];
    let placedUnits = 0;
    for (const unit of drawn) {
        const entries = [...result.urls.entries()].filter(([k]) => k === String(unit.unit) || k.startsWith(`${unit.unit}_`));
        const missing = entries.filter(([, url]) => !markdown.includes(url));
        if (missing.length === 0) placedUnits++;
        for (const [key, url] of entries) {
            const label = KEY_LABEL(key);
            placedLines.push(markdown.includes(url)
                ? `✅ Illustration ${label}: placed in the book — ${url}`
                : `⚠️ Illustration ${label}: drawn, but NOT placed in the book (no matching frame) — ${url}`);
        }
    }
    lines.push(`🎨 Drawn ${drawn.length}/${total} illustrations, placed in the book ${placedUnits}/${total}.`);
    if (cancelled) lines.push('⏹ Drawing was cancelled. Illustrations not listed below were not drawn.');
    if (result.stopped) lines.push(`⏹ Drawing stopped early (${result.stopped === 'other' ? 'every illustration in the last batch failed' : result.stopped}).`);
    if (result.sheetUrl && result.sheetUrl !== job.character_sheet_url) lines.push(`🧑‍🎨 New character sheet — ${result.sheetUrl}`);
    lines.push(...placedLines);
    if (placedLines.some((l) => l.startsWith('⚠️'))) lines.push('Illustrations marked NOT placed are already drawn: put the URL into the matching frame with an edit. Do not draw them again.');
    const sheet = result.failures.get(0);
    if (sheet) lines.push(`⚠️ ${sheet.message}`);
    for (const [unit, f] of failed.sort((a, b) => a[0] - b[0])) {
        const detail = f.kind === 'not_attempted' ? '' : ` — ${f.message}`;
        lines.push(`⚠️ Illustration ${unit}: ${KIND_TEXT[f.kind]}${detail}`);
        const wide = result.wideSources.get(unit);
        if (wide) lines.push(`   The drawn picture itself is saved: ${wide} (redraw with source_url to only retry the cut; no new image is generated).`);
    }
    if (failed.length) lines.push('Illustrations that were drawn are kept and will not be drawn again; only the failed ones are missing.');
    return lines.join('\n');
}
