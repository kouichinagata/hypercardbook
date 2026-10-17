import test from 'node:test';
import assert from 'node:assert/strict';
import { miniAppInstruction } from '../src/lib/server/mini-app-instruction.ts';
import { helloWorldMiniAppMarkdown } from '../src/lib/mini-app.ts';

const mini = helloWorldMiniAppMarkdown('miniapp-test');
test('new Mini App and subsequent edits receive the embedding contract', () => {
    const initial = miniAppInstruction('card', mini, false);
    assert.ok(initial.includes('330 x 480') && initial.includes('240 x 349'));
    for (const rule of ['11:16', 'edit_card', 'play_mode: miniapp', 'allow-same-origin', 'in-memory fallback', 'publication settings']) assert.ok(initial.includes(rule), rule);
    assert.equal(miniAppInstruction('card', mini + '\n<button>Start</button>', false), initial);
});
test('ordinary Cards, Books, Plan mode and mentions in body do not receive Mini App generation rules', () => {
    assert.equal(miniAppInstruction('card', mini, true), '');
    assert.equal(miniAppInstruction('book', mini, false), '');
    assert.equal(miniAppInstruction('card', mini.replace('play_mode: miniapp', 'play_mode: card'), false), '');
    assert.equal(miniAppInstruction('card', '---\nplay_mode: card\n---\nExample: play_mode: miniapp', false), '');
    assert.equal(miniAppInstruction('card', '# Example\nplay_mode: miniapp', false), '');
    assert.equal(miniAppInstruction('card', null, false), '');
});
