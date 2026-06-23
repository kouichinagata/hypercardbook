import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        const { markdown, id, is_public, published_at } = await request.json();
        const session = locals.session;
        const supabase = locals.supabase;

        if (!session) {
            return json({ error: 'Unauthorized. Please login first.' }, { status: 401 });
        }

        if (!markdown) {
            return json({ error: 'No markdown content provided.' }, { status: 400 });
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
            author: author || null,
            cover_image: coverImage || null,
            theme_color: themeColor || (isCard ? 'white' : 'black'),
            markdown_content: markdown
        };

        const resolvedIsPublic = is_public !== undefined ? is_public : (fmIsPublic !== undefined ? fmIsPublic : undefined);
        const resolvedPublishedAt = published_at !== undefined ? published_at : (fmPublishedAt !== undefined ? fmPublishedAt : undefined);

        const isUuid = id ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) : false;

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
                        const match = trimmed.match(/^-\s*\[(.*?)\]\((book|card|paperobo|hyperrobo):(.*)\)/);
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

        return json({ success: true, id: data.id });
    } catch (err: any) {
        console.error('Save API Error:', err);
        return json({ error: err.message || 'Failed to save book.' }, { status: 500 });
    }
};
