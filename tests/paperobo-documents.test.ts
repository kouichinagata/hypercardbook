import test from 'node:test';
import assert from 'node:assert/strict';
import { signDocumentTicket, verifyDocumentTicket } from '../src/lib/server/paperoboDocumentTicket.ts';
test('preview tickets reject tampering, expiry, missing keys and cover/preview substitution', () => {
    const grant = {id:'book-123', selectedBy:'11111111-1111-4111-8111-111111111111', purpose:'preview' as const, expires:2000};
    const token = signDocumentTicket(grant,'test-only-key');
    assert.deepEqual(verifyDocumentTicket(token,'test-only-key','preview',1000),grant);
    assert.equal(verifyDocumentTicket(token,'test-only-key','cover',1000),null);
    assert.equal(verifyDocumentTicket(token,'test-only-key','preview',2000),null);
    assert.equal(verifyDocumentTicket(token,'wrong-key','preview',1000),null);
    assert.equal(verifyDocumentTicket(token,'','preview',1000),null);
    assert.equal(verifyDocumentTicket(token+'x','test-only-key','preview',1000),null);
    const payload = Buffer.from(JSON.stringify({...grant,id:'private-book'})).toString('base64url');
    assert.equal(verifyDocumentTicket(payload+'.'+token.split('.')[1],'test-only-key','preview',1000),null);
});
