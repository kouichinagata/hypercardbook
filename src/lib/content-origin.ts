// Content domain: Book/Card/MiniApp scripts run as the page, so content that anyone can open is served from
// markdown.hypercardbook.org, which has no sign-in, cookies or stored API keys. www keeps the editor and accounts.
// Existing content stays on www (mostly our own); the standard MiniApps and everything created from the cutover move.
// In development, http://markdown.localhost:<port> stands in for the markdown domain.
import { parseBookFrontmatter } from './book-frontmatter.ts';
import { STANDARD_MINI_APP_REFS } from './mini-app.ts';

export const WWW_ORIGIN = 'https://www.hypercardbook.org';
export const MARKDOWN_ORIGIN = 'https://markdown.hypercardbook.org';
const MARKDOWN_HOST = 'markdown.hypercardbook.org';
const DEV_MARKDOWN_HOST = 'markdown.localhost';
// 2026-10-18 19:30 JST, when markdown.hypercardbook.org went live
export const MARKDOWN_CUTOVER = '2026-10-18T10:30:00Z';
// Existing content moved to the markdown domain (books.id)
export const MOVED_TO_MARKDOWN: readonly string[] = [...STANDARD_MINI_APP_REFS];

export type ContentRow = { id: string; created_at?: string | null; is_public?: boolean | null; markdown_content?: string | null };

export function isMarkdownHost(hostname: string, dev = false): boolean {
    return hostname === (dev ? DEV_MARKDOWN_HOST : MARKDOWN_HOST);
}

/** www and markdown origins for this deployment; development keeps the dev server's port. */
export function contentOrigins(url: URL, dev = false): { www: string; markdown: string } {
    if (!dev) return { www: WWW_ORIGIN, markdown: MARKDOWN_ORIGIN };
    const port = url.port ? `:${url.port}` : '';
    return { www: `${url.protocol}//localhost${port}`, markdown: `${url.protocol}//${DEV_MARKDOWN_HOST}${port}` };
}

/**
 * Moved content, and content created from the cutover that can be opened without signing in
 * (public, or a MiniApp, which is served by its UUID link). Private content stays on www, where only its owner can open it.
 */
export function servedOnMarkdown(row: ContentRow, miniApp?: boolean): boolean {
    if (MOVED_TO_MARKDOWN.includes(row.id)) return true;
    const created = Date.parse(row.created_at || '');
    if (!Number.isFinite(created) || created < Date.parse(MARKDOWN_CUTOVER)) return false;
    return Boolean(row.is_public) || (miniApp ?? parseBookFrontmatter(row.markdown_content || '').playMode === 'miniapp');
}

/**
 * Where a viewer request for this content belongs, or null when it is already there.
 * The trailing '#' drops any fragment, so sign-in tokens some www pages put there never reach the markdown domain.
 */
export function viewerRedirect(url: URL, onMarkdown: boolean, dev = false): string | null {
    const origins = contentOrigins(url, dev);
    const here = isMarkdownHost(url.hostname, dev);
    if (onMarkdown === here) return null;
    return `${onMarkdown ? origins.markdown : origins.www}${url.pathname}${url.search}#`;
}
