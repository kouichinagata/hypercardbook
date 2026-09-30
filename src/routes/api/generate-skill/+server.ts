import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GoogleGenAI } from '@google/genai';
import { env } from '$env/dynamic/private';
import { getActiveGeminiApiKey } from '$lib/server/plan';
import { effectivePlanFromUser, isProPlan } from '$lib/plan';
import { SKILL_DESCRIPTION_MAX, normalizeSkillName } from '$lib/skill-md';
import { GEMINI_TEXT_MODEL } from '$lib/server/models';

const systemInstruction = `You are a meta-prompt engineer who writes Agent Skills for an AI agent (HyperCardBook Creator), which creates card-style books and cards in Markdown.
A Skill is a SKILL.md file. The agent first sees only each skill's name and description, and loads the full instructions only when a request matches the description.

Output a JSON object with exactly these fields:
- "name": lowercase letters, numbers, and hyphens only (max 64 characters), e.g. "horror-effects".
- "description": In the user's language, state WHAT the skill does AND WHEN to use it
  (e.g. "…を行う。…したいとき、…と頼まれたときに使う。"). Max 1024 characters.
  This text is the only thing the agent sees before deciding to load the skill, so make the trigger conditions concrete.
- "skill": Complete Markdown instructions. Write them so a new session can follow them without this conversation.
  Include concrete rules, the expected output format, and short examples.
  If CSS is needed, put it in a \`\`\`css block and state that it must be copied into the book's <style> block.
  Do not include YAML frontmatter.

When refining an existing skill, keep its intent and merge the new requirement; keep the same name unless the user asks to rename it.
Output only raw JSON, with no Markdown fences or explanation.`;

export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        const { name, description, skill, instruction } = await request.json();
        const session = locals.session;

        if (!session) {
            return json({ error: 'Unauthorized. Please login first.' }, { status: 401 });
        }

        if (!isProPlan(effectivePlanFromUser(session.user))) {
            return json({ error: 'Pro plan or above is required.' }, { status: 403 });
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
            model: GEMINI_TEXT_MODEL,
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

        return json({
            name: normalizeSkillName(String(parsed.name || name || '')),
            description: String(parsed.description || '').trim().slice(0, SKILL_DESCRIPTION_MAX),
            skill: String(parsed.skill || '').trim()
        });
    } catch (err: any) {
        console.error('Failed to generate skill:', err);
        return json({ error: err.message || 'Failed to generate skill due to an internal error.' }, { status: 500 });
    }
};
