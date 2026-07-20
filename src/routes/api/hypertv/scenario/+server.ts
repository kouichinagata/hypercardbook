import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { createClient } from '@supabase/supabase-js';

// HyperCardTV(tatenaga)側で動画のダウンロード・AI解析・シナリオMarkdown生成まで完了した結果を受け取り、
// このエンドポイントは「本人のアカウントにBookとして保存する」処理のみを担う。
export const POST: RequestHandler = async ({ request, url }) => {
    try {
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        const expectedSecret = env.HYPERTV_SHARED_SECRET || process.env.HYPERTV_SHARED_SECRET || '';

        if (!expectedSecret) {
            console.error('Integration Error: HYPERTV_SHARED_SECRET is not configured on the server.');
            return json({ error: 'Server integration is misconfigured.' }, { status: 500 });
        }

        if (token !== expectedSecret) {
            return json({ error: 'Unauthorized integration token.' }, { status: 401 });
        }

        const payload = await request.json().catch(() => ({}));
        const { userId, videoId, videoTitle, markdownContent, sourceUrl } = payload;

        if (!userId || !videoId || !videoTitle || !markdownContent) {
            return json(
                { error: 'Missing required parameters: userId, videoId, videoTitle, markdownContent.' },
                { status: 400 }
            );
        }

        const supabaseUrl = publicEnv.PUBLIC_SUPABASE_URL || env.PUBLIC_SUPABASE_URL || '';
        const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || '';

        if (!supabaseUrl || !serviceRoleKey) {
            console.error('Integration Error: Supabase service role client is not configured.');
            return json({ error: 'Server integration is misconfigured.' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: {
                persistSession: false,
                autoRefreshToken: false
            }
        });

        // slugにuserIdを含めることで、同じ動画を別ユーザーが視聴しても
        // Bookの所有者が競合(上書き)しないようにする
        const safeVideoId = String(videoId).replace(/[^a-zA-Z0-9_-]/g, '');
        const bookSlug = `hypertv-${userId}-${safeVideoId}`;
        const title = `Scenario: ${videoTitle}`;

        const markdown = `---
title: ${title}
author: HyperCardTV
theme_color: #AFCBEB
play_mode: book
source_app: hypertv
source_url: ${sourceUrl || ''}
video_id: ${safeVideoId}
---

${markdownContent}
`;

        const bookData = {
            user_id: userId,
            slug: bookSlug,
            title,
            author: 'HyperCardTV',
            cover_image: null,
            theme_color: '#AFCBEB',
            markdown_content: markdown,
            is_public: false,
            published_at: null
        };

        const { data: existing } = await supabase
            .from('books')
            .select('id')
            .eq('slug', bookSlug)
            .maybeSingle();

        const { data: savedBook, error: dbError } = await supabase
            .from('books')
            .upsert(bookData, { onConflict: 'slug' })
            .select('id')
            .single();

        if (dbError || !savedBook) {
            console.error('Failed to upsert hypertv scenario book:', dbError);
            return json({ error: dbError?.message || 'Book could not be saved.' }, { status: 500 });
        }

        return json({
            ok: true,
            bookId: savedBook.id,
            openUrl: `${url.origin}/hyperbook/${savedBook.id}`,
            created: !existing
        });
    } catch (err: any) {
        console.error('HyperTV scenario webhook execution error:', err);
        return json({ error: err.message || 'Internal server error.' }, { status: 500 });
    }
};
