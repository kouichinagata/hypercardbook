import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GoogleGenAI } from '@google/genai';
import { getActiveGeminiApiKey } from '$lib/server/plan';

export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        const { prompt, count = 1, aspect_ratio = '1:1', source = 'home' } = await request.json();
        const session = locals.session;

        if (!session) {
            return json({ error: 'Unauthorized. Please login first.' }, { status: 401 });
        }

        const plan = session.user?.user_metadata?.plan || 'free';
        const isPro = ['pro', 'enterprise'].includes(plan);
        const isStandard = plan === 'standard';

        // Check workspace restriction
        if (source === 'workspace' && plan === 'free') {
            return json({ error: 'Image generation in workspace requires Standard plan or above.' }, { status: 403 });
        }

        // Limit count based on plan
        let maxCount = 1;
        if (isPro) {
            maxCount = Math.min(Math.max(1, count), 4);
        }

        if (!prompt || !prompt.trim()) {
            return json({ error: 'Prompt is required for image generation.' }, { status: 400 });
        }

        const apiKey = getActiveGeminiApiKey(session, request.headers.get('x-user-gemini-api-key'));
        const images: Array<{ url: string; name: string }> = [];

        if (apiKey) {
            try {
                const ai = new GoogleGenAI({ apiKey });
                // Attempt image generation with Imagen 3
                const response = await ai.models.generateImages({
                    model: 'imagen-3.0-generate-002',
                    prompt: prompt.trim(),
                    config: {
                        numberOfImages: maxCount,
                        outputMimeType: 'image/jpeg',
                        aspectRatio: aspect_ratio || '1:1'
                    }
                });

                if (response.generatedImages && response.generatedImages.length > 0) {
                    for (let i = 0; i < response.generatedImages.length; i++) {
                        const img = response.generatedImages[i];
                        if (img.image && img.image.imageBytes) {
                            const dataUrl = `data:image/jpeg;base64,${img.image.imageBytes}`;
                            images.push({
                                url: dataUrl,
                                name: `nanobanana_img_${Date.now()}_${i + 1}.jpg`
                            });
                        }
                    }
                }
            } catch (imgError) {
                console.warn('[Generate-Image] Imagen API error, fallback to NanoBanana High-Speed Generator:', imgError);
            }
        }

        // Fallback or secondary fast generator if Imagen returned empty or errored
        if (images.length === 0) {
            for (let i = 0; i < maxCount; i++) {
                const encodedPrompt = encodeURIComponent(prompt.trim() + (maxCount > 1 ? ` variant ${i + 1}` : ''));
                const seed = Math.floor(Math.random() * 1000000);
                const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?nologo=true&seed=${seed}`;
                images.push({
                    url: imageUrl,
                    name: `nanobanana_lite_${Date.now()}_${i + 1}.jpg`
                });
            }
        }

        return json({
            success: true,
            images,
            plan,
            count: images.length
        });

    } catch (err: any) {
        console.error('[Generate-Image Error]:', err);
        return json({ error: err.message || 'Failed to generate image' }, { status: 500 });
    }
};
