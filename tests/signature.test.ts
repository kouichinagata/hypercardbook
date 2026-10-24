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

test('seals are added before their slot, left to right, and never close the slot', async () => {
    const { stampSlotInMarkdown, replaceStampImages, signatureImageUrls, nextStampSlot, isComplete } = await import('../src/lib/signature/markers.ts').then(async (m) => ({ ...m, ...(await import('../src/lib/server/markdown-verify.ts')) }));
    const md = 'A {{your MarkdownAIVerify}}\nB {{myMarkdownAIVerify}}';
    const one = stampSlotInMarkdown(md, 0, 'https://x.test/1.webp')!;
    const two = stampSlotInMarkdown(one, 0, 'https://x.test/2.webp')!;
    assert.equal(two, 'A ![MarkdownAIVerify:stamp](https://x.test/1.webp) ![MarkdownAIVerify:stamp](https://x.test/2.webp) {{your MarkdownAIVerify}}\nB {{myMarkdownAIVerify}}');
    assert.deepEqual(signSlotKinds(two), ['your', 'my']);
    assert.equal(stampSlotInMarkdown(md, 5, 'https://x.test/1.webp'), null);
    assert.deepEqual(replaceStampImages(two, (u) => `<${u}>`).split('\n')[0], 'A <https://x.test/1.webp> <https://x.test/2.webp> {{your MarkdownAIVerify}}');
    assert.deepEqual(signatureImageUrls(two), ['https://x.test/1.webp', 'https://x.test/2.webp']);
    assert.ok(!isComplete(two));
    // a guest skips `my` and takes the next slot they may fill
    assert.deepEqual(nextStampSlot('{{myMarkdownAIVerify}} {{MarkdownAIVerify}}', (k) => k !== 'my'), { slot: 1, kind: 'any' });
    assert.equal(nextStampSlot('{{myMarkdownAIVerify}}', (k) => k !== 'my'), null);
});

test('only the seal SVG dialect is accepted', async () => {
    const { isValidStampSvg } = await import('../src/lib/signature/stamp-svg.ts');
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320"><circle cx="160" cy="160" r="100" fill="none" stroke="#c00" stroke-width="8"/><text x="160" y="170" text-anchor="middle" fill="#c00">OK</text></svg>';
    assert.ok(isValidStampSvg(svg));
    assert.ok(!isValidStampSvg(svg.replace('</svg>', '<script>x</script></svg>')));
    assert.ok(!isValidStampSvg(svg.replace('<circle ', '<circle onload="x" ')));
    assert.ok(!isValidStampSvg(svg.replace('0 0 320 320', '0 0 100 100')));
});
