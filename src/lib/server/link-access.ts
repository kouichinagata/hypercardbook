import { isBookUuid } from '../unlisted-mini-app.ts';

/** Link-shared books by UUID only (slugs are guessable), read with the server key. RLS is not widened, so they cannot be listed. */
export async function linkSharedBooks(ids: string[], columns: string): Promise<any[]> {
    const uuids = ids.filter(isBookUuid);
    if (!uuids.length) return [];
    // Loaded here so that modules importing this file stay free of SvelteKit-only imports (node tests)
    const { documentClient } = await import('./paperoboDocuments');
    const { data } = await documentClient().from('books').select(columns).in('id', uuids).eq('link_access', true);
    return (data as any[] | null) || [];
}

/** Adds to `found` the link-shared books that RLS hid from the caller */
export async function addLinkShared(found: any[], refs: string[], columns: string): Promise<void> {
    const missing = refs.filter((ref) => isBookUuid(ref) && !found.some((b) => b.id === ref));
    if (missing.length) found.push(...(await linkSharedBooks(missing, columns)));
}
