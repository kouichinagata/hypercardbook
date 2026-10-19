import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { guestMaySign, signSlotInMarkdown, signSlotKinds, type SignKind } from '../signature/markers.ts';
import { isValidSignatureSvg } from '../signature/signature-svg.ts';

// Signing is done here, in one place: the owner (logged in), a guest with a sign link, and PapeRobo all go through applySignature.
const BUCKET = 'HyperCardBookBucket';
export const SIGN_LINK_DAYS = 14;

export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const hashToken = (token: string) => sha256('markdown-sign-link-v1:' + token);
export const newSignToken = () => randomBytes(32).toString('base64url');

export function linkIsUsable(link: { expires_at: string; revoked_at: string | null } | null, now = Date.now()): boolean {
    return !!link && !link.revoked_at && new Date(link.expires_at).getTime() > now;
}

export function adminClient(): SupabaseClient {
    const url = publicEnv.PUBLIC_SUPABASE_URL || env.PUBLIC_SUPABASE_URL;
    if (!url || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Signing is not configured.');
    return createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** One sign link per book: issuing a new one revokes the previous one. Only the hash of the token is stored. */
export async function createSignLink(admin: SupabaseClient, bookId: string, userId: string) {
    await admin.from('markdown_sign_links').update({ revoked_at: new Date().toISOString() }).eq('book_id', bookId).is('revoked_at', null);
    const token = newSignToken();
    const expiresAt = new Date(Date.now() + SIGN_LINK_DAYS * 86_400_000).toISOString();
    const { error } = await admin.from('markdown_sign_links').insert({ token_hash: hashToken(token), book_id: bookId, created_by: userId, expires_at: expiresAt });
    if (error) throw error;
    return { token, expiresAt };
}

export async function resolveSignLink(admin: SupabaseClient, token: string): Promise<{ bookId: string; expiresAt: string } | null> {
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
    const { data } = await admin.from('markdown_sign_links').select('book_id, expires_at, revoked_at').eq('token_hash', hashToken(token)).maybeSingle();
    return linkIsUsable(data) ? { bookId: data!.book_id, expiresAt: data!.expires_at } : null;
}

export type SignActor = { type: 'owner'; userId: string } | { type: 'guest'; name: string | null };
export type SignInput = { bookId: string; slot: number; kind: SignKind; baseVersion: number; svg: unknown; actor: SignActor };
export type SignOutcome = { ok: true; markdown: string; version: number } | { ok: false; status: number; error: string };

/**
 * The SVG original and its hashes are kept here. MarkdownAI's own server will keep the same record too
 * (double storage); that write goes in this function.
 */
async function storeSignature(admin: SupabaseClient, record: Record<string, unknown>) {
    const { data, error } = await admin.from('markdown_signatures').insert(record).select('id').single();
    if (error) throw error;
    return data.id as string;
}

export async function applySignature(admin: SupabaseClient, input: SignInput): Promise<SignOutcome> {
    const { bookId, slot, kind, baseVersion, svg, actor } = input;
    if (!isValidSignatureSvg(svg)) return { ok: false, status: 400, error: 'Invalid signature.' };
    if (!Number.isInteger(slot) || !['my', 'your', 'any'].includes(kind) || !Number.isInteger(baseVersion)) return { ok: false, status: 400, error: 'Invalid request.' };

    const { data: book } = await admin.from('books').select('id, user_id, markdown_content, version').eq('id', bookId).maybeSingle();
    if (!book) return { ok: false, status: 404, error: 'Document not found.' };
    if (actor.type === 'owner' && actor.userId !== book.user_id) return { ok: false, status: 403, error: 'Not your document.' };
    if (actor.type === 'guest' && !guestMaySign(kind)) return { ok: false, status: 403, error: 'This slot is for the owner.' };
    // The page the signer saw is out of date (someone signed or edited meanwhile): slot numbers may have moved
    if (book.version !== baseVersion) return { ok: false, status: 409, error: 'The document has changed. Reload and try again.' };

    const before: string = book.markdown_content || '';
    if (signSlotKinds(before)[slot] !== kind) return { ok: false, status: 409, error: 'No such slot.' };

    // The WebP is always rendered here from the validated SVG, never taken from the client
    let bytes: Buffer;
    try {
        bytes = await sharp(Buffer.from(svg as string), { density: 144 }).webp({ quality: 90 }).toBuffer();
    } catch (err) {
        console.error('[signature] render failed:', err);
        return { ok: false, status: 500, error: 'Could not render the signature image.' };
    }

    const path = `${book.user_id}/signatures/${randomUUID()}.webp`;
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
    if (uploadError) return { ok: false, status: 500, error: 'Could not store the signature image.' };
    const url = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

    const after = signSlotInMarkdown(before, slot, kind, url)!;
    let signatureId: string | null = null;
    try {
        signatureId = await storeSignature(admin, {
            book_id: book.id,
            kind,
            signer_type: actor.type,
            signer_id: actor.type === 'owner' ? actor.userId : null,
            signer_name: actor.type === 'guest' ? actor.name : null,
            svg,
            webp_url: url,
            svg_sha256: sha256(svg as string),
            webp_sha256: sha256(bytes),
            markdown_sha256: sha256(after)
        });
        // Written only if the version is still the one we read: a save in between makes this a no-op
        const { data: saved, error: writeError } = await admin
            .from('books')
            .update({ markdown_content: after, version: baseVersion + 1 })
            .eq('id', book.id)
            .eq('version', baseVersion)
            .select('version')
            .maybeSingle();
        if (writeError || !saved) throw new Error(writeError?.message || 'conflict');
        return { ok: true, markdown: after, version: saved.version };
    } catch (err) {
        console.error('[signature] failed, rolling back:', err);
        await admin.storage.from(BUCKET).remove([path]);
        if (signatureId) await admin.from('markdown_signatures').delete().eq('id', signatureId);
        return { ok: false, status: 409, error: 'The document has changed. Reload and try again.' };
    }
}
