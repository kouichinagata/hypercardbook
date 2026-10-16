// MiniApp is its own play_mode, but it is opened, edited and saved like a Card.
export const PLAY_MODE_MINIAPP = 'miniapp';

/** Card and MiniApp share the Card viewer and Card workspace. */
export function isCardLike(playMode: string | undefined | null): boolean {
    return playMode === 'card' || playMode === PLAY_MODE_MINIAPP;
}

export function isMiniApp(playMode: string | undefined | null): boolean {
    return playMode === PLAY_MODE_MINIAPP;
}

/** True when the markdown frontmatter declares `play_mode: card` or `play_mode: miniapp`. */
export function isCardMarkdown(markdown: string | undefined | null): boolean {
    const text = markdown || '';
    return text.includes('play_mode: card') || text.includes(`play_mode: ${PLAY_MODE_MINIAPP}`);
}
