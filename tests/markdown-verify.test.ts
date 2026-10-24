import test from 'node:test';
import assert from 'node:assert/strict';
import { completeKey, isComplete, newVerifyId, verifyHash, type VerifyRecord } from '../src/lib/server/markdown-verify.ts';

test('verify ids are UUID v7 and sort by time', () => {
    const a = newVerifyId(1_700_000_000_000);
    const b = newVerifyId(1_700_000_001_000);
    assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.ok(a < b);
    assert.notEqual(newVerifyId(1), newVerifyId(1));
});

test('a document is complete only when it has signatures and no open slot', () => {
    assert.ok(!isComplete('no slots at all'));
    assert.ok(!isComplete('![MarkdownAIVerify:my](https://x.test/a.webp)\n{{your MarkdownAIVerify}}'));
    assert.ok(isComplete('![MarkdownAIVerify:my](https://x.test/a.webp)\n![MarkdownAIVerify:your](https://x.test/b.webp)'));
});

test('the hash is stable and changes with any part of the record', () => {
    const record: VerifyRecord = {
        verify_id: newVerifyId(1),
        book_id: 'b',
        markdown: 'm',
        signatures: [{ signature_id: 's', slot: 0, kind: 'my', signer_id: 'u', signer_name: null, svg: '<svg/>', signed_at: '2026-10-22T00:00:00.000Z' }],
        completed_at: '2026-10-22T00:00:00.000Z'
    };
    assert.equal(verifyHash(record), verifyHash(structuredClone(record)));
    assert.notEqual(verifyHash(record), verifyHash({ ...record, markdown: 'n' }));
    assert.notEqual(verifyHash(record), verifyHash({ ...record, signatures: [{ ...record.signatures[0], svg: '<svg />' }] }));
});

test('the same Complete gives the same key, and a new signature gives a new one', () => {
    assert.equal(completeKey('b', 'm', ['s1', 's2']), completeKey('b', 'm', ['s1', 's2']));
    assert.notEqual(completeKey('b', 'm', ['s1']), completeKey('b', 'n', ['s1']));
    // Same book and Markdown, but re-signed: different signature ids
    assert.notEqual(completeKey('b', 'm', ['s1', 's2']), completeKey('b', 'm', ['s1', 's3']));
    assert.notEqual(completeKey('b', 'm', ['s1', 's2']), completeKey('b', 'm', ['s2', 's1']));
});

test('a hash ignores method on handwritten signatures but covers it on seals', () => {
    const base: VerifyRecord = { verify_id: 'v', book_id: 'b', markdown: 'm', completed_at: '2026-01-01T00:00:00.000Z', signatures: [{ signature_id: 's', slot: 0, kind: 'my', signer_id: null, signer_name: null, svg: '<svg/>', signed_at: '2026-01-01T00:00:00.000Z' }] };
    const sealed: VerifyRecord = { ...base, signatures: [{ ...base.signatures[0], method: 'stamp' }] };
    assert.notEqual(verifyHash(base), verifyHash(sealed));
});
