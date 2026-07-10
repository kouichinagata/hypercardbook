import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GoogleGenAI } from '@google/genai';
import { env } from '$env/dynamic/private';
import { getActiveGeminiApiKey } from '$lib/server/plan';

const systemInstruction = `You are a meta-prompt engineer and AI agent designer. Your job is to create or refine "Skills" for an AI agent (HyperCardBook Creator).
A Skill consists of:
1. "name": A short, clear, and descriptive name (e.g. "Summarizer", "ですます切り替え").
2. "description": A concise description (maximum 200 characters) explaining what the skill does and when the agent should trigger it.
3. "skill": The actual Markdown instruction body (Skill文) that guides the AI agent on how to behave, format, or process information when this skill is invoked. This can contain variable placeholders (e.g., {to_lang}, {input}) which will be parsed dynamically.

You must output a JSON object containing these three fields:
{
  "name": "...",
  "description": "...",
  "skill": "..."
}

Do not return any other text, markdown blocks, or explanation. Output only raw JSON.`;

export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        const { name, description, skill, instruction } = await request.json();
        const session = locals.session;

        if (!session) {
            return json({ error: 'Unauthorized. Please login first.' }, { status: 401 });
        }

        const apiKey = getActiveGeminiApiKey(session, request.headers.get('x-user-gemini-api-key'));
        if (!apiKey) {
            return json({ error: 'GEMINI_API_KEY is not set.' }, { status: 500 });
        }

        if (!instruction || !instruction.trim()) {
            return json({ error: 'Instruction prompt is required.' }, { status: 400 });
        }

        const ai = new GoogleGenAI({ apiKey });

        let query = '';
        if (skill && skill.trim()) {
            query += `Current Skill details:\n`;
            query += `- Name: ${name || ''}\n`;
            query += `- Description: ${description || ''}\n`;
            query += `- Skill Text (Skill文): \n"""\n${skill}\n"""\n\n`;
            query += `User instruction to refine/modify this Skill: "${instruction}"`;
        } else {
            query += `User instruction to create a new Skill from scratch: "${instruction}"`;
        }

        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: [
                {
                    role: 'user',
                    parts: [{ text: query }]
                }
            ],
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: 'application/json',
                temperature: 0.2
            }
        });

        const textResponse = response.text || '';
        const parsed = JSON.parse(textResponse);

        return json(parsed);
    } catch (err: any) {
        console.error('Failed to generate skill:', err);
        return json({ error: err.message || 'Failed to generate skill due to an internal error.' }, { status: 500 });
    }
};
