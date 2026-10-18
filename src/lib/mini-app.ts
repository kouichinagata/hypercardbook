// Mini App = a Card with play_mode: miniapp, listed per user in `mini_apps` and embedded by PapeRobo in a sandboxed iframe.
// A new MiniApp is unlisted: anyone with its UUID link can use it, but it only appears on the public shelf once the author publishes it.
const ORIGIN = 'https://www.hypercardbook.org';
// In development the endpoints hand out the local origin so unreleased work is not shown on production.
export const MINI_APP_TITLE = 'Hello World';
export const MAX_MINI_APPS = 100;
// Standard MiniApps (books.id): shown first in every user's PapeRobo list, cannot be removed by users
export const STANDARD_MINI_APP_REFS: readonly string[] = [
    '50d2d3d1-30f9-4e2e-883d-1243be839389' // テトリス (miniapp-6762974123f8-)
];

export function newMiniAppSlug(random: () => string = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12)): string {
    return `miniapp-${random()}`;
}

export function helloWorldMiniAppMarkdown(slug: string): string {
    return `---
id: ${slug}
title: ${MINI_APP_TITLE}
play_mode: miniapp
theme_color: white
is_public: false
---
# Hello World
`;
}

export function miniAppUrls(bookId: string, origin: string = ORIGIN) {
    return {
        cardUrl: `${origin}/hypercard/${bookId}`,
        editUrl: `${origin}/workspace?mode=card&id=${encodeURIComponent(bookId)}`
    };
}

/** A book reference stored in mini_apps: a books.id (uuid) or books.slug. */
export function validMiniAppRef(ref: unknown): ref is string {
    return typeof ref === 'string' && /^[A-Za-z0-9._-]{1,200}$/.test(ref);
}

export function absoluteCoverImage(cover: string | null | undefined, origin: string = ORIGIN): string | null {
    if (!cover) return null;
    if (cover.startsWith('data:')) return null;
    if (cover.startsWith('/') && !cover.startsWith('//')) return `${origin}${cover}`;
    return /^https:\/\//i.test(cover) ? cover : null;
}

// Always the book UUID: unlisted MiniApps are only served by UUID.
export function miniAppCardUrl(book: { id: string }, origin: string = ORIGIN): string {
    return `${origin}/hypercard/${book.id}`;
}
