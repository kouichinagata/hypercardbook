import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GoogleGenAI } from '@google/genai';
import { env } from '$env/dynamic/private';
import { getActiveGeminiApiKey } from '$lib/server/plan';

const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export const POST: RequestHandler = async ({ request, locals, fetch }) => {
    try {
        const { bookId, targetLanguage } = await request.json();
        const supabase = locals.supabase;

        if (!bookId || !targetLanguage) {
            return json({ error: 'Missing bookId or targetLanguage' }, { status: 400 });
        }

        // 1. DBキャッシュを確認（UUID形式のIDを持つユーザー本のみ）
        const useDbCache = isUuid(bookId);
        if (useDbCache) {
            const { data: cached, error: cacheError } = await supabase
                .from('book_translations')
                .select('title, author, markdown_content')
                .eq('book_id', bookId)
                .eq('language', targetLanguage)
                .maybeSingle();

            if (cached) {
                return json({
                    title: cached.title,
                    author: cached.author,
                    markdown: cached.markdown_content
                });
            }
        }

        // 2. オリジナル書籍データの取得
        let originalMarkdown = '';
        if (useDbCache) {
            // DBから取得
            const { data: original, error: dbError } = await supabase
                .from('books')
                .select('markdown_content')
                .eq('id', bookId)
                .single();

            if (dbError || !original) {
                return json({ error: 'Original book not found in database' }, { status: 404 });
            }
            originalMarkdown = original.markdown_content || '';
        } else {
            // 静的サンプル本を取得
            const sampleFilename = bookId.endsWith('.md') ? bookId : `${bookId}.md`;
            const res = await fetch(`/samples/${sampleFilename}`);
            if (!res.ok) {
                return json({ error: 'Sample book not found' }, { status: 404 });
            }
            originalMarkdown = await res.text();
        }

        if (!originalMarkdown.trim()) {
            return json({ error: 'Original markdown content is empty' }, { status: 400 });
        }

        // 3. Gemini APIによる翻訳
        const session = locals.session;
        const apiKey = getActiveGeminiApiKey(session, request.headers.get('x-user-gemini-api-key'));
        if (!apiKey) {
            return json({ error: 'GEMINI_API_KEY is not set.' }, { status: 500 });
        }

        const ai = new GoogleGenAI({ apiKey });

        const systemPrompt = `You are an expert translator. Your task is to translate the provided Markdown document into ${targetLanguage}.

CRITICAL RULES:
1. Translate only user-facing prose text (e.g. titles, sub-titles, prose body, lists, table content, descriptions).
2. DO NOT translate, change, or corrupt any Markdown formatting syntax, layout tags, or metadata structure:
   - Keep YAML frontmatter keys (id, play_mode, cover_image, theme_color, etc.) EXACTLY as they are.
   - You MUST translate frontmatter values ONLY for the 'title', 'sub_title', and 'author' keys (or 'author_bio' if present).
   - Keep image links like ![alt](URL) intact. Do not translate or modify the URL, but you may translate the alt text if appropriate.
   - Keep video links like \`video: URL\` intact.
   - Keep any HTML structures, inline styles, custom classes, <style> tags, CSS, or scripts completely unchanged.
   - Maintain page dividers like "Page X:" exactly as they are.
3. Ensure the tone is natural and appropriate for the context (e.g., if it is a children's picture book, use gentle, simple phrasing suitable for children in that language).
4. Output ONLY the translated Markdown document. Do not include any chat commentary or explanation outside the markdown block.
`;

        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: [{ role: 'user', parts: [{ text: originalMarkdown }] }],
            config: {
                systemInstruction: systemPrompt,
                temperature: 0.3
            }
        });

        let translatedMarkdown = response.text || '';
        // 稀にマークダウンコードブロックで囲まれることがあるためトリミング
        if (translatedMarkdown.startsWith('```markdown')) {
            translatedMarkdown = translatedMarkdown.replace(/^```markdown\n/, '').replace(/\n```$/, '');
        } else if (translatedMarkdown.startsWith('```')) {
            translatedMarkdown = translatedMarkdown.replace(/^```\n/, '').replace(/\n```$/, '');
        }

        // 4. 翻訳タイトル・著者名のパース
        let title = 'Untitled';
        let author = '';
        const fmMatch = translatedMarkdown.match(/^---\s*([\s\S]*?)\s*---/);
        if (fmMatch) {
            const fmLines = fmMatch[1].split('\n');
            fmLines.forEach((line) => {
                const parts = line.split(':');
                if (parts.length >= 2) {
                    const k = parts[0].trim();
                    const v = parts.slice(1).join(':').trim();
                    if (k === 'title') title = v;
                    if (k === 'author') author = v;
                }
            });
        }

        // 5. DBへのキャッシュ保存（UUID形式のユーザー本のみ）
        if (useDbCache) {
            const { error: insertError } = await supabase
                .from('book_translations')
                .insert({
                    book_id: bookId,
                    language: targetLanguage,
                    title: title,
                    author: author,
                    markdown_content: translatedMarkdown
                });

            if (insertError) {
                console.error('Failed to cache translation in database:', insertError);
                // キャッシュ保存失敗でも、ユーザー体験のために翻訳結果はそのまま返す
            }
        }

        return json({
            title,
            author,
            markdown: translatedMarkdown
        });

    } catch (err: any) {
        console.error('Translation error:', err);
        return json({ error: err.message || 'Failed to translate content.' }, { status: 500 });
    }
};
