import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { newVerifyId, verifyHash, type VerifyRecord } from '../src/lib/server/markdown-verify.ts';
import { checkCardUrl, checkMarkdown } from '../src/lib/server/verify-check.ts';
import { createRateLimiter } from '../src/lib/server/rate-limit.ts';

const markdown = '---\ntitle: Contract\n---\n# Contract\n\nWe agree.\n\n![MarkdownAIverify:my](https://x.test/a.webp)\n';
const record: VerifyRecord = {
    verify_id: newVerifyId(1_760_000_000_000),
    book_id: '11111111-1111-4111-8111-111111111111',
    markdown,
    signatures: [{ signature_id: 's1', slot: 0, kind: 'my', signer_id: 'user-secret-id', svg: '<svg/>', signed_at: '2026-10-22T00:00:00.000Z' }],
    completed_at: '2026-10-22T00:00:00.000Z'
};
const row = { ...record, sha256: verifyHash(record) };

const SLUG = 'contract-0f6c2b1e-0000-4000-8000-000000000001';

/** Just enough of the Supabase query builder: books by slug, then markdown_verify by book id */
function fakeAdmin(result: { rows?: unknown[]; error?: unknown; throws?: boolean }): SupabaseClient {
    return {
        from: (table: string) => {
            if (result.throws) throw new Error('connection refused');
            if (table === 'books') return { select: () => ({ eq: async (_c: string, slug: string) => (result.error ? { data: null, error: result.error } : { data: slug === SLUG ? [{ id: record.book_id }] : [], error: null }) }) };
            return { select: () => ({ in: async () => ({ data: result.rows || [], error: null }) }) };
        }
    } as unknown as SupabaseClient;
}

test('1. the registered Markdown matches and returns only public fields', async () => {
    const out = await checkMarkdown(fakeAdmin({ rows: [row] }), SLUG, markdown);
    assert.equal(out.status, 200);
    assert.equal(out.body.result, 'match');
    const text = JSON.stringify(out.body);
    assert.ok(!text.includes(record.book_id) && !text.includes('user-secret-id') && !text.includes('<svg'));
    if (out.body.result === 'match') {
        assert.equal(out.body.record.documentId, SLUG);
        assert.equal(out.body.record.signers[0].kind, 'my');
    }
});

test('2. one changed character is a mismatch', async () => {
    const out = await checkMarkdown(fakeAdmin({ rows: [row] }), SLUG, markdown.replace('agree', 'agreE'));
    assert.equal(out.status, 200);
    assert.equal(out.body.result, 'mismatch');
});

test('3. an unknown document id cannot be verified', async () => {
    const out = await checkMarkdown(fakeAdmin({ rows: [row] }), 'contract-unknown', markdown);
    assert.equal(out.status, 404);
    assert.equal(out.body.result, 'unverifiable');
    assert.equal(out.body.ok === false && out.body.reason, 'not_found');
});

test('4. line endings follow the registration rule: hashed as they are, so CRLF differs', async () => {
    const out = await checkMarkdown(fakeAdmin({ rows: [row] }), SLUG, markdown.replace(/\n/g, '\r\n'));
    assert.equal(out.body.result, 'mismatch');
    // A record registered with CRLF matches CRLF only
    const crlf = { ...record, markdown: markdown.replace(/\n/g, '\r\n') };
    const crlfRow = { ...crlf, sha256: verifyHash(crlf) };
    assert.equal((await checkMarkdown(fakeAdmin({ rows: [crlfRow] }), SLUG, crlf.markdown)).body.result, 'match');
    assert.equal((await checkMarkdown(fakeAdmin({ rows: [crlfRow] }), SLUG, markdown)).body.result, 'mismatch');
});

test('5. a database error or outage cannot be verified', async () => {
    for (const admin of [fakeAdmin({ error: { code: '57P01' } }), fakeAdmin({ throws: true })]) {
        const out = await checkMarkdown(admin, SLUG, markdown);
        assert.equal(out.status, 503);
        assert.equal(out.body.ok === false && out.body.reason, 'unavailable');
    }
});

test('a document signed again matches any of its records', async () => {
    const later = { ...record, verify_id: newVerifyId(), markdown: markdown + 'v2', completed_at: '2026-10-23T00:00:00.000Z' };
    const rows = [row, { ...later, sha256: verifyHash(later) }];
    assert.equal((await checkMarkdown(fakeAdmin({ rows }), SLUG, markdown)).body.result, 'match');
    assert.equal((await checkMarkdown(fakeAdmin({ rows }), SLUG, later.markdown)).body.result, 'match');
});

test('a stored record that does not match its own hash cannot be verified', async () => {
    const out = await checkMarkdown(fakeAdmin({ rows: [{ ...row, sha256: '0'.repeat(64) }] }), SLUG, markdown);
    assert.equal(out.status, 409);
    assert.equal(out.body.ok === false && out.body.reason, 'record_invalid');
});

test('bad input is rejected before the database is read', async () => {
    const admin = { from: () => { throw new Error('must not be called'); } } as unknown as SupabaseClient;
    assert.equal((await checkMarkdown(admin, 'not a slug!', markdown)).status, 400);
    assert.equal((await checkMarkdown(admin, SLUG, '')).status, 400);
    assert.equal((await checkMarkdown(admin, SLUG, 'x'.repeat(1_000_001))).status, 400);
});

test('the rate limiter allows the limit per window and per key', () => {
    const limiter = createRateLimiter(2, 60_000);
    assert.ok(limiter.take('a', 0).allowed);
    assert.ok(limiter.take('a', 1).allowed);
    const denied = limiter.take('a', 2);
    assert.ok(!denied.allowed && denied.retryAfter === 60);
    assert.ok(limiter.take('b', 2).allowed);
    assert.ok(limiter.take('a', 60_000).allowed);
});

/** A card in the books table: looked up by id or slug, with its current Markdown */
function fakeCardAdmin(card: { markdown: string }, rows: unknown[]): SupabaseClient {
    return {
        from: (table: string) => {
            if (table === 'books') return { select: () => ({ eq: async (column: string, value: string) => ({ data: (column === 'id' ? value === record.book_id : value === SLUG) ? [{ id: record.book_id, slug: SLUG, markdown_content: card.markdown }] : [], error: null }) }) };
            return { select: () => ({ in: async () => ({ data: rows, error: null }) }) };
        }
    } as unknown as SupabaseClient;
}

test('a card URL matches while the card is unchanged, by UUID or by id', async () => {
    for (const url of [`https://www.hypercardbook.org/hypercard/${record.book_id}?from=home`, `https://markdown.hypercardbook.org/hypercard/${SLUG}`]) {
        const out = await checkCardUrl(fakeCardAdmin({ markdown }, [row]), url);
        assert.equal(out.body.result, 'match');
        if (out.body.result === 'match') assert.equal(out.body.record.documentId, SLUG);
    }
});

test('a card changed after sealing is a mismatch', async () => {
    const out = await checkCardUrl(fakeCardAdmin({ markdown: markdown.replace('agree', 'agreE') }, [row]), `https://www.hypercardbook.org/hypercard/${record.book_id}`);
    assert.equal(out.body.result, 'mismatch');
});

test('an unknown or malformed card URL cannot be verified', async () => {
    assert.equal((await checkCardUrl(fakeCardAdmin({ markdown }, [row]), 'https://www.hypercardbook.org/hypercard/contract-unknown')).status, 404);
    assert.equal((await checkCardUrl(fakeCardAdmin({ markdown }, [row]), 'not a url')).status, 400);
});
