// 本文の置き換えを受け入れてよいか判断する。AI の返信文（会話・表の区切り行 "---" など）が
// 本文として保存されたり、保存済みの Card / MiniApp の id・play_mode が変わったりするのを防ぐ。
import { isCardLike } from './play-mode.ts';

export interface FrontmatterIdentity {
    id: string;
    playMode: string;
}

/** 先頭が YAML フロントマターで、id と play_mode の両方があるときだけ値を返す（それ以外は null） */
export function readIdentity(markdown: string | undefined | null): FrontmatterIdentity | null {
    const m = (markdown || '').match(/^\s*---[ \t]*\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return null;
    let id = '';
    let playMode = '';
    for (const line of m[1].split('\n')) {
        if (/^\s/.test(line)) continue;
        const i = line.indexOf(':');
        if (i < 0) continue;
        const k = line.slice(0, i).trim();
        const v = line.slice(i + 1).trim();
        if (k === 'id') id = v;
        if (k === 'play_mode') playMode = v;
    }
    return id && playMode ? { id, playMode } : null;
}

export type AiReplaceVerdict = 'apply' | 'block' | 'ignore';

/**
 * AI が全文として返した markdown を、開いている本文に反映してよいか。
 * - apply : 反映する
 * - block : 別の Card として「新規保存」を案内する（開いている本文は変えない）
 * - ignore: 何もしない（フロントマターが無い・Book を別物に置き換える）
 */
export function judgeAiReplace(current: string, candidate: string, hasSavedId: boolean): AiReplaceVerdict {
    const next = readIdentity(candidate);
    if (!next) return 'ignore';
    if (!hasSavedId) return 'apply';
    const cur = readIdentity(current);
    if (cur && cur.id === next.id && cur.playMode === next.playMode) return 'apply';
    return isCardLike(next.playMode) ? 'block' : 'ignore';
}

/** 保存前の検査: 既存の play_mode が miniapp / 別の id から変わる保存は拒否する */
export function saveIdentityConflict(existing: { slug?: string | null; playMode?: string | null }, markdown: string): string | null {
    const next = readIdentity(markdown);
    if (existing.playMode === 'miniapp') {
        if (!next) return 'The new content has no frontmatter with id and play_mode; refusing to overwrite a miniapp.';
        if (next.playMode !== 'miniapp') return `play_mode would change from miniapp to ${next.playMode}.`;
        if (existing.slug && next.id.replace(/[^a-zA-Z0-9_\-]/g, '') !== existing.slug) return 'id would change.';
    }
    return null;
}
