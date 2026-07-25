import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GoogleGenAI } from '@google/genai';
import { getActiveGeminiApiKey } from '$lib/server/plan';

const BUCKET = 'HyperCardBookBucket';
const MODEL = 'gemini-3.1-flash-lite-image';
const ALLOWED_ASPECT_RATIOS = new Set(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']);

type GeneratedImage = {
    url: string;
    name: string;
};

function storageLimitForPlan(plan: string): number {
    if (plan === 'pro' || plan === 'enterprise') return 1024 * 1024 * 1024;
    if (plan === 'standard') return 200 * 1024 * 1024;
    return 20 * 1024 * 1024;
}

function storagePathFromPublicUrl(rawUrl: string, userId: string): string | null {
    try {
        const url = new URL(rawUrl);
        const prefix = `/storage/v1/object/public/${BUCKET}/${userId}/`;
        if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || !url.pathname.startsWith(prefix)) {
            return null;
        }
        const relativePath = decodeURIComponent(url.pathname.slice(`/storage/v1/object/public/${BUCKET}/`.length));
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

export const POST: RequestHandler = async ({ request, locals }) => {
    const uploadedPaths: string[] = [];

    try {
        const {
            prompt,
            count = 1,
            aspectRatio = '1:1',
            source = 'workspace',
            referenceImages = []
        } = await request.json();
        const session = locals.session;
        const supabase = locals.supabase;

        if (!session) {
            return json({ error: 'Unauthorized. Please login first.' }, { status: 401 });
        }
        if (typeof prompt !== 'string' || !prompt.trim()) {
            return json({ error: 'Prompt is required for image generation.' }, { status: 400 });
        }

        const plan = String(session.user.user_metadata?.plan || 'free');
        const isPaidPlan = ['standard', 'pro', 'enterprise'].includes(plan);
        const isProPlan = ['pro', 'enterprise'].includes(plan);
        if (source !== 'home' && !isPaidPlan) {
            return json({ error: 'Image generation in workspace requires Standard plan or above.' }, { status: 403 });
        }

        const requestedCount = Number.isFinite(Number(count)) ? Math.floor(Number(count)) : 1;
        const imageCount = isProPlan
            ? Math.min(Math.max(requestedCount, 1), 4)
            : 1;
        const outputAspectRatio = ALLOWED_ASPECT_RATIOS.has(String(aspectRatio))
            ? String(aspectRatio) as '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9'
            : imageCount > 1 ? '2:3' : '1:1';

        const apiKey = getActiveGeminiApiKey(session, request.headers.get('x-user-gemini-api-key'));
        if (!apiKey) {
            return json({ error: 'GEMINI_API_KEY is not set.' }, { status: 500 });
        }

        const userId = session.user.id;
        const referenceInputs: Array<{ type: 'image'; data: string; mime_type: 'image/png' | 'image/jpeg' | 'image/webp' }> = [];
        for (const rawUrl of Array.isArray(referenceImages) ? referenceImages.slice(0, 1) : []) {
            const storagePath = storagePathFromPublicUrl(String(rawUrl), userId);
            if (!storagePath) continue;
            const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
            if (error || !data) {
                return json({ error: 'Could not load the reference image.' }, { status: 400 });
            }
            const mimeType = data.type === 'image/png' || data.type === 'image/webp' ? data.type : 'image/jpeg';
            referenceInputs.push({
                type: 'image',
                data: Buffer.from(await data.arrayBuffer()).toString('base64'),
                mime_type: mimeType
            });
        }

        const { data: existingFiles, error: listError } = await supabase.storage
            .from(BUCKET)
            .list(userId, { limit: 1000 });
        if (listError) {
            return json({ error: 'Could not verify the image storage limit.' }, { status: 500 });
        }

        let storedBytes = (existingFiles || []).reduce((total, file) => total + Number(file.metadata?.size || 0), 0);
        const storageLimit = storageLimitForPlan(plan);
        const ai = new GoogleGenAI({ apiKey });
        const images: GeneratedImage[] = [];

        for (let index = 0; index < imageCount; index++) {
            const variantPrompt = imageCount > 1
                ? `${prompt.trim()}\n\nCreate variation ${index + 1} of ${imageCount} with a distinct composition while preserving the requested subject and style.`
                : prompt.trim();
            const interaction = await ai.interactions.create({
                model: MODEL,
                input: [
                    { type: 'text', text: variantPrompt },
                    ...referenceInputs
                ],
                response_format: {
                    type: 'image',
                    mime_type: 'image/jpeg',
                    aspect_ratio: outputAspectRatio,
                    image_size: '1K'
                }
            });
            const outputImage = interaction.output_image;
            if (!outputImage?.data) {
                throw new Error(`Nano Banana 2 Lite returned no image for variation ${index + 1}.`);
            }

            const bytes = Buffer.from(outputImage.data, 'base64');
            if (storedBytes + bytes.byteLength > storageLimit) {
                throw new Error('Image storage limit exceeded.');
            }

            const mimeType = outputImage.mime_type || 'image/jpeg';
            const extension = extensionForMimeType(mimeType);
            const name = `nanobanana_${crypto.randomUUID()}.${extension}`;
            const path = `${userId}/${name}`;
            const { error: uploadError } = await supabase.storage
                .from(BUCKET)
                .upload(path, bytes, {
                    contentType: mimeType,
                    cacheControl: '31536000',
                    upsert: false
                });
            if (uploadError) throw uploadError;

            uploadedPaths.push(path);
            storedBytes += bytes.byteLength;
            const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
            images.push({
                url: publicUrlData.publicUrl,
                name
            });
        }

        return json({
            success: true,
            images,
            plan,
            count: images.length,
            model: MODEL
        });
    } catch (err: any) {
        if (uploadedPaths.length > 0) {
            await locals.supabase.storage.from(BUCKET).remove(uploadedPaths);
        }
        console.error('[Generate-Image Error]:', err);
        return json({ error: err.message || 'Failed to generate image' }, { status: 500 });
    }
};
