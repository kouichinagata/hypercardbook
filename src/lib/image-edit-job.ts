// 絵の修正ジョブ（サーバー・ブラウザ共通）。絵本・まんがの両方で使う。
// チャット AI が edit_images ツールで「どの絵を、どう直すか」を渡し、ブラウザが元の絵を参考画像にして
// /api/generate-image で描き直す。できた絵は、本の中の元の絵の URL と入れ替える（表紙の cover_image も含む）。
import { requestImage } from '$lib/manga-job';

export const IMAGE_EDIT_OPEN = '[IMAGE_EDIT_JOB]';
export const IMAGE_EDIT_CLOSE = '[/IMAGE_EDIT_JOB]';
/** 1 回の依頼で直せる絵の枚数 */
export const IMAGE_EDITS_MAX = 4;

export interface ImageEdit {
    /** 直す絵（本の中にある画像の URL） */
    image_url: string;
    /** 直したい内容（英語） */
    instruction: string;
}

export interface ImageEditJob {
    edits: ImageEdit[];
}

const clip = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);

/** ツール引数を検証して整える。不正なら error を返す。 */
export function normalizeImageEditChunk(args: any): { job: ImageEditJob } | { error: string } {
    const raw = Array.isArray(args?.edits) ? args.edits : [];
    if (raw.length === 0) return { error: 'edits must contain at least one edit.' };
    if (raw.length > IMAGE_EDITS_MAX) return { error: `Send at most ${IMAGE_EDITS_MAX} edits per request.` };
    const edits: ImageEdit[] = [];
    for (const r of raw) {
        const image_url = clip(r?.image_url, 1_000);
        const instruction = clip(r?.instruction, 1_500);
        if (!/^https:\/\//.test(image_url)) return { error: `Invalid image_url: ${image_url || '(empty)'}` };
        if (!instruction) return { error: `No instruction for ${image_url}.` };
        edits.push({ image_url, instruction });
    }
    return { job: { edits } };
}

/** ストリーム文字列から [IMAGE_EDIT_JOB]…[/IMAGE_EDIT_JOB] をすべて取り出して 1 つにまとめる。 */
export function extractImageEditJob(text: string): ImageEditJob | null {
    const edits: ImageEdit[] = [];
    for (const match of text.matchAll(/\[IMAGE_EDIT_JOB\]([\s\S]*?)\[\/IMAGE_EDIT_JOB\]/g)) {
        try {
            const parsed = JSON.parse(match[1]);
            if (Array.isArray(parsed?.edits)) edits.push(...parsed.edits);
        } catch {
            // 壊れたチャンクは無視する
        }
    }
    return edits.length ? { edits } : null;
}

export function buildEditPrompt(instruction: string): string {
    return `Edit the attached picture. Make only this change:
${instruction}

Keep everything else exactly the same as the attached picture: the composition, framing, characters (faces, hair, clothes), colors, lighting, art style and line quality. Do not crop, zoom, or add borders. Do not add any text other than what the change asks for.`;
}

const ASPECTS: [string, number][] = [['1:1', 1], ['2:3', 2 / 3], ['3:2', 3 / 2], ['3:4', 3 / 4], ['4:3', 4 / 3], ['4:5', 4 / 5], ['5:4', 5 / 4], ['9:16', 9 / 16], ['16:9', 16 / 9], ['21:9', 21 / 9]];

/** 元の絵の縦横比に一番近い、生成できる比率（読めないときは 3:4） */
async function aspectOf(url: string): Promise<string> {
    const ratio = await new Promise<number>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 3 / 4);
        img.onerror = () => resolve(3 / 4);
        img.src = url;
    });
    return ASPECTS.reduce((best, cur) => Math.abs(Math.log(cur[1] / ratio)) < Math.abs(Math.log(best[1] / ratio)) ? cur : best)[0];
}

export interface ImageEditResult {
    /** 元の URL → 直した絵の URL */
    replaced: Map<string, string>;
    failed: { image_url: string; message: string }[];
}

/** 1 枚ずつ順に直す。1 枚できるたびに onEdit を呼ぶ（呼び出し側がすぐ本に反映する）。 */
export async function runImageEditJob(
    job: ImageEditJob,
    onProgress: (done: number, total: number) => void,
    signal?: AbortSignal,
    onEdit?: (from: string, to: string) => void
): Promise<ImageEditResult> {
    const result: ImageEditResult = { replaced: new Map(), failed: [] };
    let done = 0;
    for (const edit of job.edits) {
        if (signal?.aborted) throw new Error('Cancelled.');
        try {
            const url = await requestImage(buildEditPrompt(edit.instruction), await aspectOf(edit.image_url), [edit.image_url], signal);
            result.replaced.set(edit.image_url, url);
            onEdit?.(edit.image_url, url);
        } catch (err: any) {
            if (signal?.aborted) throw err;
            result.failed.push({ image_url: edit.image_url, message: err?.message || 'Failed.' });
        }
        onProgress(++done, job.edits.length);
    }
    return result;
}

/** 本の中の元の絵の URL を、直した絵の URL に置き換える（本文の画像も、表紙の cover_image も）。 */
export function applyImageEdit(markdown: string, from: string, to: string): string {
    return markdown.split(from).join(to);
}

/** チャットに出す結果の文。本の中に無かった絵は描かずに飛ばしたことを伝える。 */
export function describeImageEditResult(result: ImageEditResult, notInBook: string[]): string {
    const tried = result.replaced.size + result.failed.length;
    const lines = [`🎨 Edited ${result.replaced.size} of ${tried + notInBook.length} picture${tried + notInBook.length === 1 ? '' : 's'}.`];
    for (const to of result.replaced.values()) lines.push(`✅ Replaced in the book — ${to}`);
    for (const f of result.failed) lines.push(`⚠️ Could not edit ${f.image_url}: ${f.message}`);
    for (const url of notInBook) lines.push(`⚠️ Not edited: this picture is not in the book — ${url}`);
    return lines.join('\n');
}
