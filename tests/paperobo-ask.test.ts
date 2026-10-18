import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../static/js/paperobo-ask.v1.js', import.meta.url), 'utf8');

// A MiniApp window inside a parent frame; `posted` records what reached the parent.
function miniApp({ hostname = 'www.hypercardbook.org', framed = true, ancestors }: { hostname?: string; framed?: boolean; ancestors?: string[] } = {}) {
    const listeners = new Set<(event: any) => void>();
    const posted: { message: any; origin: string }[] = [];
    const parent = { postMessage: (message: any, origin: string) => posted.push({ message, origin }) };
    const w: any = {
        location: { hostname, ...(ancestors ? { ancestorOrigins: ancestors } : {}) },
        addEventListener: (_: string, fn: any) => listeners.add(fn),
        removeEventListener: (_: string, fn: any) => listeners.delete(fn)
    };
    w.parent = framed ? parent : w;
    // Unref'd so a pending 180s timeout does not keep the test process alive
    const timer = (fn: () => void, ms: number) => setTimeout(fn, ms).unref();
    vm.runInNewContext(source, { window: w, setTimeout: timer, clearTimeout, Promise, Error, Object, String, Math, Date });
    const reply = (data: any, origin = 'https://paperobo.hypercardbook.org', source: any = parent) => listeners.forEach((fn) => fn({ data, origin, source }));
    return { w, posted, reply, listeners };
}

test('the prompt goes only to PapeRobo and the Markdown answer resolves', async () => {
    const app = miniApp();
    const answer = app.w.paperobo.ask('# 依頼\nまとめて');
    assert.deepEqual(app.posted.map((p) => p.origin), ['https://paperobo.hypercardbook.org']);
    const { id, type, prompt } = app.posted[0].message;
    assert.equal(type, 'paperobo:ask');
    assert.equal(prompt, '# 依頼\nまとめて');
    // Replies from another origin, another window or with another id are ignored
    app.reply({ type: 'paperobo:ask:result', id, markdown: 'evil' }, 'https://evil.example');
    app.reply({ type: 'paperobo:ask:result', id, markdown: 'evil' }, undefined, {});
    app.reply({ type: 'paperobo:ask:result', id: 'other', markdown: 'evil' });
    app.reply({ type: 'paperobo:ask:result', id, markdown: '| 名前 | 日時 |' });
    assert.equal(await answer, '| 名前 | 日時 |');
    assert.equal(app.listeners.size, 0);
});

test('one call per launch', async () => {
    const app = miniApp();
    void app.w.paperobo.ask('a');
    await assert.rejects(app.w.paperobo.ask('b'), { code: 'LIMIT_EXCEEDED' });
    assert.equal(app.posted.length, 1);
});

test('outside PapeRobo, invalid prompts and PapeRobo errors reject with a code', async () => {
    await assert.rejects(miniApp({ framed: false }).w.paperobo.ask('a'), { code: 'NOT_IN_PAPEROBO' });
    await assert.rejects(miniApp({ ancestors: ['https://www.hypercardbook.org'] }).w.paperobo.ask('a'), { code: 'NOT_IN_PAPEROBO' });
    const app = miniApp();
    for (const bad of ['', '   ', 'x'.repeat(8001), 42]) await assert.rejects(app.w.paperobo.ask(bad), { code: 'INVALID_PROMPT' });
    // Invalid prompts do not use up the launch
    const answer = app.w.paperobo.ask('ok');
    app.reply({ type: 'paperobo:ask:result', id: app.posted[0].message.id, error: { code: 'RATE_LIMITED', message: 'slow down' } });
    await assert.rejects(answer, { code: 'RATE_LIMITED', message: 'slow down' });
});

test('a Card on the local HyperCardBook talks to the local PapeRobo only', () => {
    const app = miniApp({ hostname: 'localhost', ancestors: ['http://127.0.0.1:5180'] });
    void app.w.paperobo.ask('a');
    assert.deepEqual(app.posted.map((p) => p.origin), ['http://127.0.0.1:5180', 'http://localhost:5180']);
});
