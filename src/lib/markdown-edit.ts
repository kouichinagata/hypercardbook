// Markdown の部分置換編集（Claude Code の Edit ツールと同じ考え方）。
// AI は本文全体を書き直さず、old_string → new_string の置換だけを返す。
// DB に触らない純粋関数だけを置く（サーバー・テスト・Skill 実行のどこからでも使える）。

export interface MarkdownEdit {
    old_string: string;
    new_string: string;
}

export type MarkdownEditErrorCode = 'invalid_edit' | 'empty_old_string' | 'no_change' | 'not_found' | 'ambiguous' | 'invalid_page';

export interface MarkdownEditError {
    /** 0 始まりの edits の位置 */
    index: number;
    code: MarkdownEditErrorCode;
    message: string;
    /** old_string の出現回数（not_found / ambiguous のとき） */
    count?: number;
}

export interface ApplyEditsOptions {
    /**
     * Book のページ番号（0 = YAML フロントマター、1 = フロントマター直後のページ、2 = 最初の "***" 行の次のページ …）。
     * 指定すると old_string はそのページの中だけで探す。省略すると本文全体が対象。
     */
    pageIndex?: number;
}

export type ApplyEditsResult =
    | { ok: true; markdown: string }
    | { ok: false; errors: MarkdownEditError[] };

export const MAX_EDITS_PER_COMMAND = 50;

const FRONTMATTER_RE = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?=\r?\n|$)/;
// Book.svelte（ビューアー）と同じページ区切り。"***" 行と、旧形式の "Page N:" ラベル
const PAGE_DELIMITER_RE = /(?:Page\s*\d+:|(?:^|\n)\s*\*\*\*\s*(?:\n|$))/gi;
// ビューアーはページを分ける前に <style> ブロックを取り除くので、style だけのページは数えない
const STYLE_BLOCK_RE = /<style>[\s\S]*?<\/style>/gi;

interface PageChunk {
    start: number;
    end: number;
    /** 前後の空白を除いた中身の範囲 */
    contentStart: number;
    contentEnd: number;
    empty: boolean;
}

/** フロントマターの後ろを区切り文字で分けた塊（空の塊も含む） */
function splitBody(markdown: string): { fmEnd: number; chunks: PageChunk[] } {
    const fm = markdown.match(FRONTMATTER_RE);
    const fmEnd = fm ? fm[0].length : 0;
    const body = markdown.slice(fmEnd);
    const bounds: { start: number; end: number }[] = [];
    let start = 0;
    PAGE_DELIMITER_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = PAGE_DELIMITER_RE.exec(body)) !== null) {
        bounds.push({ start, end: match.index });
        start = match.index + match[0].length;
        if (match[0].length === 0) PAGE_DELIMITER_RE.lastIndex++;
    }
    bounds.push({ start, end: body.length });

    const chunks = bounds.map(({ start, end }) => {
        const text = body.slice(start, end);
        const lead = text.length - text.trimStart().length;
        const trail = text.length - text.trimEnd().length;
        const empty = text.replace(STYLE_BLOCK_RE, '').trim() === '';
        return {
            start: fmEnd + start,
            end: fmEnd + end,
            contentStart: fmEnd + start + (empty && text.trim() === '' ? text.length : lead),
            contentEnd: fmEnd + end - (text.trim() === '' ? 0 : trail),
            empty
        };
    });
    return { fmEnd, chunks };
}

/**
 * ページの範囲（本文中の [start, end)）。0 はフロントマター（なければ空の範囲）、
 * 1 以降はビューアーに表示される順のページ（空のページは数えない）。
 */
export function pageRanges(markdown: string): { start: number; end: number }[] {
    const { fmEnd, chunks } = splitBody(markdown);
    return [{ start: 0, end: fmEnd }, ...chunks.filter(c => !c.empty).map(({ start, end }) => ({ start, end }))];
}

export type PageEditAction = 'update' | 'delete' | 'insert';

/**
 * ページ単位の編集（edit_page ツール）。page_index は pageRanges と同じ数え方。
 * - update: 0 ならフロントマター、1 以降はそのページの中身を差し替える（前後の空白は元のまま）
 * - delete: そのページと区切りの "***" を 1 本取り除く
 * - insert: page_index のページの前に新しいページを入れる。ページ数 + 1 なら末尾に追加
 * 番号が範囲外なら何もせずエラーを返す。
 */
export function applyPageEdit(
    markdown: string,
    pageIndex: number,
    action: PageEditAction,
    newContent: string
): { ok: true; markdown: string } | { ok: false; error: string } {
    if (!Number.isInteger(pageIndex) || pageIndex < 0) return { ok: false, error: 'page_index must be an integer >= 0.' };
    if (action !== 'update' && action !== 'delete' && action !== 'insert') {
        return { ok: false, error: 'action must be "update", "delete", or "insert".' };
    }
    const content = (newContent ?? '').trim();
    const { fmEnd, chunks } = splitBody(markdown);
    const pages = chunks.filter(c => !c.empty);
    const count = pages.length;

    if (pageIndex === 0) {
        if (action !== 'update') return { ok: false, error: 'Page 0 is the frontmatter; only "update" is allowed.' };
        const yaml = content.replace(/^---[ \t]*\r?\n/, '').replace(/\r?\n---[ \t]*$/, '').trim();
        if (!yaml) return { ok: false, error: 'new_content must not be empty.' };
        const fm = `---\n${yaml}\n---`;
        return { ok: true, markdown: fmEnd > 0 ? fm + markdown.slice(fmEnd) : `${fm}\n\n${markdown}` };
    }

    if (action === 'insert') {
        if (!content) return { ok: false, error: 'new_content must not be empty.' };
        if (pageIndex > count + 1) return { ok: false, error: `Cannot insert at page ${pageIndex}: the book has ${count} page(s). Use 1..${count + 1}.` };
        if (pageIndex <= count) {
            const at = pages[pageIndex - 1].contentStart;
            return { ok: true, markdown: markdown.slice(0, at) + `${content}\n\n***\n\n` + markdown.slice(at) };
        }
        if (count === 0) return { ok: true, markdown: `${markdown.trimEnd()}\n\n${content}\n` };
        const at = pages[count - 1].contentEnd;
        return { ok: true, markdown: markdown.slice(0, at) + `\n\n***\n\n${content}` + markdown.slice(at) };
    }

    if (pageIndex > count) return { ok: false, error: `Page ${pageIndex} does not exist: the book has ${count} page(s).` };
    const page = pages[pageIndex - 1];

    if (action === 'update') {
        if (!content) return { ok: false, error: 'new_content must not be empty. Use action "delete" to remove a page.' };
        return { ok: true, markdown: markdown.slice(0, page.contentStart) + content + markdown.slice(page.contentEnd) };
    }

    // delete: 次のページの中身の手前まで（最後のページなら前のページの中身の直後から）取り除く
    const chunkIndex = chunks.indexOf(page);
    const next = chunks[chunkIndex + 1];
    if (next) return { ok: true, markdown: markdown.slice(0, page.contentStart) + markdown.slice(next.contentStart) };
    const prev = chunks[chunkIndex - 1];
    if (prev) return { ok: true, markdown: markdown.slice(0, prev.contentEnd) + markdown.slice(page.contentEnd) };
    return { ok: true, markdown: markdown.slice(0, page.contentStart) + markdown.slice(page.contentEnd) };
}

/** 重なりも含めて出現位置を数える（一意判定を厳しめにするため） */
function findOccurrences(haystack: string, needle: string): number[] {
    const positions: number[] = [];
    let from = 0;
    while (true) {
        const at = haystack.indexOf(needle, from);
        if (at === -1) break;
        positions.push(at);
        from = at + 1;
    }
    return positions;
}

/** edits の形をチェックする（AI やスクリプトから来た値をそのまま信用しない） */
export function validateEdits(edits: unknown): MarkdownEditError[] {
    if (!Array.isArray(edits) || edits.length === 0) {
        return [{ index: -1, code: 'invalid_edit', message: 'edits must be a non-empty array.' }];
    }
    if (edits.length > MAX_EDITS_PER_COMMAND) {
        return [{ index: -1, code: 'invalid_edit', message: `Too many edits (max ${MAX_EDITS_PER_COMMAND}).` }];
    }
    const errors: MarkdownEditError[] = [];
    edits.forEach((edit: any, index) => {
        if (!edit || typeof edit.old_string !== 'string' || typeof edit.new_string !== 'string') {
            errors.push({ index, code: 'invalid_edit', message: `Edit #${index + 1}: old_string and new_string must be strings.` });
        } else if (edit.old_string === '') {
            errors.push({ index, code: 'empty_old_string', message: `Edit #${index + 1}: old_string must not be empty.` });
        } else if (edit.old_string === edit.new_string) {
            errors.push({ index, code: 'no_change', message: `Edit #${index + 1}: old_string and new_string are identical.` });
        }
    });
    return errors;
}

/**
 * edits を先頭から順に適用する。1 件でも失敗したら元の本文は返さず、失敗の一覧だけを返す（部分適用はしない）。
 * 失敗した edit は飛ばして残りも判定するので、AI は一度にすべての誤りを直せる。
 */
export function applyEdits(markdown: string, edits: MarkdownEdit[], options: ApplyEditsOptions = {}): ApplyEditsResult {
    const invalid = validateEdits(edits);
    if (invalid.length > 0) return { ok: false, errors: invalid };

    const { pageIndex } = options;
    if (pageIndex !== undefined && (!Number.isInteger(pageIndex) || pageIndex < 0)) {
        return { ok: false, errors: [{ index: -1, code: 'invalid_page', message: 'page_index must be an integer >= 0.' }] };
    }

    let current = markdown;
    const errors: MarkdownEditError[] = [];
    edits.forEach((edit, index) => {
        let start = 0;
        let end = current.length;
        if (pageIndex !== undefined) {
            const ranges = pageRanges(current);
            if (pageIndex >= ranges.length || (pageIndex === 0 && ranges[0].end === 0)) {
                const pageCount = ranges.length - 1;
                errors.push({
                    index,
                    code: 'invalid_page',
                    message: pageIndex === 0
                        ? `Edit #${index + 1}: this document has no YAML frontmatter (page 0).`
                        : `Edit #${index + 1}: page ${pageIndex} does not exist (the document has ${pageCount} page(s)).`
                });
                return;
            }
            ({ start, end } = ranges[pageIndex]);
        }

        const where = pageIndex === undefined ? 'the document' : pageIndex === 0 ? 'the frontmatter (page 0)' : `page ${pageIndex}`;
        const positions = findOccurrences(current.slice(start, end), edit.old_string);
        if (positions.length === 0) {
            errors.push({
                index,
                code: 'not_found',
                count: 0,
                message: `Edit #${index + 1}: old_string was not found in ${where}. Copy the exact current text (including spaces, line breaks and Markdown symbols).`
            });
            return;
        }
        if (positions.length > 1) {
            errors.push({
                index,
                code: 'ambiguous',
                count: positions.length,
                message: `Edit #${index + 1}: old_string appears ${positions.length} times in ${where}. Include more surrounding text so it matches exactly once.`
            });
            return;
        }
        const at = start + positions[0];
        current = current.slice(0, at) + edit.new_string + current.slice(at + edit.old_string.length);
    });

    if (errors.length > 0) return { ok: false, errors };
    return { ok: true, markdown: current };
}

// ---------------------------------------------------------------------------
// 行単位の差分（ライブラリを入れず、最小限の LCS で作る）

export interface DiffLine {
    type: ' ' | '-' | '+';
    text: string;
}

export interface DiffHunk {
    /** 1 始まりの行番号 */
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: DiffLine[];
}

export interface LineDiff {
    added: number;
    removed: number;
    hunks: DiffHunk[];
    /** unified diff 形式のテキスト（ヘッダーなし） */
    unified: string;
}

// LCS の表の大きさの上限。超えたら差分の中央部分を「全削除＋全追加」として扱う。
const LCS_CELL_LIMIT = 4_000_000;

function splitLines(text: string): string[] {
    if (text === '') return [];
    const lines = text.split(/\r?\n/);
    if (lines.at(-1) === '') lines.pop();
    return lines;
}

function diffOps(a: string[], b: string[]): DiffLine[] {
    // 共通の先頭・末尾を除いて、変わった中央部分だけ LCS を取る（部分編集では中央部分が小さい）
    let prefix = 0;
    while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
    let suffix = 0;
    while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;

    const midA = a.slice(prefix, a.length - suffix);
    const midB = b.slice(prefix, b.length - suffix);
    const ops: DiffLine[] = a.slice(0, prefix).map(text => ({ type: ' ', text }));

    if (midA.length * midB.length > LCS_CELL_LIMIT) {
        ops.push(...midA.map(text => ({ type: '-' as const, text })), ...midB.map(text => ({ type: '+' as const, text })));
    } else {
        const n = midA.length;
        const m = midB.length;
        // lcs[i][j] = midA[i..] と midB[j..] の LCS の長さ
        const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
        for (let i = n - 1; i >= 0; i--) {
            for (let j = m - 1; j >= 0; j--) {
                lcs[i][j] = midA[i] === midB[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
            }
        }
        let i = 0;
        let j = 0;
        while (i < n && j < m) {
            if (midA[i] === midB[j]) {
                ops.push({ type: ' ', text: midA[i] });
                i++;
                j++;
            } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
                ops.push({ type: '-', text: midA[i++] });
            } else {
                ops.push({ type: '+', text: midB[j++] });
            }
        }
        while (i < n) ops.push({ type: '-', text: midA[i++] });
        while (j < m) ops.push({ type: '+', text: midB[j++] });
    }

    ops.push(...a.slice(a.length - suffix).map(text => ({ type: ' ' as const, text })));
    return ops;
}

/** 変更前後の行単位の差分。変更箇所の前後 context 行を含む hunk にまとめる。 */
export function lineDiff(before: string, after: string, context = 3): LineDiff {
    const ops = diffOps(splitLines(before), splitLines(after));
    const added = ops.filter(op => op.type === '+').length;
    const removed = ops.filter(op => op.type === '-').length;

    const hunks: DiffHunk[] = [];
    let oldLine = 1;
    let newLine = 1;
    // 各 op の位置での行番号を先に計算しておく
    const positions = ops.map(op => {
        const pos = { oldLine, newLine };
        if (op.type !== '+') oldLine++;
        if (op.type !== '-') newLine++;
        return pos;
    });

    let k = 0;
    while (k < ops.length) {
        if (ops[k].type === ' ') {
            k++;
            continue;
        }
        const from = Math.max(0, k - context);
        let to = k;
        // 次の変更が context*2 行以内なら同じ hunk にまとめる
        while (to < ops.length) {
            if (ops[to].type !== ' ') {
                to++;
                continue;
            }
            let next = to;
            while (next < ops.length && ops[next].type === ' ') next++;
            if (next < ops.length && next - to <= context * 2) {
                to = next;
            } else {
                to = Math.min(ops.length, to + context);
                break;
            }
        }
        const lines = ops.slice(from, to);
        hunks.push({
            oldStart: positions[from].oldLine,
            oldLines: lines.filter(op => op.type !== '+').length,
            newStart: positions[from].newLine,
            newLines: lines.filter(op => op.type !== '-').length,
            lines
        });
        k = to;
    }

    const unified = hunks
        .map(h => [`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`, ...h.lines.map(l => `${l.type}${l.text}`)].join('\n'))
        .join('\n');
    return { added, removed, hunks, unified };
}
