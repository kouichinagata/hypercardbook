import { certificateState } from './certificates.ts';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { createClient } from '@supabase/supabase-js';
import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { contentOrigins } from '$lib/content-origin';
import { parseBookFrontmatter } from '$lib/book-frontmatter';
import { signDocumentTicket, verifyDocumentTicket } from './paperoboDocumentTicket';
export const documentSecret = () => env.HYPERCARDBOOK_SHARED_SECRET || '';
export function documentClient() {
    if (!publicEnv.PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw error(503, 'HyperCardBook連携が設定されていません。');
    return createClient(publicEnv.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
export type DocumentRow = { id: string; user_id: string; title: string; markdown_content: string; cover_image?: string; theme_color?: string; author?: string; is_public: boolean; slug?: string; version?: number };
export function documentKind(markdown: string) {
    const fm = parseBookFrontmatter(markdown);
    const source = markdown.match(/^---\s*([\s\S]*?)\s*---/)?.[1].match(/^source_app:\s*(.+)$/m)?.[1]?.trim();
    if (source === 'scriptbook') return 'scriptbook';
    if (source === 'hypertv') return 'scenariobook';
    if (['card', 'miniapp', 'hyperrobo', 'paperobo'].includes(fm.playMode)) return fm.playMode;
    if (fm.playMode === 'stack') return null;
    return 'book';
}
export function shelfDocument(row: DocumentRow) {
    const fm = parseBookFrontmatter(row.markdown_content || '');
    const fields = Object.fromEntries((row.markdown_content.match(/^---\s*([\s\S]*?)\s*---/)?.[1] || '').split('\n').filter(line => !/^\s/.test(line) && line.includes(':')).map(line => { const i = line.indexOf(':'); return [line.slice(0,i).trim(),line.slice(i+1).trim()]; }));
    return { id: row.id, slug: row.slug, title: row.title, author: row.author, coverImage: row.cover_image, themeColor: row.theme_color || (['card','miniapp'].includes(fm.playMode) ? 'white' : 'black'), isCard: ['card','miniapp'].includes(fm.playMode), isStack: false, isMiniApp: fm.playMode === 'miniapp', playMode: fm.playMode, isPublic: row.is_public === true, subTitle: fields.sub_title, description: fields.description, sourceApp: fields.source_app, hideHyperbook: fields.hide_hyperbook === 'true', hyperbookId: fields.hyperbook_id };
}
export function documentLinks(row: DocumentRow, selectedBy: string, url: URL, preview = false, certificateId?: string) {
    const origin = contentOrigins(url, dev).markdown;
    const ticket = (purpose: 'cover' | 'preview') => signDocumentTicket({ id: row.id, selectedBy, purpose, ...(certificateId ? { certificateId } : {}), expires: Date.now() + 15 * 60_000 }, documentSecret());
    const isCard = ['card', 'miniapp'].includes(parseBookFrontmatter(row.markdown_content).playMode);
    return { coverUrl: `${origin}/paperobo/cover?ticket=${ticket('cover')}`, ...(preview ? { previewUrl: `${origin}/${isCard ? 'hypercard' : 'hyperbook'}/${row.id}?paperobo_share=${ticket('preview')}` } : {}) };
}
export async function accessibleDocument(id: string, selectedBy: string): Promise<DocumentRow> {
    const { data, error: dbError } = await documentClient().from('books').select('*').eq('id', id).single();
    if (dbError || !data || (data.user_id !== selectedBy && data.is_public !== true)) throw error(404, '資料が見つからないか、共有できません。');
    if (!documentKind(data.markdown_content || '')) throw error(400, 'この種類の資料は添付できません。');
    return data;
}
export async function sharedDocument(token: string, purpose: 'cover' | 'preview', id?: string) {
    const grant = verifyDocumentTicket(token, documentSecret(), purpose);
    if (!grant || (id && grant.id !== id)) throw error(403, 'プレビューの有効期限が切れました。チャットから開き直してください。');
    const row = await accessibleDocument(grant.id, grant.selectedBy);
    if (grant.certificateId) {
        const state = await certificateState(documentClient(), row.id, row.markdown_content, grant.certificateId);
        if (state.record) row.markdown_content = state.record.markdown;
    }
    return row;
}
