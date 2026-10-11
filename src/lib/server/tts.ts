import type { GoogleGenAI } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GEMINI_TTS_MODEL } from '$lib/ai-model';
import { IMAGE_BUCKET, type ImageQuota } from '$lib/server/image-gen';

// セリフを Gemini TTS で音声にして Storage に保存する。manga-sprite Skill の generate_speech ツールが使う。
/** 1 回のツール呼び出しで受け取る最大セリフ数（1 セリフ = Gemini 1 回呼び出し） */
export const SPEECH_MAX_LINES = 8;
const SPEECH_MAX_CHARS = 300;
export const DEFAULT_SPEECH_VOICE = 'Kore';
/** 24kHz・モノラル・16bit の PCM（Gemini TTS の出力形式） */
const BYTES_PER_SECOND = 24000 * 2;

export interface SpeechLine {
    text: string;
    voice?: string;
}

export interface SpeechResult {
    ok: boolean;
    url?: string;
    /** 音声の長さ（秒、小数 2 桁） */
    duration_sec?: number;
    error?: string;
}

/** WAV の data チャンクの長さから秒数を出す。読めなければファイルサイズから見積もる。 */
export function wavDurationSec(bytes: Buffer): number {
    let offset = 12;
    while (offset + 8 <= bytes.length) {
        const id = bytes.toString('ascii', offset, offset + 4);
        const size = bytes.readUInt32LE(offset + 4);
        if (id === 'data') {
            // ストリーム書き出しなどで size が 0 / 0xFFFFFFFF のときは、残りすべてを data とみなす
            const dataSize = size === 0 || size === 0xffffffff ? bytes.length - offset - 8 : Math.min(size, bytes.length - offset - 8);
            return Math.round((dataSize / BYTES_PER_SECOND) * 100) / 100;
        }
        offset += 8 + size + (size % 2);
    }
    return Math.round((Math.max(bytes.length - 44, 0) / BYTES_PER_SECOND) * 100) / 100;
}

/** セリフ 1 つを音声にして Storage に保存する。保存した path は呼び出し側が掃除に使える。 */
async function generateAndStoreSpeech(options: {
    supabase: SupabaseClient;
    ai: GoogleGenAI;
    userId: string;
    line: SpeechLine;
    quota: ImageQuota;
}): Promise<{ url: string; path: string; duration_sec: number }> {
    const { supabase, ai, userId, line, quota } = options;
    const interaction = await ai.interactions.create({
        model: GEMINI_TTS_MODEL,
        input: [{
            type: 'user_input',
            content: [{
                type: 'text',
                text: line.text,
                // 倍速で見る人が多いので、ゆっくり読ませない
                annotations: [{ type: 'speech_metadata', style: 'natural, clear and brisk, with a lively pace' }]
            }]
        }],
        response_format: { type: 'audio' },
        generation_config: { speech_config: [{ voice: line.voice || DEFAULT_SPEECH_VOICE }] }
    } as any);
    const audio = (interaction as any).output_audio;
    if (!audio?.data) throw new Error('The speech model returned no audio.');

    const bytes = Buffer.from(audio.data, 'base64');
    if (quota.used + bytes.byteLength > quota.limit) {
        throw new Error('Storage limit exceeded.');
    }

    const path = `${userId}/tts_${crypto.randomUUID()}.wav`;
    const { error: uploadError } = await supabase.storage
        .from(IMAGE_BUCKET)
        .upload(path, bytes, { contentType: 'audio/wav', cacheControl: '31536000', upsert: false });
    if (uploadError) throw uploadError;

    quota.used += bytes.byteLength;
    const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, path, duration_sec: wavDurationSec(bytes) };
}

/**
 * 複数のセリフを並列に音声化する。1 つの失敗は他に影響させず、その行の error に入れる。
 * 容量チェックは並列実行前の使用量で行うため、同時に走る分の合計は厳密ではない（最大 8 件・数 MB）。
 */
export async function generateSpeeches(options: {
    supabase: SupabaseClient;
    ai: GoogleGenAI;
    userId: string;
    lines: SpeechLine[];
    quota: ImageQuota;
}): Promise<SpeechResult[]> {
    const { supabase, ai, userId, quota } = options;
    return Promise.all(options.lines.slice(0, SPEECH_MAX_LINES).map(async (line): Promise<SpeechResult> => {
        const text = line.text.trim().slice(0, SPEECH_MAX_CHARS);
        if (!text) return { ok: false, error: 'text is empty.' };
        let lastError = 'Speech generation failed.';
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const stored = await generateAndStoreSpeech({ supabase, ai, userId, line: { ...line, text }, quota });
                return { ok: true, url: stored.url, duration_sec: stored.duration_sec };
            } catch (err: any) {
                lastError = err?.message || lastError;
                if (lastError === 'Storage limit exceeded.') break;
            }
        }
        return { ok: false, error: lastError };
    }));
}
