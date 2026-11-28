import test from 'node:test';
import assert from 'node:assert/strict';
import { addPage, dbPages, deletePage, fieldStore, fieldView, parseFieldSelector, searchPages, updateField, updatePage } from '../src/lib/hyperbook-db.ts';
import { scanFields, setFieldInMarkdown } from '../src/lib/signature/fields.ts';

const TEMPLATE = `---
id: db-test
title: VerifyTest
play_mode: book
db_mode: template
---

# DB sample

Name: {{MarkdownAIinput}}

Dept: {{MarkdownAIinput}}

Joined: {{MarkdownAIinput:date}}

***

# Page 2

***

***
`;

test('the spec example has 3 pages, each showing page 1 fields', () => {
    const pages = dbPages(TEMPLATE);
    assert.equal(pages.length, 3);
    assert.match(pages[1], /^# Page 2\n\nName: \{\{MarkdownAIinput\}\}\n\nDept: \{\{MarkdownAIinput\}\}\n\nJoined: \{\{MarkdownAIinput:date\}\}$/);
    assert.match(pages[2], /^Name: /);
    assert.equal(scanFields(fieldView(TEMPLATE)).length, 9);
});

test('a value set on page 2 is stored as bare markers at the end of page 2 only', () => {
    const view = fieldView(TEMPLATE);
    // field 3 = page 2's Name
    const changed = setFieldInMarkdown(view, 3, 'Taro')!;
    const stored = fieldStore(TEMPLATE, changed)!;
    assert.ok(stored.includes('# Page 2\n\n{{MarkdownAIinput=Taro}}\n\n{{MarkdownAIinput}}\n\n{{MarkdownAIinput:date}}\n'));
    // page 3 is kept exactly as written
    assert.ok(stored.endsWith('***\n\n***\n'));
    assert.equal(scanFields(fieldView(stored))[3].value, 'Taro');
    assert.equal(scanFields(fieldView(stored))[0].value, '');
    // unchanged view: unchanged store
    assert.equal(fieldStore(TEMPLATE, view), TEMPLATE);
});

test('free layout and cards are left alone', () => {
    const free = TEMPLATE.replace('db_mode: template\n', '');
    assert.equal(fieldView(free), free);
    const card = TEMPLATE.replace('play_mode: book', 'play_mode: card');
    assert.equal(fieldView(card), card);
});

test('add: template page from the body, matched by kind and format', () => {
    const r = addPage(TEMPLATE, '{{MarkdownAIinput:date=2026/04/01}}\n\n{{MarkdownAIinput=Yamada}}\n\n{{MarkdownAIinput=Dev}}');
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.page, 4);
    const pages = dbPages(r.markdown);
    assert.equal(pages.length, 4);
    assert.equal(pages[3], 'Name: {{MarkdownAIinput=Yamada}}\n\nDept: {{MarkdownAIinput=Dev}}\n\nJoined: {{MarkdownAIinput:date=2026/04/01}}');
    // empty body: an empty page
    const e = addPage(TEMPLATE, '');
    assert.ok(e.ok && dbPages(e.markdown).length === 4);
});

test('add / update / delete in free layout', () => {
    const free = '---\nid: f\nplay_mode: book\n---\n\n# One\n\n***\n\n# Two\n';
    const a = addPage(free, '# Prompt\n\nMake a web app.');
    assert.ok(a.ok);
    if (!a.ok) return;
    assert.deepEqual(dbPages(a.markdown), ['# One', '# Two', '# Prompt\n\nMake a web app.']);
    const u = updatePage(a.markdown, 3, '# Prompt\n\nMake it mobile.');
    assert.ok(u.ok && dbPages(u.markdown)[2] === '# Prompt\n\nMake it mobile.');
    const d = deletePage(a.markdown, 1);
    assert.ok(d.ok && JSON.stringify(dbPages(d.markdown)) === JSON.stringify(['# Two', '# Prompt\n\nMake a web app.']));
    assert.equal(deletePage(a.markdown, 9).ok, false);
});

test('template: page 1 cannot be deleted; later pages can', () => {
    assert.equal(deletePage(TEMPLATE, 1).ok, false);
    const d = deletePage(TEMPLATE, 2);
    assert.ok(d.ok && dbPages(d.markdown).length === 2);
});

test('update: bulk and one field by kind, format and order', () => {
    const bulk = updatePage(TEMPLATE, 2, '{{MarkdownAIinput=Yamada}}\n\n{{MarkdownAIinput=Sales}}');
    assert.ok(bulk.ok);
    if (!bulk.ok) return;
    const one = updateField(bulk.markdown, 2, 'input(2)', '{{MarkdownAIinput=HQ}}');
    assert.ok(one.ok);
    if (!one.ok) return;
    assert.match(dbPages(one.markdown)[1], /Name: \{\{MarkdownAIinput=Yamada\}\}\n\nDept: \{\{MarkdownAIinput=HQ\}\}/);
    const date = updateField(one.markdown, 2, 'input:date(1)', '{{MarkdownAIinput:date=2026/12/01}}');
    assert.ok(date.ok && dbPages(date.markdown)[1].includes('{{MarkdownAIinput:date=2026/12/01}}'));
    assert.equal(updateField(TEMPLATE, 2, 'input(4)', '{{MarkdownAIinput=x}}').ok, false);
    assert.equal(updateField(TEMPLATE, 2, 'input:date(1)', '{{MarkdownAIinput:date=tomorrow}}').ok, false);
});

test('search returns page numbers and Markdown', () => {
    const r = updatePage(TEMPLATE, 3, '{{MarkdownAIinput=Yamada Taro}}');
    assert.ok(r.ok);
    if (!r.ok) return;
    const hits = searchPages(r.markdown, 'yamada');
    assert.deepEqual(hits.map((h) => h.page), [3]);
    assert.match(hits[0].markdown, /Yamada Taro/);
});

test('field selectors', () => {
    assert.deepEqual(parseFieldSelector('input:date(1)'), { key: 'input:date', n: 1 });
    assert.deepEqual(parseFieldSelector('input(2)'), { key: 'input', n: 2 });
    assert.equal(parseFieldSelector('input(0)'), null);
    assert.equal(parseFieldSelector('check:x(1)'), null);
});

test('a card is found from the Referer on the same host', async () => {
    const { refererCard } = await import('../src/lib/hyperbook-db.ts');
    const api = new URL('https://markdown.example.org/hyperbook/test-db-book/db?action=add');
    assert.equal(refererCard('https://markdown.example.org/hypercard/test-db-crud', api), 'test-db-crud');
    assert.equal(refererCard('https://evil.example.com/hypercard/test-db-crud', api), null);
    assert.equal(refererCard('https://markdown.example.org/hyperbook/x', api), null);
    assert.equal(refererCard(null, api), null);
    const www = new URL('https://www.example.org/hyperbook/b/db');
    assert.equal(refererCard('https://www.example.org/workspace?mode=card&id=abc-1', www), 'abc-1');
});
