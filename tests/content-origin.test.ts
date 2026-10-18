import test from 'node:test';
import assert from 'node:assert/strict';
import { MARKDOWN_CUTOVER, contentOrigins, isMarkdownHost, servedOnMarkdown, viewerRedirect } from '../src/lib/content-origin.ts';
import { STANDARD_MINI_APP_REFS } from '../src/lib/mini-app.ts';

const before = '2026-10-01T00:00:00Z';
const after = '2026-10-19T00:00:00Z';
const miniapp = '---\nid: m\nplay_mode: miniapp\n---\n# App';
const card = '---\nid: c\nplay_mode: card\n---\n# Card';

test('only public or MiniApp content created from the cutover, and the moved MiniApps, are on the markdown domain', () => {
    assert.ok(servedOnMarkdown({ id: STANDARD_MINI_APP_REFS[0], created_at: before, is_public: true }));
    assert.ok(servedOnMarkdown({ id: 'a', created_at: after, is_public: true, markdown_content: card }));
    assert.ok(servedOnMarkdown({ id: 'a', created_at: after, is_public: false, markdown_content: miniapp }));
    assert.ok(servedOnMarkdown({ id: 'a', created_at: after, is_public: false }, true));
    assert.ok(servedOnMarkdown({ id: 'a', created_at: MARKDOWN_CUTOVER, is_public: true }));
    // Existing content and private content stay on www
    assert.ok(!servedOnMarkdown({ id: 'a', created_at: before, is_public: true, markdown_content: miniapp }));
    assert.ok(!servedOnMarkdown({ id: 'a', created_at: after, is_public: false, markdown_content: card }));
    assert.ok(!servedOnMarkdown({ id: 'a', created_at: null, is_public: true }));
    assert.ok(!servedOnMarkdown({ id: 'a', created_at: 'not a date', is_public: true }));
});

test('hosts and origins in production and development', () => {
    assert.ok(isMarkdownHost('markdown.hypercardbook.org'));
    assert.ok(!isMarkdownHost('www.hypercardbook.org'));
    assert.ok(!isMarkdownHost('markdown.localhost'));
    assert.ok(isMarkdownHost('markdown.localhost', true));
    assert.ok(!isMarkdownHost('localhost', true));
    assert.deepEqual(contentOrigins(new URL('https://www.hypercardbook.org/x')), { www: 'https://www.hypercardbook.org', markdown: 'https://markdown.hypercardbook.org' });
    assert.deepEqual(contentOrigins(new URL('http://127.0.0.1:5173/x'), true), { www: 'http://localhost:5173', markdown: 'http://markdown.localhost:5173' });
});

test('viewers move to the right domain and drop the fragment (sign-in tokens)', () => {
    const www = new URL('https://www.hypercardbook.org/hypercard/abc?embed=true');
    const md = new URL('https://markdown.hypercardbook.org/hyperbook/abc?page=2');
    assert.equal(viewerRedirect(www, true), 'https://markdown.hypercardbook.org/hypercard/abc?embed=true#');
    assert.equal(viewerRedirect(www, false), null);
    assert.equal(viewerRedirect(md, false), 'https://www.hypercardbook.org/hyperbook/abc?page=2#');
    assert.equal(viewerRedirect(md, true), null);
    assert.equal(viewerRedirect(new URL('http://localhost:5173/hypercard/abc'), true, true), 'http://markdown.localhost:5173/hypercard/abc#');
});
