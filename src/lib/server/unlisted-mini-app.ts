import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { servesUnlistedMiniApp } from '$lib/unlisted-mini-app';
import { parseBookFrontmatter } from '$lib/book-frontmatter';

/** Loads a non-public MiniApp by its UUID with the service role; returns null for anything else. */
export async function loadUnlistedMiniApp(id: string): Promise<{ id: string; markdown_content: string; user_id: string | null; created_at: string | null; is_public: boolean | null } | null> {
    const supabaseUrl = publicEnv.PUBLIC_SUPABASE_URL || env.PUBLIC_SUPABASE_URL || '';
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!supabaseUrl || !serviceRoleKey || !servesUnlistedMiniApp(id, 'miniapp')) return null;
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data } = await supabase.from('books').select('id, markdown_content, user_id, created_at, is_public').eq('id', id).maybeSingle();
    if (!data || !servesUnlistedMiniApp(id, parseBookFrontmatter(data.markdown_content || '').playMode)) return null;
    return data;
}
