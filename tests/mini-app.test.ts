import test from 'node:test';
import assert from 'node:assert/strict';
import { newMiniAppSlug, helloWorldMiniAppMarkdown, miniAppUrls, validMiniAppRef, absoluteCoverImage, miniAppCardUrl } from '../src/lib/mini-app.ts';

test('slug is URL-safe and unique per call', () => {
    const a = newMiniAppSlug();
    assert.match(a, /^miniapp-[a-f0-9]{12}$/);
    assert.notEqual(a, newMiniAppSlug());
});

test('Hello World Card is a public miniapp card', () => {
    const md = helloWorldMiniAppMarkdown('miniapp-abc', '2026-01-01T00:00:00.000Z');
    for (const line of ['id: miniapp-abc', 'title: Hello World', 'play_mode: miniapp', 'is_public: true']) assert.ok(md.includes(line), line);
    assert.ok(md.includes('# Hello World'));
});

test('urls point at hypercardbook.org', () => {
    assert.deepEqual(miniAppUrls('miniapp-abc'), {
        cardUrl: 'https://www.hypercardbook.org/hypercard/miniapp-abc',
        editUrl: 'https://www.hypercardbook.org/workspace?mode=card&id=miniapp-abc'
    });
});

test('refs, covers and card urls are normalized', () => {
    assert.ok(validMiniAppRef('miniapp-abc') && validMiniAppRef('0b6f5c1e-1111-2222-3333-444455556666'));
    for (const bad of ['', '../x', 'a/b', 'a b', 'x'.repeat(201), 5]) assert.ok(!validMiniAppRef(bad as any));
    assert.equal(absoluteCoverImage('/img/a.png'), 'https://www.hypercardbook.org/img/a.png');
    assert.equal(absoluteCoverImage('https://x.example/a.png'), 'https://x.example/a.png');
    for (const bad of [null, '', 'data:image/png;base64,AAA', '//evil.example/a.png', 'http://x.example/a.png']) assert.equal(absoluteCoverImage(bad as any), null);
    assert.equal(miniAppCardUrl({ id: 'uuid-1', slug: 'my-slug' }), 'https://www.hypercardbook.org/hypercard/my-slug');
    assert.equal(miniAppCardUrl({ id: 'uuid-1', slug: 'bad slug' }), 'https://www.hypercardbook.org/hypercard/uuid-1');
});
