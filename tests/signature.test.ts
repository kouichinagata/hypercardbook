import test from 'node:test';
import assert from 'node:assert/strict';
import { replaceSignMarkers, signSlotKinds } from '../src/lib/signature/markers.ts';
import { isValidSignatureSvg, strokesToSvg } from '../src/lib/signature/signature-svg.ts';

test('slots are numbered in order, typed by name, and skip code', () => {
    const md = 'A {{MarkdownAIVerify}}\n{{myMarkdownAIVerify}} {{your MarkdownAIVerify}} {{ yourMarkdownAIVerify }}\n`{{MarkdownAIVerify}}`\n```\n{{myMarkdownAIVerify}}\n```';
    assert.deepEqual(signSlotKinds(md), ['any', 'my', 'your', 'your']);
    assert.equal(replaceSignMarkers(md, (n) => `[${n}]`).split('\n')[0], 'A [0]');
});

test('only SVG generated from strokes is accepted', () => {
    const svg = strokesToSvg([[{ x: 1, y: 2 }, { x: 5, y: 6 }, { x: 9, y: 3 }], [{ x: 4, y: 4 }]]);
    assert.ok(isValidSignatureSvg(svg));
    assert.ok(!isValidSignatureSvg(svg.replace('</g>', '<script>alert(1)</script></g>')));
    assert.ok(!isValidSignatureSvg(svg.replace('<svg ', '<svg onload="x" ')));
    assert.ok(!isValidSignatureSvg(svg.replace('d="M', 'd="" onclick="x" x="M')));
});

test('signed slots are plain Markdown image links and are not slots any more', async () => {
    const { replaceSignedImages, signedImageMarkdown } = await import('../src/lib/signature/markers.ts');
    const md = `{{myMarkdownAIVerify}}\n${signedImageMarkdown('your', 'https://x.test/a.webp')}`;
    assert.deepEqual(signSlotKinds(md), ['my']);
    assert.equal(replaceSignedImages(md, (u) => `<${u}>`).split('\n')[1], '<https://x.test/a.webp>');
});

test('signing a slot rewrites only that slot, and guests never sign my', async () => {
    const { signSlotInMarkdown, guestMaySign } = await import('../src/lib/signature/markers.ts');
    const md = '{{myMarkdownAIVerify}}\n{{your MarkdownAIVerify}}\n{{your MarkdownAIVerify}}';
    const next = signSlotInMarkdown(md, 2, 'your', 'https://x.test/b.webp')!;
    assert.equal(next, '{{myMarkdownAIVerify}}\n{{your MarkdownAIVerify}}\n![MarkdownAIVerify:your](https://x.test/b.webp)');
    assert.equal(signSlotInMarkdown(md, 0, 'your', 'https://x.test/b.webp'), null);
    assert.equal(signSlotInMarkdown(md, 9, 'your', 'https://x.test/b.webp'), null);
    assert.deepEqual(['my', 'your', 'any'].map((k) => guestMaySign(k as any)), [false, true, true]);
});

test('stepIndex moves through the slots and wraps around', async () => {
    const { stepIndex } = await import('../src/lib/signature/sign-navigator.ts');
    assert.equal(stepIndex(0, -1, 1), -1);
    assert.equal(stepIndex(3, -1, 1), 0);
    assert.equal(stepIndex(3, -1, -1), 2);
    assert.equal(stepIndex(3, 2, 1), 0);
    assert.equal(stepIndex(3, 0, -1), 2);
    assert.equal(stepIndex(1, 0, 1), 0);
});
