import test from 'node:test';
import assert from 'node:assert/strict';
import { inputToMarkdown, scanFields, setFieldInMarkdown, validateInput, inputSpecOf } from '../src/lib/signature/fields.ts';

test('fields are numbered in order, typed, and skip code', () => {
    const md = '{{MarkdownAIinputConfirm:xxxx}} {{MarkdownAIcheckConfirm}} {{MarkdownAIcheckConfirm:x}}\n`{{MarkdownAIinputConfirm:date}}`\n```\n{{MarkdownAIradioConfirm}}\n```\n{{MarkdownAIinputConfirm:textarea}}\n{{MarkdownAIinputConfirm:bogus}}';
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
    const md = 'Name: {{MarkdownAIinputConfirm:xxxxxxxxxxxxxxxxxxxx}}\nAfter';
    assert.equal(setFieldInMarkdown(md, 0, 'Taro'), 'Name: Taro\nAfter');
    assert.equal(setFieldInMarkdown(md, 0, '{{MarkdownAIcheck}}'), 'Name: { {MarkdownAIcheck} }\nAfter');
    assert.equal(setFieldInMarkdown(md, 0, '<b>'), 'Name: &lt;b&gt;\nAfter');
    assert.equal(setFieldInMarkdown(md, 0, 'x'.repeat(21)), null);
    assert.equal(setFieldInMarkdown(md, 1, 'a'), null);
    assert.equal(inputToMarkdown('a\nb'), 'a<br>b');
});

test('confirming a check box replaces it with its state', () => {
    const md = '- {{MarkdownAIcheckConfirm}}A\n- {{MarkdownAIcheckConfirm:x}}B';
    assert.equal(setFieldInMarkdown(md, 0, true), '- ☑A\n- {{MarkdownAIcheckConfirm:x}}B');
    assert.equal(setFieldInMarkdown(md, 1, false), '- {{MarkdownAIcheckConfirm}}A\n- ☐B');
});

test('confirming a radio replaces its group, keeping every option', () => {
    const md = '- {{MarkdownAIradioConfirm:x}}りんご\n- {{MarkdownAIradioConfirm}}いちご\n- {{MarkdownAIradioConfirm}}バナナ\n\n- {{MarkdownAIradioConfirm}}d\n- {{MarkdownAIradioConfirm}}e';
    assert.equal(setFieldInMarkdown(md, 1, true), '- ○りんご\n- ◉いちご\n- ○バナナ\n\n- {{MarkdownAIradioConfirm}}d\n- {{MarkdownAIradioConfirm}}e');
    assert.equal(setFieldInMarkdown(md, 4, true), md.replace('- {{MarkdownAIradioConfirm:x}}りんご\n- {{MarkdownAIradioConfirm}}いちご\n- {{MarkdownAIradioConfirm}}バナナ', '- {{MarkdownAIradioConfirm:x}}りんご\n- {{MarkdownAIradioConfirm}}いちご\n- {{MarkdownAIradioConfirm}}バナナ').replace('- {{MarkdownAIradioConfirm}}d\n- {{MarkdownAIradioConfirm}}e', '- ○d\n- ◉e'));
    assert.equal(setFieldInMarkdown(md, 2, false), null);
});

test('a radio knows its group and which option is last', () => {
    const f = scanFields('- {{MarkdownAIradioConfirm}}a\n- {{MarkdownAIradioConfirm}}b\n\n- {{MarkdownAIradioConfirm}}c');
    assert.deepEqual(f.map((x) => [x.group, x.lastInGroup]), [[0, false], [0, true], [2, true]]);
});

test('a template has variables and is not a contract or a certificate; the owner may have signed it', async () => {
    const { isTemplate, contractMarkdown } = await import('../src/lib/signature/contract.ts');
    assert.equal(isTemplate('---\nid: a\nplay_mode: card\n---\n{{MarkdownAIinputConfirm:xxxx}}'), true);
    assert.equal(isTemplate('{{MarkdownAIverifyConfirm}}'), true);
    assert.equal(isTemplate('plain text'), false);
    assert.equal(isTemplate('---\ncontract_source_id: t\n---\n{{MarkdownAIcheckConfirm}}'), false);
    assert.equal(isTemplate('---\ncertificate_issuance_id: c\n---\n{{MarkdownAIverifyConfirm}}'), false);
    assert.equal(isTemplate('![MarkdownAIverify:my](https://x.test/a.webp) {{MarkdownAIverifyConfirm}}'), true);
    const md = contractMarkdown('---\nid: tpl\nis_public: true\npublished_at: 2026-01-01\ntitle: T\n---\n{{MarkdownAIcheckConfirm}}', { id: 'contract-1', sourceId: 'T1', title: 'T 2026-11-03 15:20' });
    assert.equal(md, '---\nid: contract-1\nis_public: false\ncontract_source_id: T1\ntitle: T 2026-11-03 15:20\n---\n{{MarkdownAIcheckConfirm}}');
    assert.equal(isTemplate(md), false);
});

test('only MarkdownAI documents are Verify documents, never an ordinary HTML form card', async () => {
    const { isVerifyDocument } = await import('../src/lib/signature/contract.ts');
    assert.equal(isVerifyDocument('<form><input type="text" name="a"><input type="checkbox"><button>Send</button></form>'), false);
    assert.equal(isVerifyDocument('---\nplay_mode: card\n---\n# Survey\n<input type="radio"> a\n`{{MarkdownAIinputConfirm}}`\n```\n{{MarkdownAIverifyConfirm}}\n```'), false);
    assert.equal(isVerifyDocument('plain text'), false);
    assert.equal(isVerifyDocument('{{MarkdownAIinputConfirm:xxxx}}'), true);
    assert.equal(isVerifyDocument('{{your MarkdownAIverifyConfirm}}'), true);
    assert.equal(isVerifyDocument('![MarkdownAIverify:my](https://x.test/a.webp)'), true);
    assert.equal(isVerifyDocument('---\ncontract_source_id: t\n---\nAll fields are confirmed'), true);
    assert.equal(isVerifyDocument('---\ncertificate_issuance_id: c\n---\nx'), true);
});

test('a completed contract becomes the signer\'s private copy, keeping its signatures', async () => {
    const { signedCopyMarkdown, isContract } = await import('../src/lib/signature/contract.ts');
    const md = '---\nid: contract-1\nis_public: true\npublished_at: 2026-01-01\ncontract_source_id: T1\ntitle: T\n---\n![MarkdownAIverify:my](https://x.test/a.webp)';
    assert.equal(signedCopyMarkdown(md, 'signed-1'), '---\nid: signed-1\nis_public: false\ncontract_source_id: T1\ntitle: T\n---\n![MarkdownAIverify:my](https://x.test/a.webp)');
    assert.equal(isContract(md), true);
    assert.equal(isContract('{{MarkdownAIverifyConfirm}}'), false);
});

test('a contract stamp is the Japan time to the minute', async () => {
    const { contractStamp } = await import('../src/lib/signature/contract.ts');
    assert.equal(contractStamp(new Date('2026-11-03T06:20:30Z')), '2026-11-03 15:20');
});

test('a changeable input keeps its value in the marker, and a date is kept as 2026/10/21', () => {
    const md = 'Name: {{MarkdownAIinput}}\nDay: {{MarkdownAIinput:date}}\nCode: {{MarkdownAIinput:XXXX}}';
    const named = setFieldInMarkdown(md, 0, 'Taro')!;
    assert.equal(named, 'Name: {{MarkdownAIinput=Taro}}\nDay: {{MarkdownAIinput:date}}\nCode: {{MarkdownAIinput:XXXX}}');
    const dated = setFieldInMarkdown(named, 1, '2026-10-21')!;
    assert.match(dated, /Day: \{\{MarkdownAIinput:date=2026\/10\/21\}\}/);
    const again = setFieldInMarkdown(dated, 0, 'Jiro')!;
    assert.match(again, /Name: \{\{MarkdownAIinput=Jiro\}\}/);
    const f = scanFields(again);
    assert.deepEqual(f.map((x) => [x.confirm, x.value]), [[false, 'Jiro'], [false, '2026-10-21'], [false, '']]);
    assert.equal(setFieldInMarkdown(again, 2, 'abc'), null);
    assert.equal(setFieldInMarkdown(setFieldInMarkdown(again, 2, 'ABCD')!, 2, ''), again);
});

test('a changeable input value with braces, |, < and line breaks comes back as typed', () => {
    const md = '| a | {{MarkdownAIinput:textarea}} |';
    const typed = 'x}} {{MarkdownAIcheck}} | <b> &\nnext}';
    const saved = setFieldInMarkdown(md, 0, typed)!;
    assert.equal(scanFields(saved).length, 1);
    assert.equal(scanFields(saved)[0].value, typed);
    assert.doesNotMatch(saved.slice(saved.indexOf('{{'), saved.lastIndexOf('}}')), /\||\n/);
});

test('changeable check boxes and radios keep their state in the marker; groups never mix the two versions', () => {
    const md = '- {{MarkdownAIcheck:x}}A\n- {{MarkdownAIradio:x}}a\n- {{MarkdownAIradio}}b\n- {{MarkdownAIradioConfirm}}c';
    const f = scanFields(md);
    assert.deepEqual(f.map((x) => [x.checked, x.group, x.lastInGroup]), [[true, undefined, undefined], [true, 1, false], [false, 1, true], [false, 3, true]]);
    const unchecked = setFieldInMarkdown(md, 0, false)!;
    assert.match(unchecked, /\{\{MarkdownAIcheck=\}\}A/);
    assert.equal(scanFields(unchecked)[0].checked, false);
    const picked = setFieldInMarkdown(unchecked, 2, true)!;
    assert.equal(picked, '- {{MarkdownAIcheck=}}A\n- {{MarkdownAIradio}}a\n- {{MarkdownAIradio=x}}b\n- {{MarkdownAIradioConfirm}}c');
    assert.deepEqual(scanFields(picked).map((x) => x.checked), [false, false, true, false]);
});

test('a Confirm marker never keeps a value, and only Confirm fields must be confirmed', async () => {
    const { hasConfirmFields } = await import('../src/lib/signature/fields.ts');
    assert.equal(scanFields('{{MarkdownAIinputConfirm=Taro}}').length, 0);
    assert.equal(hasConfirmFields('{{MarkdownAIinput=Taro}} {{MarkdownAIcheck}}'), false);
    assert.equal(hasConfirmFields('{{MarkdownAIinput}} {{MarkdownAIcheckConfirm}}'), true);
});

test('the changeable values on screen are written back with a signature', async () => {
    const { changeableValues, applyChangeableValues } = await import('../src/lib/signature/fields.ts');
    const server = '{{MarkdownAIinputConfirm}} {{MarkdownAIinput}} {{MarkdownAIcheck}}\n- {{MarkdownAIradio}}a\n- {{MarkdownAIradio}}b\n{{MarkdownAIinput:date=2026/1/5}}';
    let screen = setFieldInMarkdown(server, 1, 'Taro')!;
    screen = setFieldInMarkdown(screen, 2, true)!;
    screen = setFieldInMarkdown(screen, 4, true)!;
    const values = changeableValues(screen);
    assert.deepEqual(values, ['Taro', true, false, true, '2026-1-5']);
    // A hand-written value that does not fit the field is left alone when it is not changed
    assert.equal(applyChangeableValues(server, values), screen);
    assert.equal(applyChangeableValues(server, values.slice(1)), null);
    assert.equal(applyChangeableValues(server, [1, true, false, true, null]), null);
    assert.equal(applyChangeableValues(screen, ['', true, false, true, null]), screen.replace('{{MarkdownAIinput=Taro}}', '{{MarkdownAIinput}}'));
});
