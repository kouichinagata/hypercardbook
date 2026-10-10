import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GoogleGenAI } from '@google/genai';
import { getActiveGeminiApiKey } from '$lib/server/plan';
import { imageModelLabel, isImageModelId } from '$lib/ai-model';
import { effectivePlanFromUser, isPaidPlan, isProPlan } from '$lib/plan';
import {
    ALLOWED_ASPECT_RATIOS,
    DEFAULT_IMAGE_MODEL,
    IMAGE_BUCKET,
    generateAndStoreImage,
    loadReferenceInputs,
    measureStoredBytes,
    storageLimitForPlan,
    type AspectRatio
} from '$lib/server/image-gen';

type GeneratedImage = {
    url: string;
    name: string;
};

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

        const plan = effectivePlanFromUser(session.user);
        const paidPlanActive = isPaidPlan(plan);
        const proPlanActive = isProPlan(plan);
        // 自分の Gemini キーで生成するユーザーは、費用が自己負担なのでプランによる制限（使用可否・枚数）を受けない。
        // 保存容量の上限（プラン別）は、こちらのストレージを使うので従来どおり適用する。
        const userGeminiKey = request.headers.get('x-user-gemini-api-key')?.trim() || '';
        const hasOwnKey = Boolean(userGeminiKey);
        if (source !== 'home' && !paidPlanActive && !hasOwnKey) {
            return json({ error: 'Image generation in workspace requires Standard plan or above.' }, { status: 403 });
        }
        const requestedModel = request.headers.get('x-user-image-model')?.trim() || '';
        const model = hasOwnKey && isImageModelId(requestedModel) ? requestedModel : DEFAULT_IMAGE_MODEL;

        // 1回の通信の時間制限があるため、1リクエストは最大4枚。それ以上はクライアントが分けて呼ぶ。
        const requestedCount = Number.isFinite(Number(count)) ? Math.floor(Number(count)) : 1;
        const imageCount = proPlanActive || hasOwnKey
            ? Math.min(Math.max(requestedCount, 1), 4)
            : 1;
        const outputAspectRatio = ALLOWED_ASPECT_RATIOS.has(String(aspectRatio))
            ? String(aspectRatio) as AspectRatio
            : imageCount > 1 ? '2:3' : '1:1';

        const apiKey = getActiveGeminiApiKey(session, userGeminiKey);
        if (!apiKey) {
            return json({ error: 'GEMINI_API_KEY is not set.' }, { status: 500 });
        }

        const userId = session.user.id;
        const referenceInputs = await loadReferenceInputs(
            supabase,
            userId,
            Array.isArray(referenceImages) ? referenceImages.slice(0, 1) : []
        );
        if (!referenceInputs) {
            return json({ error: 'Could not load the reference image.' }, { status: 400 });
        }

        const quota = { used: await measureStoredBytes(supabase, userId), limit: storageLimitForPlan(plan) };
        const ai = new GoogleGenAI({ apiKey });
        const images: GeneratedImage[] = [];

        for (let index = 0; index < imageCount; index++) {
            const variantPrompt = imageCount > 1
                ? `${prompt.trim()}\n\nCreate variation ${index + 1} of ${imageCount} with a distinct composition while preserving the requested subject and style.`
                : prompt.trim();
            const stored = await generateAndStoreImage({
                supabase,
                ai,
                userId,
                model,
                prompt: variantPrompt,
                aspectRatio: outputAspectRatio,
                references: referenceInputs,
                quota,
                label: `${imageModelLabel(model)} (variation ${index + 1})`
            });
            uploadedPaths.push(stored.path);
            images.push({ url: stored.url, name: stored.name });
        }

        return json({
            success: true,
            images,
            plan,
            count: images.length,
            model
        });
    } catch (err: any) {
        if (uploadedPaths.length > 0) {
            await locals.supabase.storage.from(IMAGE_BUCKET).remove(uploadedPaths);
        }
        console.error('[Generate-Image Error]:', err);
        return json({ error: err.message || 'Failed to generate image' }, { status: 500 });
    }
};
