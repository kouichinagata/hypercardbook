import { Type, type GoogleGenAI } from '@google/genai';

// まんがのページ画像から、コマの位置・セリフ・見せ方を Gemini で読み取る。
// manga-sprite Skill の detect_manga_panels ツールが使う。
export const SPRITE_SKILL_NAME = 'manga-sprite';
/** 1 回のツール呼び出しで受け取る最大ページ数（1 ページ = Gemini 1 回呼び出し） */
export const PANEL_DETECT_MAX_PAGES = 8;

export type PanelBeat = 'quick' | 'normal' | 'emphasis';
export type ReadingOrder = 'ltr' | 'rtl';

export interface DetectedPanel {
    /** ページ画像に対する比率（0〜1）。左上が原点 */
    x: number;
    y: number;
    w: number;
    h: number;
    /** コマ内のセリフ・ナレーション（なければ空） */
    text: string;
    beat: PanelBeat;
    /** 表示秒数の初期案（セリフの量と beat から計算） */
    dur: number;
}

export interface PageDetection {
    url: string;
    ok: boolean;
    panels: DetectedPanel[];
    error?: string;
}

export interface PageImage {
    data: string;
    mime_type: string;
}

const BEAT_FACTOR: Record<PanelBeat, number> = { quick: 0.7, normal: 1, emphasis: 1.4 };
const MIN_PANEL_RATIO = 0.05;
const BORDER_INSET = 0.004;

const RESPONSE_SCHEMA = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            box_2d: { type: Type.ARRAY, items: { type: Type.INTEGER } },
            text: { type: Type.STRING },
            beat: { type: Type.STRING, enum: ['quick', 'normal', 'emphasis'] }
        },
        required: ['box_2d', 'text', 'beat']
    }
};

function buildPrompt(order: ReadingOrder): string {
    const reading = order === 'rtl'
        ? 'right to left, then top to bottom (traditional Japanese manga order)'
        : 'left to right, then top to bottom';
    return `This image is one page of a manga. List every panel (frame) on the page in reading order: ${reading}.
For each panel return:
- box_2d: [ymin, xmin, ymax, xmax], integers from 0 to 1000 relative to the whole page image. Fit the box tightly to the inside of the panel's border; do not include the white gutter. If a small panel overlaps a larger one, give each its own box.
- text: all dialogue and narration written inside that panel, in reading order, joined with a space. Use an empty string if there is none.
- beat: "quick" for a brief reaction or transition shot, "emphasis" for a climax, a surprise or an important explanation, otherwise "normal".
Do not return the page's title band or page number as a panel. Return only the JSON array.`;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** セリフの文字数と beat から、表示秒数の初期案を作る（0.5 秒刻み、1.5〜9 秒） */
export function suggestDuration(text: string, beat: PanelBeat): number {
    const chars = text.replace(/\s/g, '').length;
    const seconds = (1.2 + 0.16 * chars) * BEAT_FACTOR[beat];
    return Math.round(clamp(seconds, 1.5, 9) * 2) / 2;
}

/** Gemini の返答（JSON 文字列）を検証して DetectedPanel の配列にする。使えないコマは捨てる。 */
export function parsePanels(raw: string): DetectedPanel[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return [];
    }
    if (!Array.isArray(parsed)) return [];

    const panels: DetectedPanel[] = [];
    for (const item of parsed) {
        const box = Array.isArray(item?.box_2d) ? item.box_2d.map(Number) : [];
        if (box.length !== 4 || box.some((n: number) => !Number.isFinite(n))) continue;
        const [ymin, xmin, ymax, xmax] = box.map((n: number) => clamp(n, 0, 1000) / 1000);
        // 枠線（黒い細線）が切り出しに入らないよう、少し内側に寄せる
        const x = xmin + BORDER_INSET;
        const y = ymin + BORDER_INSET;
        const w = xmax - xmin - BORDER_INSET * 2;
        const h = ymax - ymin - BORDER_INSET * 2;
        if (w < MIN_PANEL_RATIO || h < MIN_PANEL_RATIO) continue;
        const text = String(item?.text ?? '').trim().slice(0, 300);
        const beat: PanelBeat = item?.beat === 'quick' || item?.beat === 'emphasis' ? item.beat : 'normal';
        panels.push({ x: round3(x), y: round3(y), w: round3(w), h: round3(h), text, beat, dur: suggestDuration(text, beat) });
    }
    return panels;
}

/** ページ画像 1 枚のコマを読み取る。 */
export async function detectPanels(ai: GoogleGenAI, model: string, image: PageImage, order: ReadingOrder = 'ltr'): Promise<DetectedPanel[]> {
    const response = await ai.models.generateContent({
        model,
        contents: [{
            role: 'user',
            parts: [
                { inlineData: { mimeType: image.mime_type, data: image.data } },
                { text: buildPrompt(order) }
            ]
        }],
        config: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA, temperature: 0 }
    });
    return parsePanels(response.text ?? '');
}

/**
 * 複数ページを並列に読み取る。1 ページの失敗は他に影響させず、そのページの error に入れる。
 * loadImage は URL から画像を読み込む（読めなければ null）。
 */
export async function detectPages(
    ai: GoogleGenAI,
    model: string,
    urls: string[],
    loadImage: (url: string) => Promise<PageImage | null>,
    order: ReadingOrder = 'ltr'
): Promise<PageDetection[]> {
    return Promise.all(urls.slice(0, PANEL_DETECT_MAX_PAGES).map(async (url): Promise<PageDetection> => {
        const image = await loadImage(url);
        if (!image) return { url, ok: false, panels: [], error: 'Could not load the image (only your own stored images can be read).' };
        let lastError = 'No panels were found.';
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const panels = await detectPanels(ai, model, image, order);
                if (panels.length > 0) return { url, ok: true, panels };
            } catch (err: any) {
                lastError = err?.message || lastError;
            }
        }
        return { url, ok: false, panels: [], error: lastError };
    }));
}
