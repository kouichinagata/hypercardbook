import test from 'node:test';
import assert from 'node:assert/strict';
import { readIdentity, judgeAiReplace, saveIdentityConflict } from '../src/lib/markdown-guard.ts';

const mini = '---\nid: miniapp-1\ntitle: Tetris\nplay_mode: miniapp\n---\n# game';
const book = '---\nid: book-1\ntitle: B\nplay_mode: book\n---\n# b';

test('readIdentity needs frontmatter with id and play_mode', () => {
    assert.deepEqual(readIdentity(mini), { id: 'miniapp-1', playMode: 'miniapp' });
    assert.equal(readIdentity('| a | b |\n|---|---|\n| 1 | 2 |'), null);
    assert.equal(readIdentity('---\ntitle: x\n---\nbody'), null);
});

test('conversational text with a table separator never replaces the body', () => {
    const reply = '比較です\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n---\n続き';
    assert.equal(judgeAiReplace(mini, reply, true), 'ignore');
    assert.equal(judgeAiReplace(mini, '---\n続きの文章', true), 'ignore');
});

test('a full rewrite with the same id and play_mode is applied', () => {
    assert.equal(judgeAiReplace(mini, mini.replace('# game', '# new'), true), 'apply');
});

test('a different card is offered as a new Card, a different book is ignored', () => {
    assert.equal(judgeAiReplace(mini, '---\nid: x\ntitle: t\nplay_mode: card\n---\nhi', true), 'block');
    assert.equal(judgeAiReplace(mini, book, true), 'ignore');
    assert.equal(judgeAiReplace(mini, '---\nid: miniapp-1\ntitle: t\nplay_mode: book\n---\nhi', true), 'ignore');
});

test('an unsaved draft accepts a well-formed new document', () => {
    assert.equal(judgeAiReplace('', mini, false), 'apply');
});

test('saving cannot drop or change a miniapp identity', () => {
    const existing = { slug: 'miniapp-1', playMode: 'miniapp' };
    assert.equal(saveIdentityConflict(existing, mini), null);
    assert.ok(saveIdentityConflict(existing, '| a |\n|---|\n| 1 |'));
    assert.ok(saveIdentityConflict(existing, '---\nid: miniapp-1\ntitle: t\nplay_mode: book\n---\nx'));
    assert.ok(saveIdentityConflict(existing, mini.replace('miniapp-1', 'miniapp-2')));
    assert.equal(saveIdentityConflict({ slug: 'book-1', playMode: 'book' }, '---\nid: other\ntitle: t\n---\nx'), null);
});
