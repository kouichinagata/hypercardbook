import { isCardLike, isMiniApp } from '$lib/play-mode';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSameDocument, parseBookFrontmatter } from '$lib/book-frontmatter';

export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        const payload = await request.json();
        const markdown = payload.markdown as string;
        const { id, is_public, published_at } = payload;
        const session = locals.session;
        const supabase = locals.supabase;

        if (!session) {
            return json({ error: 'Unauthorized. Please login first.' }, { status: 401 });
        }

        if (!markdown) {
            return json({ error: 'No markdown content provided.' }, { status: 400 });
        }

        const isUuid = id ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) : false;
        const fm = parseBookFrontmatter(markdown);
        const { slug, title, author, coverImage, themeColor, playMode, isPublic: fmIsPublic, publishedAt: fmPublishedAt, ddcCode } = fm;

        const isCard = isCardLike(playMode);

        const bookData: any = {
            user_id: session.user.id,
            title,
            author: author || null,
            cover_image: coverImage || null,
            theme_color: themeColor || (isCard ? 'white' : 'black'),
            markdown_content: markdown,
            ddc_code: ddcCode || null
        };

        const resolvedIsPublic = is_public !== undefined ? is_public : (fmIsPublic !== undefined ? fmIsPublic : undefined);
        const resolvedPublishedAt = published_at !== undefined ? published_at : (fmPublishedAt !== undefined ? fmPublishedAt : undefined);

        if (id && isUuid) {
            bookData.id = id;
            // Fetch existing fields to prevent overwriting with defaults
            const { data: existingBook } = await supabase
                .from('books')
                .select('slug, is_public, published_at, markdown_content')
                .eq('id', id)
                .single();

            if (existingBook) {
                // MiniApp の id / play_mode が消える・変わる保存は拒否する（AI の返信文の誤保存などで MiniApp が壊れるのを防ぐ）
                const existingMarkdown = existingBook.markdown_content || '';
                if (isMiniApp(parseBookFrontmatter(existingMarkdown).playMode) && !isSameDocument(existingMarkdown, markdown)) {
                    console.warn('[save] rejected: a MiniApp must keep its id and play_mode', id);
                    return json({ error: 'Save rejected: a MiniApp must keep its id and play_mode.' }, { status: 409 });
                }
                bookData.slug = slug || existingBook.slug;
                bookData.is_public = resolvedIsPublic !== undefined ? resolvedIsPublic : existingBook.is_public;
                bookData.published_at = resolvedPublishedAt !== undefined ? resolvedPublishedAt : existingBook.published_at;
            } else {
                bookData.slug = slug || `book-${Date.now()}`;
                bookData.is_public = resolvedIsPublic !== undefined ? resolvedIsPublic : false;
                bookData.published_at = resolvedPublishedAt !== undefined ? resolvedPublishedAt : null;
            }
        } else {
            bookData.slug = slug || `book-${Date.now()}`;
            bookData.is_public = resolvedIsPublic !== undefined ? resolvedIsPublic : false;
            bookData.published_at = resolvedPublishedAt !== undefined ? resolvedPublishedAt : null;
        }

        const { data, error: dbError } = await supabase
            .from('books')
            .upsert(bookData)
            .select('id, version')
            .single();

        if (dbError) {
            console.error('Database save error:', dbError);
            return json({ error: dbError.message }, { status: 500 });
        }

        // StackやHyperRoboが公開された場合、内包するコンテンツも自動的に公開する
        if (resolvedIsPublic === true) {
            const idsToPublish = new Set<string>();

            // 再帰的に関係する本を収集する関数
            const collectAndPublish = async (markdownContent: string, currentPlayMode: string) => {
                if (currentPlayMode === 'stack') {
                    const lines = markdownContent.split('\n');
                    for (const line of lines) {
                        const trimmed = line.trim();
                        // book, card, paperobo, hyperrobo のすべてのリンクからIDを抽出
                        const match = trimmed.match(/^-\s*\[(.*?)\]\((book|card|paperobo|hyperrobo|stack):(.*)\)/);
                        if (match) {
                            const subId = match[3].trim();
                            if (subId && !idsToPublish.has(subId)) {
                                idsToPublish.add(subId);
                                // 子アイテムがさらにStackやHyperRoboであれば、その中身も再帰的に収集
                                const { data: subBook } = await supabase
                                    .from('books')
                                    .select('play_mode, markdown_content')
                                    .eq('id', subId)
                                    .eq('user_id', session.user.id)
                                    .maybeSingle();
                                if (subBook) {
                                    await collectAndPublish(subBook.markdown_content || '', subBook.play_mode || 'book');
                                }
                            }
                        }
                    }
                } else if (currentPlayMode === 'hyperrobo') {
                    // HyperRobo のフロントマターから hyperbook_id を取得し、再帰的に収集
                    let hyperbookId = '';
                    const fmMatch = markdownContent.match(/^---\s*([\s\S]*?)\s*---/);
                    if (fmMatch && fmMatch[1]) {
                        const fmLines = fmMatch[1].split('\n');
                        fmLines.forEach((line: string) => {
                            const parts = line.split(':');
                            if (parts.length >= 2 && parts[0].trim() === 'hyperbook_id') {
                                hyperbookId = parts.slice(1).join(':').trim();
                            }
                        });
                    }
                    if (hyperbookId && !idsToPublish.has(hyperbookId)) {
                        idsToPublish.add(hyperbookId);
                        const { data: subBook } = await supabase
                            .from('books')
                            .select('play_mode, markdown_content')
                            .eq('id', hyperbookId)
                            .eq('user_id', session.user.id)
                            .maybeSingle();
                        if (subBook) {
                            await collectAndPublish(subBook.markdown_content || '', subBook.play_mode || 'book');
                        }
                    }
                }
            };

            await collectAndPublish(markdown, playMode);

            if (idsToPublish.size > 0) {
                const { error: updateError } = await supabase
                    .from('books')
                    .update({ is_public: true, published_at: new Date().toISOString() })
                    .in('id', Array.from(idsToPublish))
                    .eq('user_id', session.user.id);
                if (updateError) {
                    console.error('Failed to update stack items to public:', updateError);
                }
            }
        }

        return json({ success: true, id: data.id, version: data.version });
    } catch (err: any) {
        console.error('Save API Error:', err);
        return json({ error: err.message || 'Failed to save book.' }, { status: 500 });
    }
};
