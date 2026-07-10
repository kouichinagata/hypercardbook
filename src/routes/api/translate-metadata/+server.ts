import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GoogleGenAI } from '@google/genai';
import { env } from '$env/dynamic/private';
import { getActiveGeminiApiKey } from '$lib/server/plan';

export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        const { title, author, targetLanguage } = await request.json();
        const session = locals.session;

        if (!title || !targetLanguage) {
            return json({ error: 'Missing title or targetLanguage' }, { status: 400 });
        }

        const apiKey = getActiveGeminiApiKey(session, request.headers.get('x-user-gemini-api-key'));
        if (!apiKey) {
            return json({ error: 'GEMINI_API_KEY is not set.' }, { status: 500 });
        }

        const ai = new GoogleGenAI({ apiKey });

        const prompt = `Translate the following book title and author name into the target language "${targetLanguage}".
You must output a JSON object with keys "title" and "author".
Translate only the values, do not translate the keys.

Title: "${title}"
Author: "${author || ''}"`;

        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                systemInstruction: 'You are an expert translator. Output only valid JSON matching the requested structure.',
                responseMimeType: 'application/json'
            }
        });

        const resText = response.text || '{}';
        const parsed = JSON.parse(resText);

        return json({
            title: parsed.title || title,
            author: parsed.author || author || ''
        });

    } catch (err: any) {
        console.error('Metadata translation error:', err);
        return json({ error: err.message || 'Failed to translate metadata.' }, { status: 500 });
    }
};
