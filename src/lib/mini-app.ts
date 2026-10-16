// Mini App = a Card with play_mode: miniapp, listed per user in `mini_apps` and embedded by PapeRobo in a sandboxed iframe.
const ORIGIN = 'https://www.hypercardbook.org';
export const MINI_APP_TITLE = 'Hello World';
export const MAX_MINI_APPS = 100;

export function newMiniAppSlug(random: () => string = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12)): string {
    return `miniapp-${random()}`;
}

export function helloWorldMiniAppMarkdown(slug: string, publishedAt: string): string {
    return `---
id: ${slug}
title: ${MINI_APP_TITLE}
play_mode: miniapp
theme_color: white
is_public: true
published_at: ${publishedAt}
---
# Hello World
`;
}

export function miniAppUrls(slug: string) {
    return {
        cardUrl: `${ORIGIN}/hypercard/${slug}`,
        editUrl: `${ORIGIN}/workspace?mode=card&id=${encodeURIComponent(slug)}`
    };
}

/** A book reference stored in mini_apps: a books.id (uuid) or books.slug. */
export function validMiniAppRef(ref: unknown): ref is string {
    return typeof ref === 'string' && /^[A-Za-z0-9._-]{1,200}$/.test(ref);
}

export function absoluteCoverImage(cover: string | null | undefined): string | null {
    if (!cover) return null;
    if (cover.startsWith('data:')) return null;
    if (cover.startsWith('/') && !cover.startsWith('//')) return `${ORIGIN}${cover}`;
    return /^https:\/\//i.test(cover) ? cover : null;
}

export function miniAppCardUrl(book: { slug?: string | null; id: string }): string {
    const key = (book.slug && validMiniAppRef(book.slug) ? book.slug : book.id);
    return `${ORIGIN}/hypercard/${key}`;
}
