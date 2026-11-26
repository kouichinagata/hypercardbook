import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';

// A user's API key for the HyperBook DB HTTP Request API. Only its SHA-256 is stored (see supabase_migration_api_keys.sql).
const PREFIX = 'hcb_';
const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

export type ApiKeyInfo = { prefix: string; created_at: string; last_used_at: string | null } | null;

export async function apiKeyInfo(admin: SupabaseClient, userId: string): Promise<ApiKeyInfo> {
    const { data, error } = await admin.from('api_keys').select('key_prefix, created_at, last_used_at').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return data ? { prefix: data.key_prefix, created_at: data.created_at, last_used_at: data.last_used_at } : null;
}

/** Issue a new key for the user (the old one stops working). The key is returned once and never stored. */
export async function issueApiKey(admin: SupabaseClient, userId: string): Promise<string> {
    const key = PREFIX + randomBytes(32).toString('base64url');
    const { error } = await admin
        .from('api_keys')
        .upsert({ user_id: userId, key_hash: hashKey(key), key_prefix: key.slice(0, PREFIX.length + 6), created_at: new Date().toISOString(), last_used_at: null }, { onConflict: 'user_id' });
    if (error) throw error;
    return key;
}

export async function revokeApiKey(admin: SupabaseClient, userId: string): Promise<void> {
    const { error } = await admin.from('api_keys').delete().eq('user_id', userId);
    if (error) throw error;
}

/** The user an `Authorization: Bearer hcb_…` header belongs to, or null */
export async function userForApiKey(admin: SupabaseClient, authorization: string | null): Promise<string | null> {
    const key = (authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!key.startsWith(PREFIX)) return null;
    const { data, error } = await admin.from('api_keys').select('user_id').eq('key_hash', hashKey(key)).maybeSingle();
    if (error || !data) return null;
    await admin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('user_id', data.user_id);
    return data.user_id as string;
}
