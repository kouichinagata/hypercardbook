import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GoogleGenAI } from '@google/genai';
import { env } from '$env/dynamic/private';

const systemInstruction = `
You are HyperCardBook Creator, an AI assistant specialized in creating card-style books for a vertical layout reader.
Your goal is to output a single, complete book in a custom Markdown format based on the user's prompt or modifications.

CRITICAL RULES:
1. OUTPUT FORMAT:
   Your response must contain a YAML frontmatter block at the very top, followed by page sections separated by "Page X:" labels.
   - The frontmatter block MUST always contain:
     - id: <unique-short-slug, e.g. space-travel-2026>
     - title: <title of the book>
     - play_mode: book
   - DO NOT include frontmatter fields like "author", "cover_image", or "theme_color" unless the user has explicitly requested them in their prompt. Do not populate them with default values.
   Example:
   ---
   id: space-travel-2026
   title: Space Travel History
   play_mode: book
   ---

   Page 1:
   <Content for page 1>

   Page 2:
   <Content for page 2>
   
   ...

2. DENSITY AND PAGE COUNT:
   - The user has requested: "本の内容は、ショート動画のiFrame, 図写真、文字で、１ページに記述する文字数は極力へらして、ページ数を多くする。" (Keep the text density per page extremely low. Limit paragraphs to 1-2 short sentences, maximum 30-40 characters in Japanese per page where possible).
   - Increase the page count by breaking topics, counts, or categories across many pages (aim for at least 12-24 pages).
   - If writing a countdown or top 10 list, dedicate one spread (2 pages) per rank:
     - Left page (e.g. Page 3): A short video reference using \`video: URL\` or image using \`image: URL\`.
     - Right page (e.g. Page 4): The rank title (e.g. \`## 10位: <Name>\`) and a very brief description (1-2 sentences).

3. VIDEO AND IMAGE SYNTAX:
   - For videos, use the format: \`video: <URL>\` (only support YouTube Shorts, standard YouTube, TikTok, or Instagram Reels URLs).
   - For images, use the format: \`image: <URL>\` or standard Markdown image: \`![alt](URL)\`.

4. MODIFICATIONS:
   - If the user asks to modify the book (e.g., "Add a page about X", "Change style to blue", "Rewrite rank 3"), you will receive the current Markdown code. You must rewrite the ENTIRE Markdown block incorporating the changes. Make sure you don't lose any other existing pages unless asked.

5. RESPONSE FORMAT:
   - Provide the complete, raw Markdown book inside a single markdown code block (delimited by \` \`\`\`markdown \` and \` \`\`\` \`).
   - If the user is just chatting or asking a general question without editing the book, you can respond with a conversational text response, but if a book is being generated or edited, ALWAYS output the complete updated markdown code block in your response.
`;

const cardSystemInstruction = `
You are HyperCard Creator, an AI assistant specialized in creating beautiful single-card Markdown documents.
Your goal is to output a single, complete Markdown card document based on the user's prompt or modifications.

CRITICAL RULES:
1. OUTPUT FORMAT:
   Your response must contain a YAML frontmatter block at the very top, followed directly by the Markdown body content.
   - DO NOT use "Page X:" markers or any page pagination labels.
   - The YAML frontmatter block MUST always contain:
     - id: <unique-short-slug, e.g. volcanic-activity-japan>
     - title: <title of the card>
     - play_mode: card
   - You can also include these frontmatter fields if specified by the user or already present:
     - sub_title: <subtitle of the card (optional)>
     - cover_image: <cover image URL>
     - theme_color: <theme color, default is white if not specified>
   - Example:
     ---
     id: volcanic-activity-japan
     title: Volcanic Wonders of Japan
     sub_title: Explanations of Japan's active volcanic zones
     cover_image: https://images.unsplash.com/photo-...
     theme_color: white
     play_mode: card
     ---
     # Volcanic Wonders of Japan
     Japan is home to over 100 active volcanoes...

2. BODY CONTENT STYLE:
   - Use regular Markdown formatting (headings, lists, bold text, links).
   - Use vertical layouts with Low Text Density: keep explanations punchy, clear, and visually appealing.
   - For images, use standard Markdown image syntax: \`![alt](URL)\`.
   - For videos, use the format: \`video: <URL>\` (only support YouTube Shorts, standard YouTube, TikTok, or Instagram Reels URLs).

3. MODIFICATIONS:
   - If the user asks to modify the card (e.g., "change the background color to blue", "update subtitle to X", "add a section about Mount Fuji"), you will receive the current Markdown code. You must rewrite the ENTIRE Markdown block incorporating the changes. Make sure you don't lose any other existing content unless asked.

4. RESPONSE FORMAT:
   - Provide the complete, raw Markdown card inside a single markdown code block (delimited by \` \`\`\`markdown \` and \` \`\`\` \`).
   - If the user is just chatting or asking a general question without editing the card, you can respond with a conversational text response, but if a book is being generated or edited, ALWAYS output the complete updated markdown code block in your response.
`;

export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        const { prompt, history = [], currentMarkdown = '', bookId, mode = 'book' } = await request.json();
        const session = locals.session;
        const supabase = locals.supabase;

        if (!session) {
            return json({ error: 'Unauthorized. Please login first.' }, { status: 401 });
        }

        const apiKey = env.GEMINI_API_KEY;
        if (!apiKey) {
            return json({ error: 'GEMINI_API_KEY is not set in environment variables or .env file.' }, { status: 500 });
        }

        const ai = new GoogleGenAI({ apiKey });

        let query = '';
        if (currentMarkdown) {
            query += `Current book markdown:\n\`\`\`markdown\n${currentMarkdown}\n\`\`\`\n\n`;
        }
        
        query += `User's latest request: ${prompt}`;

        const contents = [
            ...history.map((h: any) => ({
                role: h.role === 'user' ? 'user' : 'model',
                parts: [{ text: h.text }]
            })),
            {
                role: 'user',
                parts: [{ text: query }]
            }
        ];

        const activeSystemInstruction = mode === 'card' ? cardSystemInstruction : systemInstruction;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contents,
            config: {
                systemInstruction: activeSystemInstruction,
                temperature: 0.7,
                maxOutputTokens: 8192,
            }
        });

        const replyText = response.text || '';
        
        let extractedMarkdown = '';
        const mdBlockMatch = replyText.match(/```markdown([\s\S]*?)```/i);
        if (mdBlockMatch) {
            extractedMarkdown = mdBlockMatch[1].trim();
        } else {
            const genericBlockMatch = replyText.match(/```(?:[\w-]*\n)?([\s\S]*?)```/);
            if (genericBlockMatch) {
                extractedMarkdown = genericBlockMatch[1].trim();
            } else if (replyText.includes('---')) {
                const startIndex = replyText.indexOf('---');
                extractedMarkdown = replyText.substring(startIndex).trim();
            }
        }

        // Persist chat history if bookId is available
        if (bookId) {
            const { data: bookCheck } = await supabase
                .from('books')
                .select('id')
                .eq('id', bookId)
                .eq('user_id', session.user.id)
                .single();

            if (bookCheck) {
                await supabase.from('chat_messages').insert({
                    book_id: bookId,
                    role: 'user',
                    text: prompt
                });

                await supabase.from('chat_messages').insert({
                    book_id: bookId,
                    role: 'model',
                    text: replyText
                });
            }
        }

        return json({
            text: replyText,
            markdown: extractedMarkdown || currentMarkdown
        });
    } catch (err: any) {
        console.error('Gemini API Error:', err);
        return json({ error: err.message || 'Failed to generate content.' }, { status: 500 });
    }
};
