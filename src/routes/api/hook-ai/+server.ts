import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GoogleGenAI } from '@google/genai';
import { env } from '$env/dynamic/private';
import { getActiveGeminiApiKey } from '$lib/server/plan';

const systemInstruction = `You are an AI assistant executing a HyperHook for a HyperCardBook.
The user is reading a page (Card) in a book (Stack).
You will be given the event type, the user's custom instruction, and the text of the page they are currently reading.

Your goal is to execute the instruction based on the page content and return a JSON object with two fields:
1. "result": The text response to be displayed to the user in their AI chat.
2. "command": (Optional) A single line of JavaScript command to be executed in the browser. 
   You can ONLY use the following primitive functions:
   - goCard(index: number) : Navigate to a specific card index (e.g. goCard(5))
   - saveData(key: string, value: any) : Save a value locally (e.g. saveData("my_key", 10))
   - getData(key: string) : Read a saved value (e.g. getData("my_key"))
   - alert(msg: string) : Show a popup window (e.g. alert("Warning!"))

Examples of output:
{
  "result": "アポロ11号が月面に降り立った歴史的な場面です。次はスペースシャトルの紹介に進みましょう。",
  "command": "alert('月面着陸のページに到達しました！')"
}

Do not return any other text, markdown blocks, or explanation. Output only raw JSON.`;

export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        const { eventName, instruction, cardText, stackId, currentCard } = await request.json();
        const session = locals.session;

        if (!session) {
            return json({ error: 'Unauthorized. Please login first.' }, { status: 401 });
        }

        const plan = session.user?.user_metadata?.plan || 'free';
        const isProPlan = ['pro', 'enterprise'].includes(plan);
        if (!isProPlan) {
            return json({ error: 'Pro plan or above is required.' }, { status: 403 });
        }

        const apiKey = getActiveGeminiApiKey(session, request.headers.get('x-user-gemini-api-key'));
        if (!apiKey) {
            return json({ error: 'GEMINI_API_KEY is not set.' }, { status: 500 });
        }

        const ai = new GoogleGenAI({ apiKey });

        let query = `Event: ${eventName}\n`;
        query += `Current Card Index: ${currentCard}\n`;
        query += `Current Card Text:\n"""\n${cardText}\n"""\n\n`;
        query += `Instruction to execute: "${instruction}"`;

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

        const textResponse = response.text || '{}';
        const parsed = JSON.parse(textResponse);

        return json(parsed);
    } catch (err: any) {
        console.error('Failed to execute hook AI:', err);
        return json({ error: err.message || 'Failed to execute hook AI due to an internal error.' }, { status: 500 });
    }
};
