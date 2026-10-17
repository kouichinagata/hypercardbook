import type { SupabaseClient } from '@supabase/supabase-js';
import { applyEdits, lineDiff, validateEdits, type LineDiff, type MarkdownEdit, type MarkdownEditError } from '../markdown-edit.ts';
import { bookColumnsFromFrontmatter, isSameDocument, parseBookFrontmatter } from '../book-frontmatter.ts';
import { isMiniApp } from '../play-mode.ts';

// カード（books の 1 行）に部分置換編集を適用して保存する。
// AI のツール呼び出しからも、Skill のサンドボックス実行の結果からも、この関数を通す。

export interface MarkdownEditCommand {
    card_id: string;
    base_version: number;
    edits: MarkdownEdit[];
    /** Book のページ単位の編集（0 = フロントマター）。省略すると本文全体が対象 */
    page_index?: number;
}

export type MarkdownEditCommandResult =
    | { ok: true; card_id: string; version: number; markdown: string; diff: LineDiff }
    | { ok: false; code: 'invalid_command'; message: string }
    | { ok: false; code: 'not_found'; message: string }
    | { ok: false; code: 'conflict'; message: string; current_version: number | null }
    | { ok: false; code: 'edit_failed'; message: string; errors: MarkdownEditError[] }
    | { ok: false; code: 'db_error'; message: string };

export const CONFLICT_MESSAGE = '競合：最新の内容を読み直してください';

const FRONTMATTER_RE = /^---\s*[\s\S]*?\s*---/;

export async function applyMarkdownEditCommand(
    supabase: SupabaseClient,
    userId: string,
    command: MarkdownEditCommand
): Promise<MarkdownEditCommandResult> {
    const { card_id: cardId, base_version: baseVersion, edits, page_index: pageIndex } = command ?? ({} as MarkdownEditCommand);
    if (typeof cardId !== 'string' || !cardId) {
        return { ok: false, code: 'invalid_command', message: 'card_id is required.' };
    }
    if (!Number.isInteger(baseVersion)) {
        return { ok: false, code: 'invalid_command', message: 'base_version must be an integer.' };
    }
    const invalid = validateEdits(edits);
    if (invalid.length > 0) {
        return { ok: false, code: 'edit_failed', message: 'Invalid edits.', errors: invalid };
    }

    const { data: row, error: readError } = await supabase
        .from('books')
        .select('id, markdown_content, version')
        .eq('id', cardId)
        .eq('user_id', userId)
        .maybeSingle();
    if (readError) return { ok: false, code: 'db_error', message: readError.message };
    if (!row) return { ok: false, code: 'not_found', message: 'Card not found.' };
    if (row.version !== baseVersion) {
        return { ok: false, code: 'conflict', message: CONFLICT_MESSAGE, current_version: row.version ?? null };
    }

    const before: string = row.markdown_content || '';
    const applied = applyEdits(before, edits, { pageIndex });
    if (!applied.ok) {
        return { ok: false, code: 'edit_failed', message: 'No edits were applied. Fix the failing edits and try again.', errors: applied.errors };
    }
    // /api/save と同じく、MiniApp の id / play_mode が消える・変わる編集は保存しない
    if (isMiniApp(parseBookFrontmatter(before).playMode) && !isSameDocument(before, applied.markdown)) {
        return { ok: false, code: 'invalid_command', message: 'No edits were applied: a MiniApp must keep its id and play_mode.' };
    }

    const update: Record<string, unknown> = { markdown_content: applied.markdown, version: baseVersion + 1 };
    // フロントマターが変わったら、/api/save と同じく title などの列も合わせる
    const fmBefore = before.match(FRONTMATTER_RE)?.[0] ?? '';
    const fmAfter = applied.markdown.match(FRONTMATTER_RE)?.[0] ?? '';
    if (fmBefore !== fmAfter) {
        const fm = parseBookFrontmatter(applied.markdown);
        Object.assign(update, bookColumnsFromFrontmatter(fm));
        if (fm.slug) update.slug = fm.slug;
    }

    // version が読んだときのままの場合だけ書き込む 1 回の UPDATE。途中で他の保存が入っていれば 0 行になり、何も書かれない。
    const { data: saved, error: writeError } = await supabase
        .from('books')
        .update(update)
        .eq('id', cardId)
        .eq('user_id', userId)
        .eq('version', baseVersion)
        .select('version')
        .maybeSingle();
    if (writeError) return { ok: false, code: 'db_error', message: writeError.message };
    if (!saved) return { ok: false, code: 'conflict', message: CONFLICT_MESSAGE, current_version: null };

    return { ok: true, card_id: cardId, version: saved.version, markdown: applied.markdown, diff: lineDiff(before, applied.markdown) };
}
