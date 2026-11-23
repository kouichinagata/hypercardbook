import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { changeableSignKinds, guestMaySign, nextStampSlot, signChangeableInMarkdown, signSlotInMarkdown, signSlotKinds, stampSlotInMarkdown, type SignKind } from '../signature/markers.ts';
import { applyChangeableValues, hasConfirmFields, scanFields, setFieldInMarkdown } from '../signature/fields.ts';
import { isValidSignatureSvg } from '../signature/signature-svg.ts';
import { isValidStampSvg } from '../signature/stamp-svg.ts';
import { isComplete, recordCompletion } from './markdown-verify.ts';
import { copySignedContractToSigners } from './contracts.ts';
import { notifyOwnerSigned } from './paperoboNotice.ts';

// Signing is done here, in one place: the owner (logged in), a guest on the card page, and PapeRobo all go through applySignature.
const BUCKET = 'HyperCardBookBucket';
const FILL_FIELDS_FIRST = 'Fill in every field before the last signature.';

export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

export function adminClient(): SupabaseClient {
    const url = publicEnv.PUBLIC_SUPABASE_URL || env.PUBLIC_SUPABASE_URL;
    if (!url || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Signing is not configured.');
    return createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type SignActor = { type: 'owner'; userId: string } | { type: 'guest'; name: string | null; userId?: string };
/**
 * `changeable`: the slot is a {{MarkdownAIverify}} that can be signed again (numbered among those), not a Confirm slot.
 * `fields`: the current values of the changeable fields on the signer's screen, saved together with the signature.
 */
export type SignInput = { bookId: string; slot: number; kind: SignKind; baseVersion: number; svg: unknown; actor: SignActor; changeable?: unknown; fields?: unknown };
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
    const { bookId, slot, kind, baseVersion, svg, actor, fields } = input;
    const changeable = input.changeable === true;
    if (!isValidSignatureSvg(svg)) return { ok: false, status: 400, error: 'Invalid signature.' };
    if (!Number.isInteger(slot) || !['my', 'your', 'any'].includes(kind) || !Number.isInteger(baseVersion)) return { ok: false, status: 400, error: 'Invalid request.' };

    const { data: book } = await admin.from('books').select('id, user_id, title, markdown_content, version, slug').eq('id', bookId).maybeSingle();
    if (!book) return { ok: false, status: 404, error: 'Document not found.' };
    if (actor.type === 'owner' && actor.userId !== book.user_id) return { ok: false, status: 403, error: 'Not your document.' };
    if (actor.type === 'guest' && !guestMaySign(kind)) return { ok: false, status: 403, error: 'This slot is for the owner.' };
    // The page the signer saw is out of date (someone signed or edited meanwhile): slot numbers may have moved
    if (book.version !== baseVersion) return { ok: false, status: 409, error: 'The document has changed. Reload and try again.' };

    const before: string = book.markdown_content || '';
    const wasComplete = isComplete(before);
    // The changeable fields on the signer's screen are saved with the signature
    const filled = fields === undefined ? before : applyChangeableValues(before, fields);
    if (filled === null) return { ok: false, status: 400, error: 'A field value does not fit. Check the fields and try again.' };
    if ((changeable ? changeableSignKinds(filled) : signSlotKinds(filled))[slot] !== kind) return { ok: false, status: 409, error: 'No such slot.' };
    // The last Confirm signature completes the document and locks its Confirm fields, so every Confirm field must be confirmed first
    if (!changeable && signSlotKinds(filled).length === 1 && hasConfirmFields(filled)) return { ok: false, status: 409, error: FILL_FIELDS_FIRST };

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

    const after = (changeable ? signChangeableInMarkdown(filled, slot, kind, url) : signSlotInMarkdown(filled, slot, kind, url))!;
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
        // Only the signature that completes the document records it (a changeable one signed later never does)
        const completes = !wasComplete && isComplete(after);
        if (completes) {
            await recordCompletion(admin, book.id, after);
            await copySignedContractToSigners(admin, book.id, after);
        }
        if (actor.type !== 'owner') await notifyOwnerSigned({ ownerId: book.user_id, bookId: book.id, title: book.title, complete: completes, signatureId: signatureId! });
        return { ok: true, markdown: after, version: saved.version };
    } catch (err) {
        console.error('[signature] failed, rolling back:', err);
        await admin.storage.from(BUCKET).remove([path]);
        if (signatureId) await admin.from('markdown_signatures').delete().eq('id', signatureId);
        return { ok: false, status: 409, error: 'The document has changed. Reload and try again.' };
    }
}

/**
 * Save a form field of a document. A Confirm field ({{MarkdownAIinputConfirm}} / check / radio) is confirmed once, and not once
 * the document is complete. A changeable field ({{MarkdownAIinput}} / check / radio) is saved each time it is changed, also after completion.
 * `actor` is the owner, or a guest on the card page.
 */
export async function applyField(
    admin: SupabaseClient,
    input: { bookId: string; index: unknown; value: unknown; actor: SignActor }
): Promise<SignOutcome> {
    const { bookId, index, value, actor } = input;
    if (!Number.isInteger(index) || (typeof value !== 'string' && typeof value !== 'boolean')) return { ok: false, status: 400, error: 'Invalid request.' };

    const { data: book } = await admin.from('books').select('id, user_id, markdown_content, version').eq('id', bookId).maybeSingle();
    if (!book) return { ok: false, status: 404, error: 'Document not found.' };
    if (actor.type === 'owner' && actor.userId !== book.user_id) return { ok: false, status: 403, error: 'Not your document.' };

    const before: string = book.markdown_content || '';
    const target = scanFields(before)[index as number];
    if (!target) return { ok: false, status: 400, error: 'That value does not fit the field.' };
    if (target.confirm && isComplete(before)) return { ok: false, status: 409, error: 'A completed document cannot be changed.' };
    const after = setFieldInMarkdown(before, index as number, value);
    if (after === null) return { ok: false, status: 400, error: 'That value does not fit the field.' };

    const { data: saved } = await admin
        .from('books')
        .update({ markdown_content: after, version: book.version + 1 })
        .eq('id', book.id)
        .select('version')
        .maybeSingle();
    if (!saved) return { ok: false, status: 404, error: 'Document not found.' };
    return { ok: true, markdown: after, version: saved.version };
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

    const { data: book } = await admin.from('books').select('id, user_id, title, markdown_content, version, slug').eq('id', bookId).maybeSingle();
    if (!book) return { ok: false, status: 404, error: 'Document not found.' };
    const isOwner = userId === book.user_id;
    const before: string = book.markdown_content || '';
    const target = nextStampSlot(before, (kind) => isOwner || guestMaySign(kind));
    if (!target) return { ok: false, status: 409, error: 'There is no slot left for you to stamp.' };
    if (mode === 'stamp' && signSlotKinds(before).length === 1 && hasConfirmFields(before)) return { ok: false, status: 409, error: FILL_FIELDS_FIRST };

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
        await copySignedContractToSigners(admin, book.id, after);
        if (!isOwner) await notifyOwnerSigned({ ownerId: book.user_id, bookId: book.id, title: book.title, complete: isComplete(after), signatureId: signatureId! });
        return { ok: true, markdown: after, version: saved.version, slot: target.slot, mode, complete: isComplete(after), remaining: signSlotKinds(after).length };
    } catch (err) {
        console.error('[stamp] failed, rolling back:', err);
        await admin.storage.from(BUCKET).remove([path]);
        if (signatureId) await admin.from('markdown_signatures').delete().eq('id', signatureId);
        return { ok: false, status: 409, error: 'The document has changed. Try again.' };
    }
}
