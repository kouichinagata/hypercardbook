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

function applyPageEdit(currentMarkdown: string, pageIndex: number, action: 'update' | 'delete' | 'insert', newContent: string): string {
    const fmMatch = currentMarkdown.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n)([\s\S]*)$/);
    let fm = '';
    let content = currentMarkdown;
    if (fmMatch) {
        fm = fmMatch[1];
        content = fmMatch[2];
    }

    if (pageIndex === 0) {
        if (action === 'update') {
            return `---\n${newContent.trim()}\n---\n${content}`;
        }
        return currentMarkdown;
    }

    const parts = content.split(/(Page\s*\d+:|(?:^|\n)\s*\*\*\*\s*(?:\n|$))/i);
    const pages: string[] = [];
    const delimiters: string[] = [];
    
    delimiters.push('');
    for (let i = 0; i < parts.length; i++) {
        if (i === 0) {
            pages.push(parts[i]);
        } else if (i % 2 === 1) {
            delimiters.push(parts[i]);
        } else {
            pages.push(parts[i]);
        }
    }

    const newPages = [...pages];
    const newDelimiters = [...delimiters];

    if (pageIndex >= 1 && pageIndex < newPages.length) {
        if (action === 'update') {
            newPages[pageIndex] = '\n' + newContent.trim() + '\n';
        } else if (action === 'delete') {
            newPages[pageIndex] = '';
            newDelimiters[pageIndex] = '';
        } else if (action === 'insert') {
            newPages.splice(pageIndex, 0, '\n' + newContent.trim() + '\n');
            newDelimiters.splice(pageIndex, 0, '\n***\n');
        }
    } else if (pageIndex === newPages.length) {
        if (action === 'insert' || action === 'update') {
            newPages.push('\n' + newContent.trim() + '\n');
            newDelimiters.push('\n***\n');
        }
    }

    let finalContent = newPages[0];
    for (let i = 1; i < newPages.length; i++) {
        if (newPages[i] === '' && newDelimiters[i] === '') continue;
        finalContent += (newDelimiters[i] || '') + newPages[i];
    }

    return fm + finalContent;
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
     - author: <Author Name>
     - cover_image: <URL of Unsplash cover image suitable for the topic>
     - theme_color: black
     - description: <A concise, 1-2 sentence description summarizing the book's content for tooltips>
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
   - Keep the text density per page moderate. The text content for each page must be strictly within 200 characters and 12 lines (including auto-wrapped lines). Do not write extremely short, poem-like sentences.
   - Increase the page count by breaking topics, counts, or categories across many pages (when there is no user specification, generate a book of at least 30 pages or more).
   - If writing a countdown or top 10 list, dedicate one spread (2 pages) per rank (separated by "***"):
     - Left page (1st page of spread): A short video reference using \`video: URL\` or standard Markdown image using \`![alt](URL)\`.
     - Right page (2nd page of spread): The rank title (e.g. \`## 10位: <Name>\`) and a brief description.

3. VIDEO AND IMAGE SYNTAX:
   - DO NOT invent or generate video URLs on your own. Only use the \`video: <URL>\` syntax if a specific video URL is explicitly provided by the user in their prompt. If no video URL is provided, do not include any video placeholders; use standard Markdown image syntax \`![alt](URL)\` instead.
   - For images, use standard Markdown image syntax: \`![alt](URL)\`.
   - DEFAULT IMAGE PLACEMENT: When inserting an image into a page/card, you MUST place the image Markdown at the very bottom of the page/card content (below the main body text/explanations), unless the user has explicitly requested a different position. Placing large images at the top or in the middle of a card shrinks the space available for text and causes the body text to be cut off or truncated. Therefore, always default to placing images AFTER the description text.

4. TEMPLATE INHERITANCE AND STYLE PRESERVATION:
   - If the current Markdown contains custom HTML tags (e.g. \`<div class="...">\`), inline styling, a \`<style>\` block (CSS), or a \`<script>\` block (JavaScript), you must reference and adapt them.
   - Unless explicitly requested by the user, preserve the existing HTML layout structure, CSS class names, styling parameters, and script logic. Integrate the new content (titles, text, media URLs) seamlessly into these structures.
   - Analyze and mimic the writing style (sentence length, politeness level like "です/ます" or "である/だ", rhythm, use of emojis) of the current book markdown.

5. MODIFICATIONS:
   - If the user asks to modify the book, and the changes are minor or localized (e.g., rewriting a page, fixing typos, editing frontmatter), you MUST call the \`edit_page\` tool instead of rewriting the entire block.
   - Only rewrite the ENTIRE Markdown block using the \`\`\`markdown code block if the request requires massive structural changes (e.g., rewriting all pages, styling changes that affect every page).

6. RESPONSE FORMAT:
   - You MUST output real-time progress/status updates to the user (e.g., "Designing the overall book structure...", "Generating the markdown cards...", "Applying final style adjustments...") throughout the generation process. Do NOT remain silent.
   - For full book generation: Output these progress messages first to tell the user what you are doing, then start the \`\`\`markdown block. Do NOT start the response directly with the code block.
   - For partial updates (using tools): You MUST output clear status messages explaining what you are doing (e.g., "Analyzing the request...", "Calling the edit_page tool to update page 3...") during the tool call turns. Your response MUST NOT contain any markdown block (\`\`\`markdown). Just provide a conversational explanation (e.g., "I have updated page 3 with your changes."). in your response.

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

9. HYPERHOOKS (イベントフック):
   - For event hooks (\`on_open_stack\`, \`on_close_stack\`, \`on_open_card\`, \`on_close_card\`, \`on_mouse_up\`), you can use JavaScript with: goCard(index), saveData(key, value), getData(key), alert(msg), or AI instructions starting with "[AI]".
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
     - author: <Author Name>
     - cover_image: <URL of Unsplash cover image suitable for the topic>
     - theme_color: white
     - description: <A concise, 1-2 sentence description summarizing the card's content for tooltips>
   - You can also include:
     - sub_title: <subtitle of the card (optional)>
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
   - DEFAULT IMAGE PLACEMENT: When inserting an image into the card body, you MUST place the image Markdown at the very bottom of the content (below the main body text/explanations), unless the user has explicitly requested a different position. This prevents the text from being pushed down and cut off. Always default to placing images AFTER the description text.
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

  8. HYPERHOOKS (イベントフック):
    - For event hooks (\`on_open_stack\`, \`on_open_stack\`, \`on_open_card\`, \`on_close_card\`, \`on_mouse_up\`), you can use JavaScript with: goCard(index), saveData(key, value), getData(key), alert(msg), or AI instructions starting with "[AI]".
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
        const authorName = userMetadata.nickname || userMetadata.full_name || 'Anonymous';

        let activeSystemInstruction = mode === 'card' ? cardSystemInstruction : systemInstruction;

        activeSystemInstruction += `\n\nAUTHOR INFO:\n- The author of this book/card is strictly "${authorName}". You MUST populate the "author: ${authorName}" field in the YAML frontmatter.`;

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
                if (activePluginIds.includes(s.id) || activePluginIds.includes(`my-plugin-${s.id}`)) {
                    activeSystemInstruction += `\n\nACTIVE SKILL RULES for "${s.id}" (Apply these rules strictly when requested/relevant):\n"""\n${s.body.trim()}\n"""`;
                }
            });
        }

        const stream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                
                try {
                    let localContents = [...contents];
                    let responseText = '';
                    let updatedMarkdown = currentMarkdown;
                    let lastPageEdit: any = null;

                    for (let turn = 0; turn < 10; turn++) {
                        const toolDeclarations = [
                            {
                                name: 'edit_page',
                                description: 'Edit, delete, or insert a specific page (card) or the frontmatter in the current book/card document. Use for minor edits.',
                                parameters: {
                                    type: 'OBJECT',
                                    properties: {
                                        page_index: {
                                            type: 'INTEGER',
                                            description: '1-based page index (1 for page 1, 2 for page 2). Set to 0 to update frontmatter.'
                                        },
                                        action: {
                                            type: 'STRING',
                                            description: 'Action: "update", "delete", or "insert"'
                                        },
                                        new_content: {
                                            type: 'STRING',
                                            description: 'The new page content or frontmatter yaml text.'
                                        }
                                    },
                                    required: ['page_index', 'action', 'new_content']
                                }
                            }
                        ];

                        if (activePluginIds.includes('gdrive-mcp')) {
                            toolDeclarations.push(
                                {
                                    name: 'gdrive_search_files',
                                    description: 'Search for files in Google Drive. Returns a list of matching files.',
                                    parameters: {
                                        type: 'OBJECT',
                                        properties: {
                                            query: { type: 'STRING', description: 'Search query.' }
                                        }
                                    }
                                },
                                {
                                    name: 'gdrive_read_file',
                                    description: 'Read the contents of a specific file from Google Drive by its fileId.',
                                    parameters: {
                                        type: 'OBJECT',
                                        properties: {
                                            fileId: { type: 'STRING', description: 'The unique ID of the file to read.' }
                                        },
                                        required: ['fileId']
                                    }
                                }
                            );
                        }

                        const tools = [{ functionDeclarations: toolDeclarations }];

                        const responseStream = await ai.models.generateContentStream({
                            model: 'gemini-3.5-flash',
                            contents: localContents,
                            config: {
                                systemInstruction: activeSystemInstruction,
                                temperature: 0.7,
                                maxOutputTokens: 65536,
                                tools: tools
                            }
                        });

                        let functionCalls: any[] = [];
                        let firstCandidate: any = null;

                        for await (const chunk of responseStream) {
                            const candidate = chunk.candidates?.[0];
                            if (candidate) {
                                firstCandidate = candidate;
                                const calls = candidate.content?.parts?.filter((p: any) => p.functionCall);
                                if (calls && calls.length > 0) {
                                    functionCalls.push(...calls);
                                }
                            }

                            const text = chunk.text;
                            if (text) {
                                responseText += text;
                                controller.enqueue(encoder.encode(text));
                            }
                        }

                        if (functionCalls.length > 0) {
                            localContents.push({
                                role: 'model',
                                parts: firstCandidate.content.parts
                            });

                            const functionResponses = [];
                            for (const call of functionCalls) {
                                const fc = call.functionCall;
                                if (!fc) continue;

                                let resultData = null;

                                if (fc.name === 'edit_page') {
                                    const pageIdx = Number(fc.args?.page_index);
                                    const act = String(fc.args?.action) as 'update' | 'delete' | 'insert';
                                    const newCont = String(fc.args?.new_content);

                                    updatedMarkdown = applyPageEdit(updatedMarkdown, pageIdx, act, newCont);
                                    lastPageEdit = { page_index: pageIdx, action: act, new_content: newCont };
                                    resultData = { success: true, message: `Page ${pageIdx} successfully modified.` };
                                } else if (fc.name === 'gdrive_search_files') {
                                    const queryArg = fc.args?.query || '';
                                    const jsonRpcResponse = handleGdriveMcpRequest({
                                        jsonrpc: '2.0',
                                        method: 'tools/call',
                                        params: { name: 'gdrive_search_files', arguments: { query: queryArg } },
                                        id: Date.now()
                                    });
                                    resultData = jsonRpcResponse.result;
                                } else if (fc.name === 'gdrive_read_file') {
                                    const fileIdArg = fc.args?.fileId || '';
                                    const jsonRpcResponse = handleGdriveMcpRequest({
                                        jsonrpc: '2.0',
                                        method: 'tools/call',
                                        params: { name: 'gdrive_read_file', arguments: { fileId: fileIdArg } },
                                        id: Date.now()
                                    });
                                    resultData = jsonRpcResponse.result;
                                }

                                functionResponses.push({
                                    functionResponse: {
                                        name: fc.name,
                                        response: { result: resultData }
                                    }
                                });
                            }

                            localContents.push({
                                role: 'user',
                                parts: functionResponses
                            });

                        } else {
                            break;
                        }
                    }

                    if (lastPageEdit) {
                        const partialTag = `\n[UPDATE_PAGES]\n[PAGE ${lastPageEdit.page_index}]\n${lastPageEdit.new_content}\n[/PAGE]\n[/UPDATE_PAGES]\n`;
                        controller.enqueue(encoder.encode(partialTag));
                        
                        const mdBlock = `\n\`\`\`markdown\n${updatedMarkdown}\n\`\`\`\n`;
                        controller.enqueue(encoder.encode(mdBlock));
                    }

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
                                text: responseText + (lastPageEdit ? ' (Page updated via tool)' : '')
                            });
                        }
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
