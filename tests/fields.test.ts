import test from 'node:test';
import assert from 'node:assert/strict';
import { inputToMarkdown, scanFields, setFieldInMarkdown, validateInput, inputSpecOf } from '../src/lib/signature/fields.ts';

test('fields are numbered in order, typed, and skip code', () => {
    const md = '{{MarkdownAIinput:xxxx}} {{MarkdownAIcheck}} {{MarkdownAIcheck:x}}\n`{{MarkdownAIinput:date}}`\n```\n{{MarkdownAIradio}}\n```\n{{MarkdownAIinput:textarea}}\n{{MarkdownAIinput:bogus}}';
    const f = scanFields(md);
    assert.deepEqual(f.map((x) => x.kind), ['input', 'check', 'check', 'input']);
    assert.deepEqual(f.map((x) => x.checked), [false, false, true, false]);
    assert.deepEqual(f[3].input, { type: 'textarea' });
});

test('input specs: X / N fixed, x / n max, digits, date', () => {
    assert.deepEqual(inputSpecOf('NNNN'), { type: 'digits', length: 4, fixed: true });
    assert.deepEqual(inputSpecOf('xxxxxxxxxxxxxxxxxxxx'), { type: 'text', length: 20, fixed: false });
    assert.equal(validateInput(inputSpecOf('NNNN')!, '123'), 'Enter exactly 4 characters.');
    assert.equal(validateInput(inputSpecOf('NNNN')!, '12a4') !== null, true);
    assert.equal(validateInput(inputSpecOf('NNNN')!, '1234'), null);
    assert.equal(validateInput(inputSpecOf('xxxx')!, ''), null);
    assert.equal(validateInput(inputSpecOf('xxxx')!, 'abcde') !== null, true);
    
    assert.equal(validateInput({ type: 'date' }, '2026-11-03'), null);
    assert.equal(validateInput({ type: 'date' }, 'tomorrow') !== null, true);
});

test('an input is replaced by its text, made safe', () => {
    const md = 'Name: {{MarkdownAIinput:xxxxxxxxxxxxxxxxxxxx}}\nAfter';
    assert.equal(setFieldInMarkdown(md, 0, 'Taro'), 'Name: Taro\nAfter');
    assert.equal(setFieldInMarkdown(md, 0, '{{MarkdownAIcheck}}'), 'Name: { {MarkdownAIcheck} }\nAfter');
    assert.equal(setFieldInMarkdown(md, 0, '<b>'), 'Name: &lt;b&gt;\nAfter');
    assert.equal(setFieldInMarkdown(md, 0, 'x'.repeat(21)), null);
    assert.equal(setFieldInMarkdown(md, 1, 'a'), null);
    assert.equal(inputToMarkdown('a\nb'), 'a<br>b');
});

test('confirming a check box replaces it with its state', () => {
    const md = '- {{MarkdownAIcheck}}A\n- {{MarkdownAIcheck:x}}B';
    assert.equal(setFieldInMarkdown(md, 0, true), '- ☑A\n- {{MarkdownAIcheck:x}}B');
    assert.equal(setFieldInMarkdown(md, 1, false), '- {{MarkdownAIcheck}}A\n- ☐B');
});

test('confirming a radio replaces its group, keeping every option', () => {
    const md = '- {{MarkdownAIradio:x}}りんご\n- {{MarkdownAIradio}}いちご\n- {{MarkdownAIradio}}バナナ\n\n- {{MarkdownAIradio}}d\n- {{MarkdownAIradio}}e';
    assert.equal(setFieldInMarkdown(md, 1, true), '- ○りんご\n- ◉いちご\n- ○バナナ\n\n- {{MarkdownAIradio}}d\n- {{MarkdownAIradio}}e');
    assert.equal(setFieldInMarkdown(md, 4, true), md.replace('- {{MarkdownAIradio:x}}りんご\n- {{MarkdownAIradio}}いちご\n- {{MarkdownAIradio}}バナナ', '- {{MarkdownAIradio:x}}りんご\n- {{MarkdownAIradio}}いちご\n- {{MarkdownAIradio}}バナナ').replace('- {{MarkdownAIradio}}d\n- {{MarkdownAIradio}}e', '- ○d\n- ◉e'));
    assert.equal(setFieldInMarkdown(md, 2, false), null);
});

test('a radio knows its group and which option is last', () => {
    const f = scanFields('- {{MarkdownAIradio}}a\n- {{MarkdownAIradio}}b\n\n- {{MarkdownAIradio}}c');
    assert.deepEqual(f.map((x) => [x.group, x.lastInGroup]), [[0, false], [0, true], [2, true]]);
});

test('a template has variables and is not a contract, a certificate, or signed', async () => {
    const { isTemplate, contractMarkdown } = await import('../src/lib/signature/contract.ts');
    assert.equal(isTemplate('---\nid: a\nplay_mode: card\n---\n{{MarkdownAIinput:xxxx}}'), true);
    assert.equal(isTemplate('{{MarkdownAIverify}}'), true);
    assert.equal(isTemplate('plain text'), false);
    assert.equal(isTemplate('---\ncontract_source_id: t\n---\n{{MarkdownAIcheck}}'), false);
    assert.equal(isTemplate('---\ncertificate_issuance_id: c\n---\n{{MarkdownAIverify}}'), false);
    assert.equal(isTemplate('![MarkdownAIverify:my](https://x.test/a.webp) {{MarkdownAIverify}}'), false);
    const md = contractMarkdown('---\nid: tpl\nis_public: true\npublished_at: 2026-01-01\ntitle: T\n---\n{{MarkdownAIcheck}}', { id: 'contract-1', sourceId: 'T1', title: 'T 2026-11-03 15:20' });
    assert.equal(md, '---\nid: contract-1\nis_public: false\ncontract_source_id: T1\ntitle: T 2026-11-03 15:20\n---\n{{MarkdownAIcheck}}');
    assert.equal(isTemplate(md), false);
});

test('a contract stamp is the Japan time to the minute', async () => {
    const { contractStamp } = await import('../src/lib/signature/contract.ts');
    assert.equal(contractStamp(new Date('2026-11-03T06:20:30Z')), '2026-11-03 15:20');
});
