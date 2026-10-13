import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCount, splitStatusStream, statusFrame } from '../src/lib/status-marker.ts';

/** Feed a stream to the splitter in the given chunks, the way the browser does. */
function run(chunks: string[]) {
    let buffer = '';
    const text: string[] = [];
    const statuses: string[] = [];
    for (const chunk of chunks) {
        const { parts, rest } = splitStatusStream(buffer + chunk);
        buffer = rest;
        for (const part of parts) (part.kind === 'text' ? text : statuses).push(part.value);
    }
    return { text: text.join('') + buffer, statuses };
}

test('statusFrame wraps one line and strips nested markers and newlines', () => {
    assert.equal(statusFrame('Asking model…'), '[STATUS]Asking model…[/STATUS]');
    assert.equal(statusFrame('a\n  b [STATUS]c[/STATUS]'), '[STATUS]a b c[/STATUS]');
    assert.equal(statusFrame(''), '[STATUS][/STATUS]');
});

test('plain text without markers passes through unchanged', () => {
    const { parts, rest } = splitStatusStream('Hello **world**\n```markdown\n# x\n```');
    assert.deepEqual(parts, [{ kind: 'text', value: 'Hello **world**\n```markdown\n# x\n```' }]);
    assert.equal(rest, '');
});

test('status frames are separated from text in order', () => {
    const { parts } = splitStatusStream(`[STATUS]one[/STATUS]Hi [STATUS]two[/STATUS]there`);
    assert.deepEqual(parts, [
        { kind: 'status', value: 'one' },
        { kind: 'text', value: 'Hi ' },
        { kind: 'status', value: 'two' },
        { kind: 'text', value: 'there' }
    ]);
});

test('a marker split at any position across chunks is reassembled and never leaks into the text', () => {
    const stream = `A[STATUS]Writing edit_book… 2.4k chars[/STATUS]B[STATUS][/STATUS]C`;
    for (let cut = 1; cut < stream.length; cut++) {
        const result = run([stream.slice(0, cut), stream.slice(cut)]);
        assert.equal(result.text, 'ABC', `cut at ${cut}`);
        assert.deepEqual(result.statuses, ['Writing edit_book… 2.4k chars', ''], `cut at ${cut}`);
    }
});

test('one character at a time still reassembles', () => {
    const stream = `[STATUS]Asking x…[/STATUS]Answer [MANGA_JOB]{}[/MANGA_JOB] end`;
    const result = run([...stream]);
    assert.equal(result.text, 'Answer [MANGA_JOB]{}[/MANGA_JOB] end');
    assert.deepEqual(result.statuses, ['Asking x…']);
});

test('other bracket markers are not held back or altered', () => {
    const result = run(['text [MARKDOWN_EDIT]{"a":1}[/MARKDOWN_EDIT] and [UPDATE_PAGES]x[/UPDATE_PAGES]']);
    assert.equal(result.text, 'text [MARKDOWN_EDIT]{"a":1}[/MARKDOWN_EDIT] and [UPDATE_PAGES]x[/UPDATE_PAGES]');
    assert.deepEqual(result.statuses, []);
});

test('an unfinished marker at the end of the stream is returned as the held-back tail', () => {
    const { parts, rest } = splitStatusStream('done [STATUS]never closed');
    assert.deepEqual(parts, [{ kind: 'text', value: 'done ' }]);
    assert.equal(rest, '[STATUS]never closed');
    assert.equal(splitStatusStream('abc[STA').rest, '[STA');
});

test('formatCount abbreviates thousands', () => {
    assert.equal(formatCount(999), '999');
    assert.equal(formatCount(2400), '2.4k');
    assert.equal(formatCount(12345), '12.3k');
});
