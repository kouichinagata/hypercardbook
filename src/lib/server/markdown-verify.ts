import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';
import { replaceSignedImages, signSlotKinds } from '../signature/markers.ts';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

// The sealed original of a completed document: its Markdown plus every signature in it, hashed as a whole.
// MarkdownAI will later issue the id and check the record against its own copy; only newVerifyId changes then.

/** UUID v7: 48-bit millisecond timestamp, then random bits. A verify id is never changed or reused. */
export function newVerifyId(now = Date.now()): string {
    const b = randomBytes(16);
    b.writeUIntBE(now, 0, 6);
    b[6] = (b[6] & 0x0f) | 0x70;
    b[8] = (b[8] & 0x3f) | 0x80;
    const hex = b.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type VerifySignature = {
    signature_id: string;
    slot: number;
    kind: string;
    signer_id: string | null;
    signer_name: string | null;
    svg: string;
    signed_at: string;
};

export type VerifyRecord = {
    verify_id: string;
    book_id: string;
    markdown: string;
    signatures: VerifySignature[];
    completed_at: string;
};

/** SHA-256 over a fixed-order JSON of the whole record, so the same record always gives the same hash. */
export function verifyHash(r: VerifyRecord): string {
    return sha256(
        JSON.stringify({
            verify_id: r.verify_id,
            book_id: r.book_id,
            markdown: r.markdown,
            signatures: r.signatures.map((s) => ({
                signature_id: s.signature_id,
                slot: s.slot,
                kind: s.kind,
                signer_id: s.signer_id,
                signer_name: s.signer_name,
                svg: s.svg,
                signed_at: s.signed_at
            })),
            completed_at: r.completed_at
        })
    );
}

/** Same Complete (same book, same final Markdown, same signatures in slot order) gives the same key, so it is stored only once. A fresh signature has a new id, hence a new key. */
export const completeKey = (bookId: string, markdown: string, signatureIds: string[]) =>
    sha256(`markdown-verify:${bookId}:${sha256(markdown)}:${signatureIds.join(',')}`);

/** The document is complete when it has signatures and no unsigned slot is left. */
export const isComplete = (markdown: string) => signSlotKinds(markdown).length === 0 && replaceSignedImages(markdown, () => '\0').includes('\0');

/** Called right after the last slot is saved. Failures are logged only: signing itself must never fail because of this. */
export async function recordCompletion(admin: SupabaseClient, bookId: string, markdown: string): Promise<void> {
    try {
        if (!isComplete(markdown)) return;
        const urls: string[] = [];
        replaceSignedImages(markdown, (url) => (urls.push(url), ''));
        const { data, error } = await admin
            .from('markdown_signatures')
            .select('id, kind, signer_id, signer_name, svg, webp_url, signed_at')
            .eq('book_id', bookId)
            .in('webp_url', urls);
        if (error) throw error;
        const rows = new Map((data ?? []).map((row) => [row.webp_url as string, row]));
        const signatures: VerifySignature[] = [];
        urls.forEach((url, slot) => {
            const row = rows.get(url);
            if (row) signatures.push({ signature_id: row.id, slot, kind: row.kind, signer_id: row.signer_id, signer_name: row.signer_name, svg: row.svg, signed_at: new Date(row.signed_at).toISOString() });
        });
        if (signatures.length !== urls.length) throw new Error('signature record missing for a signed slot');

        const record: VerifyRecord = {
            verify_id: newVerifyId(),
            book_id: bookId,
            markdown,
            signatures,
            // The last signature's time is the moment the document became complete
            completed_at: signatures.reduce((latest, s) => (s.signed_at > latest ? s.signed_at : latest), signatures[0].signed_at)
        };
        const { error: insertError } = await admin
            .from('markdown_verify')
            .insert({ ...record, sha256: verifyHash(record), complete_key: completeKey(bookId, markdown, signatures.map((s) => s.signature_id)) });
        // 23505: this Complete is already recorded
        if (insertError && insertError.code !== '23505') throw insertError;
    } catch (err) {
        console.error('[markdown-verify] could not record completion:', err);
    }
}
