import type { SupabaseClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { verifyHash, type VerifyRecord, type VerifySignature } from './markdown-verify.ts';

// Verify Checker: does this Markdown match the sealed record of this document id?
// The hash covers the whole record (id, book, Markdown, signatures, time), exactly as it was registered,
// so the stored record is hashed again with only its Markdown replaced by the submitted one.
// Line endings are not normalized: registration hashes the Markdown as it was, so the check does too.

export const MAX_MARKDOWN_LENGTH = 1_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What anyone may see once the Markdown matches. Never the book id, user ids or signature images. */
export type PublicVerifyRecord = {
    verifyId: string;
    recordType: 'completed' | 'issued';
    completedAt: string;
    sha256: string;
    signers: { slot: number; kind: string; name: string | null; signedAt: string; method: 'stamp' | 'signature' }[];
};

export type CheckResult =
    | { status: 200; body: { ok: true; result: 'match'; record: PublicVerifyRecord } }
    | { status: 200; body: { ok: true; result: 'mismatch'; verifyId: string } }
    | { status: 400 | 404 | 409 | 503; body: { ok: false; result: 'unverifiable'; reason: 'invalid_request' | 'not_found' | 'record_invalid' | 'unavailable'; error: string } };

const unverifiable = (status: 400 | 404 | 409 | 503, reason: 'invalid_request' | 'not_found' | 'record_invalid' | 'unavailable', error: string): CheckResult =>
    ({ status, body: { ok: false, result: 'unverifiable', reason, error } });

const sameHex = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function publicRecord(row: VerifyRecord & { sha256: string; complete_key: string }): PublicVerifyRecord {
    return {
        verifyId: row.verify_id,
        recordType: row.complete_key.startsWith('certificate-issued:') ? 'issued' : 'completed',
        completedAt: new Date(row.completed_at).toISOString(),
        sha256: row.sha256,
        signers: (row.signatures || []).map((s: VerifySignature) => ({
            slot: s.slot,
            kind: s.kind,
            name: s.signer_name ?? null,
            signedAt: new Date(s.signed_at).toISOString(),
            method: s.method === 'stamp' ? 'stamp' : 'signature'
        }))
    };
}

export async function checkMarkdown(admin: SupabaseClient, verifyId: unknown, markdown: unknown): Promise<CheckResult> {
    if (typeof verifyId !== 'string' || !UUID.test(verifyId.trim())) return unverifiable(400, 'invalid_request', 'Enter a valid document ID.');
    if (typeof markdown !== 'string' || !markdown.length) return unverifiable(400, 'invalid_request', 'Enter the Markdown to verify.');
    if (markdown.length > MAX_MARKDOWN_LENGTH) return unverifiable(400, 'invalid_request', 'The Markdown is too large.');
    const id = verifyId.trim().toLowerCase();

    let row: (VerifyRecord & { sha256: string; complete_key: string }) | null;
    try {
        const { data, error } = await admin
            .from('markdown_verify')
            .select('verify_id, book_id, markdown, signatures, completed_at, sha256, complete_key')
            .eq('verify_id', id)
            .maybeSingle();
        if (error) {
            // Only the error code: the submitted Markdown and the record are never logged
            console.error('[verify-check] could not read the record:', error.code || 'unknown');
            return unverifiable(503, 'unavailable', 'The verification service is unavailable. Please try again later.');
        }
        row = data as typeof row;
    } catch (err) {
        console.error('[verify-check] could not read the record:', (err as { code?: string })?.code || 'exception');
        return unverifiable(503, 'unavailable', 'The verification service is unavailable. Please try again later.');
    }
    if (!row) return unverifiable(404, 'not_found', 'No record was found for this document ID.');

    // A stored record that no longer matches its own hash cannot vouch for anything
    if (typeof row.sha256 !== 'string' || !sameHex(verifyHash(row), row.sha256)) {
        console.error('[verify-check] stored record does not match its hash');
        return unverifiable(409, 'record_invalid', 'The stored record is invalid, so this document cannot be verified.');
    }

    if (!sameHex(verifyHash({ ...row, markdown }), row.sha256)) return { status: 200, body: { ok: true, result: 'mismatch', verifyId: row.verify_id } };
    return { status: 200, body: { ok: true, result: 'match', record: publicRecord(row) } };
}
