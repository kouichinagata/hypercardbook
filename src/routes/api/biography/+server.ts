import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { biographySlug } from '$lib/server/biography';

// PapeRobo/HyperTVなど外部プロダクトのAIが、ユーザーのBiography(長期記憶)を
// 読み取り専用で取得するためのエンドポイント。
export const GET: RequestHandler = async ({ request, url }) => {
    try {
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        const expectedSecret = env.HYPERCARDBOOK_SHARED_SECRET || process.env.HYPERCARDBOOK_SHARED_SECRET || '';

        if (!expectedSecret) {
            console.error('Integration Error: HYPERCARDBOOK_SHARED_SECRET is not configured on the server.');
            return jsonError('server_misconfigured', 'Server integration is misconfigured.', 500);
        }

        if (token !== expectedSecret) {
            return jsonError('unauthorized', 'Unauthorized integration token.', 401);
        }

        const userId = (url.searchParams.get('userId') || '').trim();
        if (!userId) {
            return jsonError('invalid_request', 'userId query parameter is required.', 400);
        }

        const supabaseUrl = publicEnv.PUBLIC_SUPABASE_URL || env.PUBLIC_SUPABASE_URL || '';
        const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || '';

        if (!supabaseUrl || !serviceRoleKey) {
            console.error('Integration Error: Supabase service role client is not configured.');
            return jsonError('server_misconfigured', 'Server integration is misconfigured.', 500);
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: {
                persistSession: false,
                autoRefreshToken: false
            }
        });

        const { data: book, error: dbError } = await supabase
            .from('books')
            .select('markdown_content, updated_at')
            .eq('user_id', userId)
            .eq('slug', biographySlug(userId))
            .maybeSingle();

        if (dbError) {
            console.error('Failed to load Biography book:', dbError);
            return jsonError('database_error', dbError.message, 500);
        }

        if (!book) {
            return json({ ok: false, code: 'not_found', userId, markdown: '' }, { status: 404 });
        }

        return json({
            ok: true,
            userId,
            markdown: book.markdown_content || '',
            updatedAt: book.updated_at
        });
    } catch (err: any) {
        console.error('Biography read API execution error:', err);
        return jsonError('internal_error', err.message || 'Internal server error.', 500);
    }
};

function jsonError(code: string, error: string, status: number) {
    return json({ ok: false, code, error }, { status });
}
