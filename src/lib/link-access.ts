// "Anyone with the link": not listed on the bookshelf, but opened by its UUID URL.
export type ShareMode = 'private' | 'link' | 'public';

export function shareModeOf(isPublic: boolean, linkAccess: boolean): ShareMode {
    return isPublic ? 'public' : linkAccess ? 'link' : 'private';
}

/** Contracts, signed copies and certificates carry personal data: they are never shared by link */
export function canShareByLink(markdown: string): boolean {
    const fm = markdown.match(/^---\s*([\s\S]*?)\s*---/)?.[1] || '';
    return !/^(contract_source_id|certificate_issuance_id):/m.test(fm);
}
