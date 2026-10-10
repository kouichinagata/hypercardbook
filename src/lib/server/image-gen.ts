import type { GoogleGenAI } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';

// 画像生成（Gemini の Nano Banana 系）と Supabase Storage への保存。
// /api/generate-image と、チャットの generate_manga_pages ツールで共用する。
export const IMAGE_BUCKET = 'HyperCardBookBucket';
export { DEFAULT_IMAGE_MODEL } from '$lib/ai-model';
export const ALLOWED_ASPECT_RATIOS = new Set(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']);

export type AspectRatio = '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9';
export type ReferenceInput = { type: 'image'; data: string; mime_type: 'image/png' | 'image/jpeg' | 'image/webp' };
/** 保存容量の使用量。並列生成でも同じオブジェクトを共有して加算する。 */
export type ImageQuota = { used: number; limit: number };
export type StoredImage = { url: string; name: string; path: string; bytes: Buffer; mimeType: string };

export function storageLimitForPlan(plan: string): number {
    if (plan === 'pro' || plan === 'enterprise') return 1024 * 1024 * 1024;
    if (plan === 'standard') return 200 * 1024 * 1024;
    return 20 * 1024 * 1024;
}

function storagePathFromPublicUrl(rawUrl: string, userId: string): string | null {
    try {
        const url = new URL(rawUrl);
        const prefix = `/storage/v1/object/public/${IMAGE_BUCKET}/${userId}/`;
        if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || !url.pathname.startsWith(prefix)) {
            return null;
        }
        const relativePath = decodeURIComponent(url.pathname.slice(`/storage/v1/object/public/${IMAGE_BUCKET}/`.length));
        return relativePath.startsWith(`${userId}/`) ? relativePath : null;
    } catch {
        return null;
    }
}

function extensionForMimeType(mimeType: string): string {
    if (mimeType === 'image/png') return 'png';
    if (mimeType === 'image/webp') return 'webp';
    return 'jpg';
}

export function referenceFromBytes(bytes: Buffer, mimeType: string): ReferenceInput {
    return {
        type: 'image',
        data: bytes.toString('base64'),
        mime_type: mimeType === 'image/png' || mimeType === 'image/webp' ? mimeType : 'image/jpeg'
    };
}

/** 本人のストレージにある画像の URL を参照画像として読み込む。読めない画像があれば null。 */
export async function loadReferenceInputs(
    supabase: SupabaseClient,
    userId: string,
    urls: unknown[]
): Promise<ReferenceInput[] | null> {
    const inputs: ReferenceInput[] = [];
    for (const rawUrl of urls) {
        const storagePath = storagePathFromPublicUrl(String(rawUrl), userId);
        if (!storagePath) continue;
        const { data, error } = await supabase.storage.from(IMAGE_BUCKET).download(storagePath);
        if (error || !data) return null;
        inputs.push(referenceFromBytes(Buffer.from(await data.arrayBuffer()), data.type));
    }
    return inputs;
}

export async function measureStoredBytes(supabase: SupabaseClient, userId: string): Promise<number> {
    const { data, error } = await supabase.storage.from(IMAGE_BUCKET).list(userId, { limit: 1000 });
    if (error) throw new Error('Could not verify the image storage limit.');
    return (data || []).reduce((total, file) => total + Number(file.metadata?.size || 0), 0);
}

/** 1 枚生成して Storage に保存する。保存した path は呼び出し側が失敗時の掃除に使える。 */
export async function generateAndStoreImage(options: {
    supabase: SupabaseClient;
    ai: GoogleGenAI;
    userId: string;
    model: string;
    prompt: string;
    aspectRatio: AspectRatio;
    references: ReferenceInput[];
    quota: ImageQuota;
    /** 画像が返らなかったときのエラーメッセージ用の名前 */
    label?: string;
}): Promise<StoredImage> {
    const { supabase, ai, userId, model, prompt, aspectRatio, references, quota, label = 'The image model' } = options;
    const interaction = await ai.interactions.create({
        model,
        input: [
            { type: 'text', text: prompt },
            ...references
        ],
        response_format: {
            type: 'image',
            mime_type: 'image/jpeg',
            aspect_ratio: aspectRatio,
            image_size: '1K'
        }
    });
    const outputImage = interaction.output_image;
    if (!outputImage?.data) {
        throw new Error(`${label} returned no image.`);
    }

    const bytes = Buffer.from(outputImage.data, 'base64');
    if (quota.used + bytes.byteLength > quota.limit) {
        throw new Error('Image storage limit exceeded.');
    }

    const mimeType = outputImage.mime_type || 'image/jpeg';
    const name = `nanobanana_${crypto.randomUUID()}.${extensionForMimeType(mimeType)}`;
    const path = `${userId}/${name}`;
    const { error: uploadError } = await supabase.storage
        .from(IMAGE_BUCKET)
        .upload(path, bytes, {
            contentType: mimeType,
            cacheControl: '31536000',
            upsert: false
        });
    if (uploadError) throw uploadError;

    quota.used += bytes.byteLength;
    const { data: publicUrlData } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
    return { url: publicUrlData.publicUrl, name, path, bytes, mimeType };
}
