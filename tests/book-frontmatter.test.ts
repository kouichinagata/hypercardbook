import test from 'node:test';
import assert from 'node:assert/strict';
import { isSameDocument, parseBookFrontmatter } from '../src/lib/book-frontmatter.ts';

const mini = '---\nid: miniapp-1\ntitle: Tetris\nplay_mode: miniapp\n---\n# game';
const book = '---\nid: book-1\ntitle: B\nplay_mode: book\n---\n# b';

test('a reply with a table separator or "---" in the text is not a document', () => {
    assert.equal(parseBookFrontmatter('比較です\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n---\n続き').hasIdentity, false);
    assert.equal(parseBookFrontmatter('---\n続きの文章\n---\nさらに').hasIdentity, false);
    assert.equal(isSameDocument(mini, '| a |\n|---|\n| 1 |'), false);
});

test('a markdown block without id and play_mode frontmatter is not a document', () => {
    assert.equal(parseBookFrontmatter('# 見出し\n本文').hasIdentity, false);
    assert.equal(parseBookFrontmatter('---\nname: my-skill\ndescription: x\n---\n手順').hasIdentity, false);
    assert.equal(parseBookFrontmatter('---\ntitle: x\nplay_mode: card\n---\nbody').hasIdentity, false);
    assert.equal(parseBookFrontmatter(mini).hasIdentity, true);
});

test('a full rewrite with the same id and play_mode is the same document', () => {
    assert.equal(isSameDocument(mini, mini.replace('# game', '# new')), true);
    assert.equal(isSameDocument(book, book.replace('# b', '# c')), true);
});

test('a different Card or Book is not the same document', () => {
    assert.equal(isSameDocument(mini, '---\nid: x\ntitle: t\nplay_mode: card\n---\nhi'), false);
    assert.equal(isSameDocument(mini, book), false);
    assert.equal(isSameDocument(book, '---\nid: book-2\ntitle: t\nplay_mode: book\n---\nhi'), false);
    assert.equal(isSameDocument(mini, '---\nid: miniapp-1\ntitle: t\nplay_mode: book\n---\nhi'), false);
});

test('a MiniApp save that drops or changes id / play_mode is not the same document', () => {
    assert.equal(isSameDocument(mini, '# game only'), false);
    assert.equal(isSameDocument(mini, '---\ntitle: Tetris\n---\n# game'), false);
    assert.equal(isSameDocument(mini, mini.replace('miniapp-1', 'miniapp-2')), false);
    assert.equal(isSameDocument(mini, mini.replace('play_mode: miniapp', 'play_mode: card')), false);
});

test('an open document without id is compared by play_mode', () => {
    assert.equal(isSameDocument('# untitled', book), true);
    assert.equal(isSameDocument('# untitled', mini), false);
});
