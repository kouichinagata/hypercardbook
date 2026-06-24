import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GoogleGenAI } from '@google/genai';
import { env } from '$env/dynamic/private';
import fs from 'fs';
import path from 'path';

function parseSkillMd(content: string) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!match) {
        return {
            metadata: {} as Record<string, string>,
            body: content
        };
    }
    const yamlStr = match[1];
    const body = match[2];
    const metadata: Record<string, string> = {};
    yamlStr.split('\n').forEach(line => {
        const parts = line.split(':');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            const value = parts.slice(1).join(':').trim();
            metadata[key] = value;
        }
    });
    return { metadata, body };
}

interface SkillInfo {
    id: string;
    name: string;
    description: string;
    body: string;
}

function getAvailableSkills(userId: string): SkillInfo[] {
    const skills: SkillInfo[] = [];
    const baseDir = path.resolve('data/skills');
    
    const scanDirs = [
        { dir: path.join(baseDir, 'global') },
        { dir: path.join(baseDir, userId) }
    ];

    for (const { dir } of scanDirs) {
        if (!fs.existsSync(dir)) continue;
        const subdirs = fs.readdirSync(dir, { withFileTypes: true });
        for (const subdir of subdirs) {
            if (subdir.isDirectory()) {
                const skillId = subdir.name;
                const skillMdPath = path.join(dir, skillId, 'SKILL.md');
                if (fs.existsSync(skillMdPath)) {
                    try {
                        const content = fs.readFileSync(skillMdPath, 'utf-8');
                        const { metadata, body } = parseSkillMd(content);
                        skills.push({
                            id: skillId,
                            name: metadata.name || skillId,
                            description: metadata.description || '',
                            body: body
                        });
                    } catch (e) {
                        console.error(`Failed to read SKILL.md for ${skillId}:`, e);
                    }
                }
            }
        }
    }
    return skills;
}

const systemInstruction = `
You are HyperCardBook Creator, an AI assistant specialized in creating card-style books for a vertical layout reader.
Your goal is to output a single, complete book in a custom Markdown format based on the user's prompt or modifications.

CRITICAL RULES:
1. OUTPUT FORMAT:
   Your response must contain a YAML frontmatter block at the very top, followed by page sections separated by "***" on their own lines (page breaks).
   - Do NOT use "Page X:" labels or any page pagination labels.
   - The frontmatter block MUST always contain:
     - id: <unique-short-slug, e.g. space-travel-2026>
     - title: <title of the book>
     - play_mode: book
   - DO NOT include frontmatter fields like "author", "cover_image", or "theme_color" unless the user has explicitly requested them in their prompt. Do not populate them with default values.
   - Never use "***" as a horizontal rule separator inside a page. If you need a divider, use "---" instead.
   Example:
   ---
   id: space-travel-2026
   title: Space Travel History
   play_mode: book
   ---

   <Content for page 1>

   ***

   <Content for page 2>
   
   ...

2. DENSITY AND PAGE COUNT:
   - Keep the text density per page moderate. The text content for each page must be strictly within 400 characters and 20 lines (including auto-wrapped lines). Do not write extremely short, poem-like sentences.
   - Increase the page count by breaking topics, counts, or categories across many pages (aim for at least 12-24 pages).
   - If writing a countdown or top 10 list, dedicate one spread (2 pages) per rank (separated by "***"):
     - Left page (1st page of spread): A short video reference using \`video: URL\` or standard Markdown image using \`![alt](URL)\`.
     - Right page (2nd page of spread): The rank title (e.g. \`## 10位: <Name>\`) and a brief description.

3. VIDEO AND IMAGE SYNTAX:
   - DO NOT invent or generate video URLs on your own. Only use the \`video: <URL>\` syntax if a specific video URL is explicitly provided by the user in their prompt. If no video URL is provided, do not include any video placeholders; use standard Markdown image syntax \`![alt](URL)\` instead.
   - For images, use standard Markdown image syntax: \`![alt](URL)\`.

4. TEMPLATE INHERITANCE AND STYLE PRESERVATION:
   - If the current Markdown contains custom HTML tags (e.g. \`<div class="...">\`), inline styling, a \`<style>\` block (CSS), or a \`<script>\` block (JavaScript), you must reference and adapt them.
   - Unless explicitly requested by the user, preserve the existing HTML layout structure, CSS class names, styling parameters, and script logic. Integrate the new content (titles, text, media URLs) seamlessly into these structures.
   - Analyze and mimic the writing style (sentence length, politeness level like "です/ます" or "である/だ", rhythm, use of emojis) of the current book markdown.

5. MODIFICATIONS:
   - If the user asks to modify the book (e.g., "Add a page about X", "Change style to blue", "Rewrite rank 3"), you will receive the current Markdown code. You must rewrite the ENTIRE Markdown block incorporating the changes. Make sure you don't lose any other existing pages unless asked.

6. RESPONSE FORMAT:
   - Provide the complete, raw Markdown book inside a single markdown code block (delimited by \` \`\`\`markdown \` and \` \`\`\` \`).
   - If the user is just chatting or asking a general question without editing the book, you can respond with a conversational text response, but if a book is being generated or edited, ALWAYS output the complete updated markdown code block in your response.

7. ATTACHED IMAGES AND TEXTS:
   - The user may attach images and text files to their prompt.
   - Images will be provided as Markdown links in the prompt, e.g., \`![filename](URL)\`. You must use these exact image URLs in your generated Markdown book if you decide to include images.
   - Text contents will be provided in a code block under "### 添付テキスト". Use the information inside these files to enrich the content, structure, or style of the generated book as requested.

8. CREATE SKILLS COMMAND:
   - If the user asks you to save a rule, prompt, style, or instruction as a Skill, or says "Skills化して" / "Skillsにしといて", you must output a special block at the very end of your response (outside of the markdown code block) in this exact format:
     [CREATE_SKILL: SkillName]
     Prompt text...
     [/CREATE_SKILL]
   - The SkillName should be a short, descriptive name (in English or Japanese) for the skill.
   - The Prompt text should be the detailed instructions/rules to guide the AI to generate/modify content in that specific style or way.

9. HYPERHOOKS AND BOOKMARK SKILLS (しおり・フック):
   - If the user asks to add bookmark features (e.g., "しおりを挟んで", "ポストイット風にして"), you must ONLY generate bookmark hooks inside the YAML frontmatter block. DO NOT generate the \`bookmark_html\` field under any circumstances.
   - Hooks to generate for bookmark features:
     - \`on_open_stack\`: A hook that executes when opening the book to restore the reading position.
       on_open_stack: |
         let p = getData("bookmark_" + stackId);
         if (p !== null) goCard(Number(p));
     - \`on_close_card\`: A hook that executes when leaving a card to save the reading position.
       on_close_card: |
         saveData("bookmark_" + stackId, currentCard);
   - For other event hooks (\`on_open_stack\`, \`on_close_stack\`, \`on_open_card\`, \`on_close_card\`, \`on_mouse_up\`), you can use JavaScript with: goCard(index), saveData(key, value), getData(key), alert(msg), or AI instructions starting with "[AI]".
     Example: \`on_open_card: "[AI] このページを要約して"\`
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

 2. BODY CONTENT STYLE & INFORMATION DENSITY:
   - Since cards are compiled into stacks to form large books or encyclopedias, avoid extremely short, poem-like sentences. Write a detailed, comprehensive, and high-quality long text.
   - To prevent text truncation (token cutoff), maximize information density: write deeply and thoroughly without wordy repetitions or redundant phrases.
   - Use regular Markdown formatting (headings, lists, bold text, links) to structure the explanations beautifully.
   - For images, use standard Markdown image syntax: \`![alt](URL)\`. If the user has attached image URLs (in the prompt under "### 添付画像"), you must prioritize using these exact attached image URLs for the card (e.g. as \`cover_image\` in the frontmatter, or inside the markdown body).
   - DO NOT invent or generate video URLs. Only use the \`video: <URL>\` syntax if a specific video URL is explicitly provided by the user in their prompt. If no video URL is provided, do not include any video placeholders or URLs.

3. TEMPLATE INHERITANCE AND STYLE PRESERVATION:
   - If the current Markdown contains custom HTML tags (e.g. \`<div class="...">\`), inline styling, a \`<style>\` block (CSS), or a \`<script>\` block (JavaScript), you must analyze and adapt them.
   - Unless explicitly requested by the user, preserve the existing HTML layout structure, CSS class names, styling parameters, and script logic. Integrate the new content seamlessly into these structures.
   - Analyze and mimic the writing style (sentence length, tone/politeness level, use of emojis) of the current card markdown.

4. MODIFICATIONS:
   - If the user asks to modify the card (e.g., "change the background color to blue", "update subtitle to X", "add a section about Mount Fuji"), you will receive the current Markdown code. You must rewrite the ENTIRE Markdown block incorporating the changes. Make sure you don't lose any other existing content unless asked.

5. RESPONSE FORMAT:
   - Provide the complete, raw Markdown card inside a single markdown code block (delimited by \` \`\`\`markdown \` and \` \`\`\` \`).
   - If the user is just chatting or asking a general question without editing the card, you can respond with a conversational text response, but if a book is being generated or edited, ALWAYS output the complete updated markdown code block in your response.

6. ATTACHED IMAGES AND TEXTS:
   - The user may attach images and text files to their prompt.
   - Images will be provided as Markdown links in the prompt, e.g., \`![filename](URL)\`. You must use these exact image URLs in your generated Markdown card if you decide to include them.
   - Text contents will be provided in a code block under "### 添付テキスト". Use the information inside these files to enrich the content, structure, or style of the generated card as requested.

 7. CREATE SKILLS COMMAND:
   - If the user asks you to save a rule, prompt, style, or instruction as a Skill, or says "Skills化して" / "Skillsにしといて", you must output a special block at the very end of your response (outside of the markdown code block) in this exact format:
     [CREATE_SKILL: SkillName]
     Prompt text...
     [/CREATE_SKILL]
   - The SkillName should be a short, descriptive name (in English or Japanese) for the skill.
   - The Prompt text should be the detailed instructions/rules to guide the AI to generate/modify content in that specific style or way.

  8. HYPERHOOKS AND BOOKMARK SKILLS (しおり・フック):
    - If the user asks to add bookmark features (e.g., "しおりを挟んで", "ポストイット風にして"), you must ONLY generate bookmark hooks inside the YAML frontmatter block. DO NOT generate the \`bookmark_html\` field under any circumstances.
    - Hooks to generate for bookmark features:
      - \`on_open_stack\`: A hook that executes when opening the card to restore the reading position.
        on_open_stack: |
          let p = getData("bookmark_" + stackId);
          if (p !== null) goCard(Number(p));
      - \`on_close_card\`: A hook that executes when leaving a card to save the reading position.
        on_close_card: |
          saveData("bookmark_" + stackId, currentCard);
    - For other event hooks (\`on_open_stack\`, \`on_close_stack\`, \`on_open_card\`, \`on_close_card\`, \`on_mouse_up\`), you can use JavaScript with: goCard(index), saveData(key, value), getData(key), alert(msg), or AI instructions starting with "[AI]".
      Example: \`on_open_card: "[AI] このページを要約して"\`
`;

// JSON-RPC 2.0 Google Drive MCP Server Mock
function handleGdriveMcpRequest(req: { jsonrpc: string; method: string; params: any; id: any }) {
    const { name, arguments: args } = req.params;
    
    if (name === 'gdrive_search_files') {
        const query = (args?.query || '').toLowerCase();
        const mockFiles = [
            { id: 'gfile-1', name: 'HyperCard Guide.md', type: 'file', content: '# HyperCard Guide\n\nThis is a guide for HyperCardBook, retrieved securely from your Google Drive via MCP.' },
            { id: 'gfile-2', name: 'Idea Sketchbook.md', type: 'file', content: '# Idea Sketchbook\n\nContains various ideas for vertical layout card books including retro styling, quiz cards, and audio tours.' },
            { id: 'gfile-3', name: 'Project Timeline.pdf', type: 'file', content: 'Project Timeline: Phase 1 starts in June, Phase 2 in July.' }
        ];

        const filtered = mockFiles.filter(f => f.name.toLowerCase().includes(query) || f.content.toLowerCase().includes(query));
        
        return {
            jsonrpc: "2.0",
            result: {
                content: [
                    {
                        type: "text",
                        text: `Found ${filtered.length} files in Google Drive matching query "${args?.query || ''}":\n` + 
                              filtered.map(f => `- '${f.name}' (ID: ${f.id}, Type: ${f.type})`).join('\n')
                    }
                ]
            },
            id: req.id
        };
    }

    if (name === 'gdrive_read_file') {
        const fileId = args?.fileId;
        const mockFiles: Record<string, string> = {
            'gfile-1': '# HyperCard Guide\n\nThis is a guide for HyperCardBook, retrieved securely from your Google Drive via MCP.',
            'gfile-2': '# Idea Sketchbook\n\nContains various ideas for vertical layout card books including retro styling, quiz cards, and audio tours.',
            'gfile-3': 'Project Timeline: Phase 1 starts in June, Phase 2 in July.'
        };

        const content = mockFiles[fileId] || `Error: File with ID ${fileId} not found in Google Drive.`;
        
        return {
            jsonrpc: "2.0",
            result: {
                content: [
                    {
                        type: "text",
                        text: content
                    }
                ]
            },
            id: req.id
        };
    }

    return {
        jsonrpc: "2.0",
        error: {
            code: -32601,
            message: "Method not found"
        },
        id: req.id
    };
}



export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        const { prompt, history = [], currentMarkdown = '', bookId, mode = 'book', currentCardIndex = -1, activePluginIds = [] } = await request.json();
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
        if (currentCardIndex !== -1) {
            query += `Current active card/page index (読者が現在開いているページ番号): ${currentCardIndex}\n\n`;
        }
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

        const userMetadata = session?.user?.user_metadata || {};
        const hypercardbookMd = userMetadata.hypercardbook_md || '';
        const custompromptMd = userMetadata.customprompt_md || '';
        const authorBio = userMetadata.author_bio || '';

        let activeSystemInstruction = mode === 'card' ? cardSystemInstruction : systemInstruction;

        // Strict rule for author biography: Do not create biography pages if empty, and prohibit inventing dummy data.
        if (mode === 'book') {
            if (authorBio.trim()) {
                activeSystemInstruction += `\n\nAUTHOR BIOGRAPHY INFO:\nUse this author biography if the book includes or requests an author biography section/page:\n"""\n${authorBio.trim()}\n"""`;
            } else {
                activeSystemInstruction += `\n\nCRITICAL RULE FOR AUTHOR BIOGRAPHY:\nNo author biography details are provided. Do NOT create any author biography pages, empty layout spreads, or placeholders for an author biography. AI must NEVER invent or populate dummy biography content.`;
            }
        } else if (mode === 'card') {
            if (authorBio.trim()) {
                activeSystemInstruction += `\n\nAUTHOR BIOGRAPHY INFO:\nUse this author biography details if relevant to the card content:\n"""\n${authorBio.trim()}\n"""`;
            } else {
                activeSystemInstruction += `\n\nCRITICAL RULE FOR AUTHOR BIOGRAPHY:\nNo author biography details are provided. Do NOT include author biography details or placeholders in the card body.`;
            }
        }

        // Apply config files if defined
        if (hypercardbookMd.trim()) {
            activeSystemInstruction += `\n\nHYPERCARDBOOK SYSTEM CONFIGURATION:\nFollow these configuration guidelines for generating/formatting the book:\n"""\n${hypercardbookMd.trim()}\n"""`;
        }
        if (custompromptMd.trim()) {
            activeSystemInstruction += `\n\nCUSTOM PROMPT GUIDELINES:\nFollow these custom prompt guidelines for style, formatting, and content creation:\n"""\n${custompromptMd.trim()}\n"""`;
        }

        // Dynamic loading of available skills for "Progressive Disclosure"
        const availableSkills = getAvailableSkills(session.user.id);
        if (availableSkills.length > 0) {
            let skillsCatalog = '\n\nAVAILABLE SKILLS:\n';
            availableSkills.forEach(s => {
                skillsCatalog += `- ${s.id}: ${s.description}\n`;
            });
            activeSystemInstruction += skillsCatalog;

            // Inject prompt bodies for active skills
            availableSkills.forEach(s => {
                if (activePluginIds.includes(s.id)) {
                    activeSystemInstruction += `\n\nACTIVE SKILL RULES for "${s.id}" (Apply these rules strictly when requested/relevant):\n"""\n${s.body.trim()}\n"""`;
                }
            });
        }

        // Helper to perform Gemini content generation with multi-turn tool (MCP) resolution
        async function generateWithMcpResolution(currentContents: any[], activeSystemInstruction: string, activePluginIds: string[], ai: any): Promise<string> {
            let localContents = [...currentContents];
            
            for (let turn = 0; turn < 10; turn++) {
                const tools = activePluginIds.includes('gdrive-mcp') ? [
                    {
                        functionDeclarations: [
                            {
                                name: 'gdrive_search_files',
                                description: 'Search for files in Google Drive. Returns a list of matching files.',
                                parameters: {
                                    type: 'OBJECT',
                                    properties: {
                                        query: {
                                            type: 'STRING',
                                            description: 'Search query to filter files.'
                                        }
                                    }
                                }
                            },
                            {
                                name: 'gdrive_read_file',
                                description: 'Read the contents of a specific file from Google Drive by its fileId.',
                                parameters: {
                                    type: 'OBJECT',
                                    properties: {
                                        fileId: {
                                            type: 'STRING',
                                            description: 'The unique ID of the file to read.'
                                        }
                                    },
                                    required: ['fileId']
                                }
                            }
                        ]
                    }
                ] : undefined;

                const response = await ai.models.generateContent({
                    model: 'gemini-3.5-flash',
                    contents: localContents,
                    config: {
                        systemInstruction: activeSystemInstruction,
                        temperature: 0.7,
                        maxOutputTokens: 65536,
                        tools: tools
                    }
                });

                const candidate = response.candidates?.[0];
                const functionCalls = candidate?.content?.parts?.filter((p: any) => p.functionCall);

                if (functionCalls && functionCalls.length > 0) {
                    // Save model's function calls to content history
                    localContents.push({
                        role: 'model',
                        parts: candidate.content.parts
                    });

                    const functionResponses = [];
                    for (const call of functionCalls) {
                        const fc = call.functionCall;
                        if (!fc) continue;

                        let resultData = null;
                        if (fc.name === 'gdrive_search_files') {
                            const queryArg = fc.args?.query || '';
                            const jsonRpcRequest = {
                                jsonrpc: '2.0',
                                method: 'tools/call',
                                params: {
                                    name: 'gdrive_search_files',
                                    arguments: { query: queryArg }
                                },
                                id: Date.now()
                            };
                            const jsonRpcResponse = handleGdriveMcpRequest(jsonRpcRequest);
                            resultData = jsonRpcResponse.result;
                        } else if (fc.name === 'gdrive_read_file') {
                            const fileIdArg = fc.args?.fileId || '';
                            const jsonRpcRequest = {
                                jsonrpc: '2.0',
                                method: 'tools/call',
                                params: {
                                    name: 'gdrive_read_file',
                                    arguments: { fileId: fileIdArg }
                                },
                                id: Date.now()
                            };
                            const jsonRpcResponse = handleGdriveMcpRequest(jsonRpcRequest);
                            resultData = jsonRpcResponse.result;
                        }

                        functionResponses.push({
                            functionResponse: {
                                name: fc.name,
                                response: { result: resultData }
                            }
                        });
                    }

                    // Push tool results to history for next model turn
                    localContents.push({
                        role: 'user',
                        parts: functionResponses
                    });

                } else {
                    // No function call, return final generated text
                    return response.text || '';
                }
            }
            throw new Error('MCP loop exceeded maximum turns.');
        }

        const responseText = await generateWithMcpResolution(contents, activeSystemInstruction, activePluginIds, ai);

        const encoder = new TextEncoder();
        
        // Persist chat history if bookId is available
        if (bookId && responseText) {
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
                    text: responseText
                });
            }
        }

        const stream = new ReadableStream({
            async start(controller) {
                try {
                    const chunkSize = 20; // Send 20 chars at a time
                    for (let i = 0; i < responseText.length; i += chunkSize) {
                        const chunk = responseText.slice(i, i + chunkSize);
                        controller.enqueue(encoder.encode(chunk));
                        await new Promise(resolve => setTimeout(resolve, 15)); // Simulates typing effect
                    }
                    controller.close();
                } catch (err: any) {
                    console.error('Stream processing error:', err);
                    controller.error(err);
                }
            }
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Transfer-Encoding': 'chunked',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            }
        });

    } catch (err: any) {
        console.error('Gemini API Error:', err);
        return json({ error: err.message || 'Failed to generate content.' }, { status: 500 });
    }
};
