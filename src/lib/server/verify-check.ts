import type { SupabaseClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { verifyHash, type VerifyRecord, type VerifySignature } from './markdown-verify.ts';

// Verify Checker: does this Markdown match a sealed record of this document?
// The document ID is the `id:` written at the top of the Markdown (contract-…), the card's slug.
// The hash covers the whole record (id, book, Markdown, signatures, time), exactly as it was registered,
// so each stored record of the document is hashed again with only its Markdown replaced by the submitted one.
// Line endings are not normalized: registration hashes the Markdown as it was, so the check does too.

export const MAX_MARKDOWN_LENGTH = 1_000_000;
const DOCUMENT_ID = /^[A-Za-z0-9_-]{1,200}$/;

/** What anyone may see once the Markdown matches. Never the book id, user ids or signature images. */
export type PublicVerifyRecord = {
    documentId: string;
    completedAt: string;
    sha256: string;
    signers: { slot: number; kind: string; name: string | null; signedAt: string; method: 'stamp' | 'signature' }[];
};

type Reason = 'invalid_request' | 'not_found' | 'record_invalid' | 'unavailable';
export type CheckResult =
    | { status: 200; body: { ok: true; result: 'match'; record: PublicVerifyRecord } }
    | { status: 200; body: { ok: true; result: 'mismatch'; documentId: string } }
    | { status: 400 | 404 | 409 | 503; body: { ok: false; result: 'unverifiable'; reason: Reason; error: string } };

type Row = VerifyRecord & { sha256: string };

const unverifiable = (status: 400 | 404 | 409 | 503, reason: Reason, error: string): CheckResult => ({ status, body: { ok: false, result: 'unverifiable', reason, error } });
const UNAVAILABLE = 'The verification service is unavailable. Please try again later.';

const sameHex = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function publicRecord(documentId: string, row: Row): PublicVerifyRecord {
    return {
        documentId,
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

export async function checkMarkdown(admin: SupabaseClient, documentId: unknown, markdown: unknown): Promise<CheckResult> {
    if (typeof documentId !== 'string' || !DOCUMENT_ID.test(documentId.trim())) return unverifiable(400, 'invalid_request', 'Enter a valid document ID.');
    if (typeof markdown !== 'string' || !markdown.length) return unverifiable(400, 'invalid_request', 'Enter the Markdown to verify.');
    if (markdown.length > MAX_MARKDOWN_LENGTH) return unverifiable(400, 'invalid_request', 'The Markdown is too large.');
    const id = documentId.trim();

    let rows: Row[];
    try {
        const { data: books, error: bookError } = await admin.from('books').select('id').eq('slug', id);
        if (bookError) {
            // Only the error code: the submitted Markdown and the records are never logged
            console.error('[verify-check] could not read the document:', bookError.code || 'unknown');
            return unverifiable(503, 'unavailable', UNAVAILABLE);
        }
        if (!books?.length) return unverifiable(404, 'not_found', 'No record was found for this document ID.');
        const { data, error } = await admin
            .from('markdown_verify')
            .select('verify_id, book_id, markdown, signatures, completed_at, sha256')
            .in('book_id', books.map((b: { id: string }) => b.id));
        if (error) {
            console.error('[verify-check] could not read the records:', error.code || 'unknown');
            return unverifiable(503, 'unavailable', UNAVAILABLE);
        }
        rows = (data || []) as Row[];
    } catch (err) {
        console.error('[verify-check] could not read the records:', (err as { code?: string })?.code || 'exception');
        return unverifiable(503, 'unavailable', UNAVAILABLE);
    }
    return judge(rows, id, () => markdown);
}

/** Compare each stored record with the Markdown it should match; a record that fails its own hash cannot vouch for anything */
function judge(rows: Row[], documentId: string, markdownOf: (row: Row) => string): CheckResult {
    if (!rows.length) return unverifiable(404, 'not_found', 'No sealed record was found for this document.');
    if (rows.some((row) => typeof row.sha256 !== 'string' || !sameHex(verifyHash(row), row.sha256))) {
        console.error('[verify-check] stored record does not match its hash');
        return unverifiable(409, 'record_invalid', 'The stored record is invalid, so this document cannot be verified.');
    }
    // A document whose signatures can be signed again has one record per signing; any of them may match
    const matched = rows.find((row) => sameHex(verifyHash({ ...row, markdown: markdownOf(row) }), row.sha256));
    if (!matched) return { status: 200, body: { ok: true, result: 'mismatch', documentId } };
    return { status: 200, body: { ok: true, result: 'match', record: publicRecord(documentId, matched) } };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The card at this URL (/hypercard/<uuid or id>): is its Markdown still the sealed one? */
export async function checkCardUrl(admin: SupabaseClient, url: unknown): Promise<CheckResult> {
    const key = typeof url === 'string' && url.length <= 2000 ? url.trim().match(/\/hypercard\/([A-Za-z0-9_-]{1,200})(?:[/?#]|$)/)?.[1] : undefined;
    if (!key) return unverifiable(400, 'invalid_request', 'Enter a card URL.');

    let books: { id: string; slug: string; markdown_content: string | null }[];
    let rows: Row[];
    try {
        const { data, error: bookError } = await admin.from('books').select('id, slug, markdown_content').eq(UUID.test(key) ? 'id' : 'slug', key);
        if (bookError) {
            console.error('[verify-check] could not read the document:', bookError.code || 'unknown');
            return unverifiable(503, 'unavailable', UNAVAILABLE);
        }
        books = data || [];
        if (!books.length) return unverifiable(404, 'not_found', 'No card was found at this URL.');
        const { data: records, error } = await admin
            .from('markdown_verify')
            .select('verify_id, book_id, markdown, signatures, completed_at, sha256')
            .in('book_id', books.map((b) => b.id));
        if (error) {
            console.error('[verify-check] could not read the records:', error.code || 'unknown');
            return unverifiable(503, 'unavailable', UNAVAILABLE);
        }
        rows = (records || []) as Row[];
    } catch (err) {
        console.error('[verify-check] could not read the records:', (err as { code?: string })?.code || 'exception');
        return unverifiable(503, 'unavailable', UNAVAILABLE);
    }
    const markdownOf = (row: Row) => books.find((b) => b.id === row.book_id)?.markdown_content || '';
    return judge(rows, books[0].slug, markdownOf);
}
