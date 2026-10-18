import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addMiniAppByRef, miniAppRegistrationError, type MiniAppBook } from '../src/lib/server/mini-app-registration.ts';

const id = '0b6f5c1e-1111-4222-8333-444455556666';
const book: MiniAppBook = { id, slug: 'hello', title: 'Hello', user_id: 'owner', is_public: true, is_quark_choice: false, markdown_content: '---\nplay_mode: miniapp\n---\nHello' };

test('shelf and URL additions share validation; only known UUID links grant unlisted access', () => {
    assert.equal(miniAppRegistrationError(book, 'hello', 'viewer'), undefined);
    const privateBook = { ...book, is_public: false };
    assert.equal(miniAppRegistrationError(privateBook, 'hello', 'owner'), undefined);
    assert.match(miniAppRegistrationError(privateBook, 'hello', 'viewer')!, /not available/);
    assert.match(miniAppRegistrationError(privateBook, id, 'viewer')!, /not available/);
    assert.match(miniAppRegistrationError(privateBook, 'hello', 'viewer', true)!, /not available/);
    assert.equal(miniAppRegistrationError(privateBook, id, 'viewer', true), undefined);
    assert.equal(miniAppRegistrationError({ ...privateBook, is_quark_choice: true }, 'hello', 'viewer'), undefined);
    for (const candidate of [null, { ...book, markdown_content: '---\nplay_mode: card\n---' }]) {
        assert.match(miniAppRegistrationError(candidate, id, 'viewer', true)!, /not found/);
    }
});

type Entry = { user_id: string; ref: string; position: number; title?: string };
function fixture(entries: Entry[] = [], target: MiniAppBook | null = book, fail = '') {
    const calls: string[] = [];
    const client = { from(table: string) {
        let column = '', value: unknown;
        const query = {
            select() { return query; },
            eq(key: string, val: unknown) { column = key; value = val; return query; },
            async maybeSingle() {
                calls.push(`book:${column}:${value}`);
                return { data: target, error: fail === 'book' ? { message: 'lookup failed' } : null };
            },
            then(resolve: (value: unknown) => unknown) {
                assert.equal(table, 'mini_apps'); assert.equal(column, 'user_id'); assert.equal(value, 'viewer');
                return Promise.resolve({ data: entries.filter(row => row.user_id === value), error: fail === 'list' ? { message: 'list failed' } : null }).then(resolve);
            },
            async upsert(row: Entry, options: unknown) {
                calls.push('upsert');
                assert.deepEqual(options, { onConflict: 'user_id,ref', ignoreDuplicates: true });
                if (fail === 'insert') return { error: { message: 'write failed' } };
                if (!entries.some(existing => existing.user_id === row.user_id && existing.ref === row.ref)) entries.push(row);
                return { error: null };
            }
        };
        return query;
    } };
    return { entries, calls, client: client as unknown as SupabaseClient };
}

test('URL add appends to the current user without replacing entries or touching another user', async () => {
    const initial = [{ user_id: 'viewer', ref: 'existing', position: 4, title: 'Keep' }, { user_id: 'someone-else', ref: id, position: 8 }];
    const h = fixture(structuredClone(initial));
    assert.deepEqual(await addMiniAppByRef(h.client, 'viewer', 'hello'), { status: 200 });
    assert.deepEqual(h.entries.slice(0, 2), initial);
    assert.deepEqual(h.entries[2], { user_id: 'viewer', ref: id, title: 'Hello', position: 5 });
    assert.ok(h.calls.includes('book:slug:hello'));
    assert.deepEqual(await addMiniAppByRef(h.client, 'viewer', id), { status: 200 });
    assert.equal(h.entries.length, 3);
    assert.equal(h.calls.filter(call => call === 'upsert').length, 1);
});

test('existing slug entries are not duplicated by UUID URLs, including at the list limit', async () => {
    const h = fixture(Array.from({ length: 100 }, (_, i) => ({ user_id: 'viewer', ref: i === 0 ? 'hello' : `other-${i}`, position: i })));
    assert.deepEqual(await addMiniAppByRef(h.client, 'viewer', id), { status: 200 });
    assert.ok(!h.calls.includes('upsert'));
    h.entries[0].ref = 'different';
    assert.equal((await addMiniAppByRef(h.client, 'viewer', id)).status, 400);
    assert.equal(h.entries.length, 100);
});

test('invalid references, unavailable cards and database failures never report a successful add', async () => {
    const invalid = fixture();
    assert.equal((await addMiniAppByRef(invalid.client, 'viewer', '../bad')).status, 400);
    assert.equal(invalid.calls.length, 0);
    for (const target of [null, { ...book, is_public: false }, { ...book, markdown_content: '---\nplay_mode: book\n---' }]) {
        const h = fixture([], target);
        assert.equal((await addMiniAppByRef(h.client, 'viewer', 'hello')).status, 400);
        assert.ok(!h.calls.includes('upsert'));
    }
    for (const fail of ['book', 'list', 'insert']) {
        const h = fixture([], book, fail);
        assert.equal((await addMiniAppByRef(h.client, 'viewer', id)).status, 500);
        assert.equal(h.entries.length, 0);
    }
});
