import { certificateIssuance, certificateState } from './certificates.ts';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { guestMaySign, nextStampSlot, signSlotInMarkdown, signSlotKinds, stampSlotInMarkdown, type SignKind } from '../signature/markers.ts';
import { isValidSignatureSvg } from '../signature/signature-svg.ts';
import { isValidStampSvg } from '../signature/stamp-svg.ts';
import { isComplete, recordCompletion } from './markdown-verify.ts';

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

export type SignActor = { type: 'owner'; userId: string } | { type: 'guest'; name: string | null; userId?: string };
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

    const { data: book } = await admin.from('books').select('id, user_id, markdown_content, version, slug').eq('id', bookId).maybeSingle();
    if (!book) return { ok: false, status: 404, error: 'Document not found.' };
    if (actor.type === 'owner' && actor.userId !== book.user_id) return { ok: false, status: 403, error: 'Not your document.' };
    if (actor.type === 'guest' && !guestMaySign(kind)) return { ok: false, status: 403, error: 'This slot is for the owner.' };
    const issuance = book.slug?.startsWith('certificate-') ? await certificateIssuance(admin, bookId) : null;
    if (issuance) {
        if (actor.type === 'guest' && !actor.userId) return { ok: false, status: 403, error: 'Sign this certificate in the chat where you received it.' };
        const state = await certificateState(admin, bookId, book.markdown_content || '', issuance.verify_id);
        if (state.status === 'complete') return { ok: false, status: 409, error: 'This certificate is already complete.' };
        if (actor.type === 'owner' && kind === 'your') return { ok: false, status: 403, error: 'This field must be signed by the recipient.' };
    }
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
            signer_id: actor.type === 'owner' ? actor.userId : actor.userId || null,
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
        await recordCompletion(admin, book.id, after);
        return { ok: true, markdown: after, version: saved.version };
    } catch (err) {
        console.error('[signature] failed, rolling back:', err);
        await admin.storage.from(BUCKET).remove([path]);
        if (signatureId) await admin.from('markdown_signatures').delete().eq('id', signatureId);
        return { ok: false, status: 409, error: 'The document has changed. Reload and try again.' };
    }
}

export type StampMode = 'stamp' | 'both';
export type StampOutcome =
    | { ok: true; markdown: string; version: number; slot: number; mode: StampMode; complete: boolean; remaining: number }
    | { ok: false; status: number; error: string };

/**
 * Press a seal on the next open slot (top to bottom, one slot at a time).
 * - 'stamp': the seal fills the slot, like a signature; the document is Complete when no slot is left.
 * - 'both': the seal is added before the slot's marker and the slot stays open until it is signed,
 *   so any number of seals can be pressed and no markdown_verify record exists before the signature.
 * `userId` is the PapeRobo / HyperCardBook user pressing it; the owner may fill `my` slots, anyone else only `your` / `any`.
 */
export async function applyStamp(admin: SupabaseClient, input: { bookId: string; svg: unknown; mode: StampMode; userId: string }): Promise<StampOutcome> {
    const { bookId, svg, mode, userId } = input;
    if (!isValidStampSvg(svg)) return { ok: false, status: 400, error: 'Invalid seal.' };
    if (mode !== 'stamp' && mode !== 'both') return { ok: false, status: 400, error: 'Invalid request.' };

    const { data: book } = await admin.from('books').select('id, user_id, markdown_content, version, slug').eq('id', bookId).maybeSingle();
    if (!book) return { ok: false, status: 404, error: 'Document not found.' };
    const isOwner = userId === book.user_id;
    const before: string = book.markdown_content || '';
    const issuance = book.slug?.startsWith('certificate-') ? await certificateIssuance(admin, bookId) : null;
    if (issuance && (await certificateState(admin, bookId, before, issuance.verify_id)).status === 'complete') return { ok: false, status: 409, error: 'This certificate is already complete.' };
    const target = nextStampSlot(before, (kind) => isOwner ? (!issuance || kind !== 'your') : guestMaySign(kind));
    if (!target) return { ok: false, status: 409, error: 'There is no slot left for you to stamp.' };

    let bytes: Buffer;
    try {
        bytes = await sharp(Buffer.from(svg), { density: 144 }).webp({ quality: 90 }).toBuffer();
    } catch (err) {
        console.error('[stamp] render failed:', err);
        return { ok: false, status: 500, error: 'Could not render the seal image.' };
    }
    const path = `${book.user_id}/signatures/${randomUUID()}.webp`;
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
    if (uploadError) return { ok: false, status: 500, error: 'Could not store the seal image.' };
    const url = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

    const after = (mode === 'stamp' ? signSlotInMarkdown(before, target.slot, target.kind, url) : stampSlotInMarkdown(before, target.slot, url))!;
    let signatureId: string | null = null;
    try {
        signatureId = await storeSignature(admin, {
            book_id: book.id,
            kind: target.kind,
            signer_type: isOwner ? 'owner' : 'guest',
            signer_id: userId,
            signer_name: null,
            method: 'stamp',
            svg,
            webp_url: url,
            svg_sha256: sha256(svg),
            webp_sha256: sha256(bytes),
            markdown_sha256: sha256(after)
        });
        const { data: saved, error: writeError } = await admin
            .from('books')
            .update({ markdown_content: after, version: book.version + 1 })
            .eq('id', book.id)
            .eq('version', book.version)
            .select('version')
            .maybeSingle();
        if (writeError || !saved) throw new Error(writeError?.message || 'conflict');
        await recordCompletion(admin, book.id, after);
        return { ok: true, markdown: after, version: saved.version, slot: target.slot, mode, complete: isComplete(after), remaining: signSlotKinds(after).length };
    } catch (err) {
        console.error('[stamp] failed, rolling back:', err);
        await admin.storage.from(BUCKET).remove([path]);
        if (signatureId) await admin.from('markdown_signatures').delete().eq('id', signatureId);
        return { ok: false, status: 409, error: 'The document has changed. Try again.' };
    }
}
