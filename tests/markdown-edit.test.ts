import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEdits, applyPageEdit, lineDiff, pageRanges } from '../src/lib/markdown-edit.ts';
import { CONFLICT_MESSAGE, applyMarkdownEditCommand } from '../src/lib/server/card-edit.ts';

const CARD = `---
id: tea
title: お茶の話
play_mode: card
---
# お茶の話

緑茶は日本で広く飲まれています。
紅茶は世界で広く飲まれています。

![tea](https://example.com/tea.png)
`;

const BOOK = `---
id: book
title: 本
play_mode: book
---

# 1ページ目
りんごの話。

***

# 2ページ目
りんごの話。

***

# 3ページ目
みかんの話。
`;

// books テーブル 1 行だけを持つ Supabase クライアントのモック（select / update の条件を実際に評価する）
function mockSupabase(row: Record<string, any> | null) {
    const state = { row: row ? { ...row } : null, updates: 0 };
    const client = {
        from() {
            const filters: [string, unknown][] = [];
            let pendingUpdate: Record<string, unknown> | null = null;
            const matches = () => state.row !== null && filters.every(([key, value]) => state.row![key] === value);
            const builder: any = {
                select() { return builder; },
                update(values: Record<string, unknown>) { pendingUpdate = values; return builder; },
                eq(key: string, value: unknown) { filters.push([key, value]); return builder; },
                async maybeSingle() {
                    if (!matches()) return { data: null, error: null };
                    if (pendingUpdate) {
                        state.row = { ...state.row, ...pendingUpdate };
                        state.updates++;
                    }
                    return { data: { ...state.row }, error: null };
                }
            };
            return builder;
        }
    };
    return { client: client as any, state };
}

const USER = 'user-1';
const CARD_ID = 'card-1';
const cardRow = () => ({ id: CARD_ID, user_id: USER, markdown_content: CARD, version: 3 });

test('一意に一致する編集が成功し、保存されてバージョンが +1 される', async () => {
    const { client, state } = mockSupabase(cardRow());
    const result = await applyMarkdownEditCommand(client, USER, {
        card_id: CARD_ID,
        base_version: 3,
        edits: [{ old_string: '緑茶は日本で', new_string: '煎茶は日本で' }]
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.version, 4);
    assert.equal(state.row!.version, 4);
    assert.equal(state.updates, 1);
    // 指定箇所以外は 1 文字も変わらない
    assert.equal(state.row!.markdown_content, CARD.replace('緑茶は日本で', '煎茶は日本で'));
});

test('MiniApp の play_mode / id を消す・変える編集は保存しない', async () => {
    const mini = CARD.replace('play_mode: card', 'play_mode: miniapp');
    for (const edit of [
        { old_string: 'play_mode: miniapp\n', new_string: '' },
        { old_string: 'play_mode: miniapp', new_string: 'play_mode: book' },
        { old_string: 'id: tea', new_string: 'id: coffee' }
    ]) {
        const { client, state } = mockSupabase({ ...cardRow(), markdown_content: mini });
        const result = await applyMarkdownEditCommand(client, USER, { card_id: CARD_ID, base_version: 3, edits: [edit] });
        assert.equal(result.ok, false);
        assert.equal(state.updates, 0);
        assert.equal(state.row!.markdown_content, mini);
    }
    const { client } = mockSupabase({ ...cardRow(), markdown_content: mini });
    const ok = await applyMarkdownEditCommand(client, USER, { card_id: CARD_ID, base_version: 3, edits: [{ old_string: '緑茶は日本で', new_string: '煎茶は日本で' }] });
    assert.equal(ok.ok, true);
});

test('new_string が空なら削除になる', () => {
    const result = applyEdits(CARD, [{ old_string: '\n![tea](https://example.com/tea.png)\n', new_string: '' }]);
    assert.equal(result.ok, true);
    if (result.ok) assert.ok(!result.markdown.includes('tea.png'));
});

test('old_string が空ならバリデーションで失敗する', () => {
    const result = applyEdits(CARD, [{ old_string: '', new_string: 'x' }]);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.errors[0].code, 'empty_old_string');
});

test('0 件一致は失敗し、保存されない', async () => {
    const { client, state } = mockSupabase(cardRow());
    const result = await applyMarkdownEditCommand(client, USER, {
        card_id: CARD_ID,
        base_version: 3,
        edits: [{ old_string: 'ほうじ茶', new_string: '番茶' }]
    });
    assert.equal(result.ok, false);
    if (result.ok || result.code !== 'edit_failed') return assert.fail('edit_failed expected');
    assert.deepEqual(result.errors.map(e => [e.index, e.code, e.count]), [[0, 'not_found', 0]]);
    assert.equal(state.updates, 0);
    assert.equal(state.row!.markdown_content, CARD);
    assert.equal(state.row!.version, 3);
});

test('複数件一致は失敗し、文脈を広げるよう返して保存されない', async () => {
    const { client, state } = mockSupabase(cardRow());
    const result = await applyMarkdownEditCommand(client, USER, {
        card_id: CARD_ID,
        base_version: 3,
        edits: [{ old_string: '広く飲まれています', new_string: 'よく飲まれています' }]
    });
    assert.equal(result.ok, false);
    if (result.ok || result.code !== 'edit_failed') return assert.fail('edit_failed expected');
    assert.equal(result.errors[0].code, 'ambiguous');
    assert.equal(result.errors[0].count, 2);
    assert.match(result.errors[0].message, /surrounding text/);
    assert.equal(state.updates, 0);
    assert.equal(state.row!.markdown_content, CARD);
});

test('複数編集のうち 1 件が失敗したら全体がロールバックされる', async () => {
    const { client, state } = mockSupabase(cardRow());
    const result = await applyMarkdownEditCommand(client, USER, {
        card_id: CARD_ID,
        base_version: 3,
        edits: [
            { old_string: '緑茶は日本で', new_string: '煎茶は日本で' }, // 成功するはずの編集
            { old_string: 'ウーロン茶', new_string: '烏龍茶' }, // 見つからない
            { old_string: '紅茶は世界で', new_string: 'ブラックティーは世界で' } // 成功するはずの編集
        ]
    });
    assert.equal(result.ok, false);
    if (result.ok || result.code !== 'edit_failed') return assert.fail('edit_failed expected');
    assert.deepEqual(result.errors.map(e => e.index), [1]);
    assert.equal(state.updates, 0);
    assert.equal(state.row!.markdown_content, CARD);
    assert.equal(state.row!.version, 3);
});

test('edits は先頭から順に適用される（前の編集結果に対して次を探す）', () => {
    const result = applyEdits(CARD, [
        { old_string: '緑茶は日本で', new_string: '抹茶は京都で' },
        { old_string: '抹茶は京都で広く', new_string: '抹茶は京都で特に' }
    ]);
    assert.equal(result.ok, true);
    if (result.ok) assert.ok(result.markdown.includes('抹茶は京都で特に飲まれています。'));
});

test('base_version が不一致なら競合エラーを返し、保存しない', async () => {
    const { client, state } = mockSupabase(cardRow());
    const result = await applyMarkdownEditCommand(client, USER, {
        card_id: CARD_ID,
        base_version: 2,
        edits: [{ old_string: '緑茶は日本で', new_string: '煎茶は日本で' }]
    });
    assert.equal(result.ok, false);
    if (result.ok || result.code !== 'conflict') return assert.fail('conflict expected');
    assert.equal(result.message, CONFLICT_MESSAGE);
    assert.equal(result.current_version, 3);
    assert.equal(state.updates, 0);
});

test('読み込み後に他の保存でバージョンが進んだら、書き込まず競合になる', async () => {
    const { client, state } = mockSupabase(cardRow());
    const originalFrom = client.from;
    let calls = 0;
    client.from = () => {
        // 読み込みの直後（書き込みの前）に、別の保存が入ったことにする
        if (++calls === 2) state.row!.version = 4;
        return originalFrom();
    };
    const result = await applyMarkdownEditCommand(client, USER, {
        card_id: CARD_ID,
        base_version: 3,
        edits: [{ old_string: '緑茶は日本で', new_string: '煎茶は日本で' }]
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'conflict');
    assert.equal(state.updates, 0);
    assert.equal(state.row!.markdown_content, CARD);
});

test('フロントマターを変えたら title の列も更新する', async () => {
    const { client, state } = mockSupabase(cardRow());
    const result = await applyMarkdownEditCommand(client, USER, {
        card_id: CARD_ID,
        base_version: 3,
        edits: [{ old_string: 'title: お茶の話', new_string: 'title: 日本茶の話' }]
    });
    assert.equal(result.ok, true);
    assert.equal(state.row!.title, '日本茶の話');
});

test('Book: ページ単位なら他のページに同じ文字列があっても一意に扱う', () => {
    const result = applyEdits(BOOK, [{ old_string: 'りんごの話。', new_string: 'ぶどうの話。' }], { pageIndex: 2 });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.markdown, BOOK.replace('# 2ページ目\nりんごの話。', '# 2ページ目\nぶどうの話。'));
    // 本全体では 2 件一致なので失敗する
    const all = applyEdits(BOOK, [{ old_string: 'りんごの話。', new_string: 'ぶどうの話。' }]);
    assert.equal(all.ok, false);
});

test('Book: ページの外にある文字列は見つからない扱い、存在しないページはエラー', () => {
    const outside = applyEdits(BOOK, [{ old_string: 'みかんの話。', new_string: 'x' }], { pageIndex: 1 });
    assert.equal(outside.ok, false);
    if (!outside.ok) assert.equal(outside.errors[0].code, 'not_found');
    const missing = applyEdits(BOOK, [{ old_string: 'x', new_string: 'y' }], { pageIndex: 9 });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.errors[0].code, 'invalid_page');
    assert.equal(pageRanges(BOOK).length, 4); // frontmatter + 3 pages
    const frontmatter = applyEdits(BOOK, [{ old_string: 'title: 本', new_string: 'title: 果物の本' }], { pageIndex: 0 });
    assert.equal(frontmatter.ok, true);
});

test('差分が行単位で正しく生成される', () => {
    const before = 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj\n';
    const after = 'a\nb\nc\nd\nE\nf\ng\nh\ni\nj\nk\n';
    const diff = lineDiff(before, after);
    assert.equal(diff.added, 2);
    assert.equal(diff.removed, 1);
    assert.equal(diff.hunks.length, 1);
    assert.equal(diff.unified, [
        '@@ -2,9 +2,10 @@',
        ' b',
        ' c',
        ' d',
        '-e',
        '+E',
        ' f',
        ' g',
        ' h',
        ' i',
        ' j',
        '+k'
    ].join('\n'));
});

test('離れた変更は別の hunk になり、変更がなければ差分は空', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
    const changed = [...lines];
    changed[1] = 'LINE 2';
    changed[27] = 'LINE 28';
    const diff = lineDiff(lines.join('\n'), changed.join('\n'));
    assert.equal(diff.hunks.length, 2);
    assert.deepEqual(diff.hunks.map(h => [h.oldStart, h.newStart]), [[1, 1], [25, 25]]);
    assert.equal(lineDiff(CARD, CARD).unified, '');
    assert.equal(lineDiff(CARD, CARD).hunks.length, 0);
});

// Book.svelte（ビューアー）のページの分け方を再現する
function viewerPages(md: string): string[] {
    const body = md.trim().replace(/^---\s*([\s\S]*?)\s*---/, '').trim().replace(/<style>[\s\S]*?<\/style>/gi, '');
    return body.split(/(?:Page\s*\d+:|(?:^|\n)\s*\*\*\*\s*(?:\n|$))/i).map(p => p.trim()).filter(p => p.length > 0);
}

const PAGES3 = `---
id: b
title: T
play_mode: book
---

# P1
A

***

# P2
B

***

# P3
C
`;

function pageEdit(md: string, index: number, action: 'update' | 'delete' | 'insert', content: string): string {
    const result = applyPageEdit(md, index, action, content);
    assert.equal(result.ok, true, result.ok ? '' : result.error);
    return result.ok ? result.markdown : md;
}

test('edit_page: page_index 1 の更新は 1 ページ目だけを変える', () => {
    const md = pageEdit(PAGES3, 1, 'update', '# P1\nA-edited');
    assert.deepEqual(viewerPages(md), ['# P1\nA-edited', '# P2\nB', '# P3\nC']);
    assert.equal(md, PAGES3.replace('# P1\nA', '# P1\nA-edited'));
});

test('edit_page: page_index 1 の削除は 1 ページ目だけを消す（最後のページも同様）', () => {
    assert.deepEqual(viewerPages(pageEdit(PAGES3, 1, 'delete', '')), ['# P2\nB', '# P3\nC']);
    assert.deepEqual(viewerPages(pageEdit(PAGES3, 3, 'delete', '')), ['# P1\nA', '# P2\nB']);
    const last = pageEdit(PAGES3, 3, 'delete', '');
    assert.ok(!last.trimEnd().endsWith('***'));
});

test('edit_page: insert は指定ページの前に入り、ページ数 + 1 なら末尾に追加する', () => {
    assert.deepEqual(viewerPages(pageEdit(PAGES3, 2, 'insert', '# NEW')), ['# P1\nA', '# NEW', '# P2\nB', '# P3\nC']);
    assert.deepEqual(viewerPages(pageEdit(PAGES3, 4, 'insert', '# NEW')), ['# P1\nA', '# P2\nB', '# P3\nC', '# NEW']);
});

test('edit_page: page_index 0 はフロントマターだけを変え、本文は変えない', () => {
    const md = pageEdit(PAGES3, 0, 'update', 'id: b\ntitle: T2\nplay_mode: book');
    assert.match(md, /^---\nid: b\ntitle: T2\nplay_mode: book\n---\n/);
    assert.deepEqual(viewerPages(md), viewerPages(PAGES3));
    // AI が --- 付きで送ってきても二重にならない
    const withFences = pageEdit(PAGES3, 0, 'update', '---\nid: b\ntitle: T3\n---');
    assert.equal(withFences.match(/^---$/gm)?.length, 2);
});

test('edit_page: 範囲外のページ番号は何もせずエラーを返す', () => {
    assert.equal(applyPageEdit(PAGES3, 4, 'update', 'x').ok, false);
    assert.equal(applyPageEdit(PAGES3, 4, 'delete', '').ok, false);
    assert.equal(applyPageEdit(PAGES3, 5, 'insert', 'x').ok, false);
    assert.equal(applyPageEdit(PAGES3, 0, 'delete', '').ok, false);
});

test('空のページがある本でも、ページ番号がビューアーの表示と一致する', () => {
    // フロントマター直後の ***、連続した ***、style だけのページ
    const md = `---
id: b
play_mode: book
---

***

# P1
A

***

***

<style>.x { color: red; }</style>

***

# P2
B
`;
    // ビューアーは連続した *** の 2 本目を「***」というページとして表示する。番号はその表示と一致させる
    assert.deepEqual(viewerPages(md), ['# P1\nA', '***', '# P2\nB']);
    const ranges = pageRanges(md).slice(1);
    assert.deepEqual(ranges.map(r => md.slice(r.start, r.end).replace(/<style>[\s\S]*?<\/style>/gi, '').trim()), viewerPages(md));
    assert.deepEqual(viewerPages(pageEdit(md, 3, 'update', '# P2\nB-edited')), ['# P1\nA', '***', '# P2\nB-edited']);
    const edited = applyEdits(md, [{ old_string: 'A', new_string: 'A2' }], { pageIndex: 1 });
    assert.equal(edited.ok, true);
    if (edited.ok) assert.deepEqual(viewerPages(edited.markdown), ['# P1\nA2', '***', '# P2\nB']);
});

test('旧形式の "Page N:" ラベルの本も表示どおりに数える', () => {
    const md = `---
id: b
---
Page 1:
# P1
A
Page 2:
# P2
B
`;
    assert.deepEqual(viewerPages(md), ['# P1\nA', '# P2\nB']);
    assert.deepEqual(viewerPages(pageEdit(md, 1, 'update', '# P1\nA-edited')), ['# P1\nA-edited', '# P2\nB']);
});
