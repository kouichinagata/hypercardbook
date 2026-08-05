import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
    canonicalizeAiLiveMarkdown,
    extractAiLivePrompt,
    isAiLiveBookMarkdown,
    type AiLiveHistoryEntry
} from '$lib/server/ai-live-book';

export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        const payload = await request.json();
        let markdown = payload.markdown as string;
        const { id, is_public, published_at, aiLiveBook = false, aiLiveSourcePrompt = '' } = payload;
        const session = locals.session;
        const supabase = locals.supabase;

        if (!session) {
            return json({ error: 'Unauthorized. Please login first.' }, { status: 401 });
        }

        if (!markdown) {
            return json({ error: 'No markdown content provided.' }, { status: 400 });
        }

        const isUuid = id ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) : false;
        const { data: existingAiLive } = isUuid
            ? await supabase
                .from('ai_live_books')
                .select('book_id, root_book_id, branch_root_book_id, parent_book_id, owner_user_id, canonical_author, prompt, generation_count, ancestry')
                .eq('book_id', id)
                .maybeSingle()
            : { data: null };
        const requestedAiLive = Boolean(aiLiveBook || existingAiLive || isAiLiveBookMarkdown(markdown));
        const userMetadata = session.user.user_metadata || {};
        const sessionAuthor = userMetadata.nickname || userMetadata.full_name || userMetadata.name || 'Anonymous';
        let editableAiLivePrompt = extractAiLivePrompt(markdown) || existingAiLive?.prompt || String(aiLiveSourcePrompt || '').trim();

        if (existingAiLive) {
            const history = Array.isArray(existingAiLive.ancestry)
                ? existingAiLive.ancestry as AiLiveHistoryEntry[]
                : [];
            markdown = canonicalizeAiLiveMarkdown(markdown, {
                bookId: existingAiLive.book_id,
                rootBookId: existingAiLive.root_book_id,
                branchRootBookId: existingAiLive.branch_root_book_id,
                parentBookId: existingAiLive.parent_book_id,
                canonicalAuthor: existingAiLive.canonical_author,
                prompt: editableAiLivePrompt,
                generationCount: existingAiLive.generation_count,
                history
            });
        }

        let slug = '';
        let title = '無題の書籍';
        let author = '';
        let coverImage = '';
        let themeColor = '';
        let playMode = 'book';
        let fmIsPublic: boolean | undefined = undefined;
        let fmPublishedAt: string | undefined = undefined;

        const fmMatch = markdown.match(/^---\s*([\s\S]*?)\s*---/);
        if (fmMatch) {
            const fmLines = fmMatch[1].split('\n');
            fmLines.forEach((line: string) => {
                if (/^\s/.test(line)) return;
                const parts = line.split(':');
                if (parts.length >= 2) {
                    const k = parts[0].trim();
                    const v = parts.slice(1).join(':').trim();
                    if (k === 'id') slug = v.replace(/[^a-zA-Z0-9_\-]/g, '');
                    if (k === 'title') title = v;
                    if (k === 'author') author = v;
                    if (k === 'cover_image') coverImage = v;
                    if (k === 'theme_color') themeColor = v;
                    if (k === 'play_mode') playMode = v;
                    if (k === 'is_public') fmIsPublic = v === 'true';
                    if (k === 'published_at') fmPublishedAt = v;
                }
            });
        }

        const isCard = playMode === 'card';

        const bookData: any = {
            user_id: session.user.id,
            title,
            author: existingAiLive?.canonical_author || author || null,
            cover_image: coverImage || null,
            theme_color: themeColor || (isCard ? 'white' : 'black'),
            markdown_content: markdown
        };

        const resolvedIsPublic = requestedAiLive
            ? true
            : (is_public !== undefined ? is_public : (fmIsPublic !== undefined ? fmIsPublic : undefined));
        const resolvedPublishedAt = requestedAiLive
            ? (published_at || fmPublishedAt || new Date().toISOString())
            : (published_at !== undefined ? published_at : (fmPublishedAt !== undefined ? fmPublishedAt : undefined));

        if (id && isUuid) {
            bookData.id = id;
            // Fetch existing fields to prevent overwriting with defaults
            const { data: existingBook } = await supabase
                .from('books')
                .select('slug, is_public, published_at')
                .eq('id', id)
                .single();

            if (existingBook) {
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
            .select('id')
            .single();

        if (dbError) {
            console.error('Database save error:', dbError);
            return json({ error: dbError.message }, { status: 500 });
        }

        if (requestedAiLive) {
            const bookId = data.id as string;
            if (!editableAiLivePrompt) {
                editableAiLivePrompt = String(aiLiveSourcePrompt || 'Regenerate this HyperBook with meaningful variation while preserving its central concept.').trim();
            }

            if (existingAiLive) {
                const { error: liveUpdateError } = await supabase
                    .from('ai_live_books')
                    .update({ prompt: editableAiLivePrompt, updated_at: new Date().toISOString() })
                    .eq('book_id', bookId)
                    .eq('owner_user_id', session.user.id);
                if (liveUpdateError) {
                    return json({ error: liveUpdateError.message }, { status: 500 });
                }
            } else {
                const history: AiLiveHistoryEntry[] = [{ bookUuid: bookId, creatorName: sessionAuthor }];
                const { error: liveInsertError } = await supabase.from('ai_live_books').insert({
                    book_id: bookId,
                    root_book_id: bookId,
                    branch_root_book_id: bookId,
                    parent_book_id: null,
                    owner_user_id: session.user.id,
                    canonical_author: sessionAuthor,
                    prompt: editableAiLivePrompt,
                    generation_count: 1,
                    ancestry: history
                });
                if (liveInsertError) {
                    return json({ error: liveInsertError.message }, { status: 500 });
                }

                markdown = canonicalizeAiLiveMarkdown(markdown, {
                    bookId,
                    rootBookId: bookId,
                    branchRootBookId: bookId,
                    parentBookId: null,
                    canonicalAuthor: sessionAuthor,
                    prompt: editableAiLivePrompt,
                    generationCount: 1,
                    history
                });
                const { error: canonicalUpdateError } = await supabase
                    .from('books')
                    .update({
                        author: sessionAuthor,
                        markdown_content: markdown,
                        is_public: true,
                        published_at: resolvedPublishedAt
                    })
                    .eq('id', bookId)
                    .eq('user_id', session.user.id);
                if (canonicalUpdateError) {
                    return json({ error: canonicalUpdateError.message }, { status: 500 });
                }
            }
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

        return json({ success: true, id: data.id, markdown: requestedAiLive ? markdown : undefined });
    } catch (err: any) {
        console.error('Save API Error:', err);
        return json({ error: err.message || 'Failed to save book.' }, { status: 500 });
    }
};
