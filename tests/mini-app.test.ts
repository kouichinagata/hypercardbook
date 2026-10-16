import test from 'node:test';
import assert from 'node:assert/strict';
import { newMiniAppSlug, helloWorldMiniAppMarkdown, miniAppUrls, validMiniAppRef, absoluteCoverImage, miniAppCardUrl } from '../src/lib/mini-app.ts';

test('slug is URL-safe and unique per call', () => {
    const a = newMiniAppSlug();
    assert.match(a, /^miniapp-[a-f0-9]{12}$/);
    assert.notEqual(a, newMiniAppSlug());
});

test('Hello World Card is an unlisted (not public) miniapp card', () => {
    const md = helloWorldMiniAppMarkdown('miniapp-abc');
    for (const line of ['id: miniapp-abc', 'title: Hello World', 'play_mode: miniapp', 'is_public: false']) assert.ok(md.includes(line), line);
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
    assert.equal(miniAppCardUrl({ id: 'uuid-1' }), 'https://www.hypercardbook.org/hypercard/uuid-1');
});

test('urls can be built for a local origin', () => {
    assert.deepEqual(miniAppUrls('miniapp-abc', 'http://localhost:5173'), {
        cardUrl: 'http://localhost:5173/hypercard/miniapp-abc',
        editUrl: 'http://localhost:5173/workspace?mode=card&id=miniapp-abc'
    });
    assert.equal(miniAppCardUrl({ id: 'u' }, 'http://localhost:5173'), 'http://localhost:5173/hypercard/u');
    assert.equal(absoluteCoverImage('/a.png', 'http://localhost:5173'), 'http://localhost:5173/a.png');
});

import { servesUnlistedMiniApp, isBookUuid } from '../src/lib/unlisted-mini-app.ts';

test('unlisted MiniApps are served only by UUID', () => {
    const uuid = '0b6f5c1e-1111-4222-8333-444455556666';
    assert.ok(isBookUuid(uuid) && !isBookUuid('minutes') && !isBookUuid(''));
    assert.ok(servesUnlistedMiniApp(uuid, 'miniapp'));
    assert.ok(!servesUnlistedMiniApp('minutes', 'miniapp'));
    assert.ok(!servesUnlistedMiniApp(uuid, 'card') && !servesUnlistedMiniApp(uuid, 'book') && !servesUnlistedMiniApp(uuid, undefined));
});
