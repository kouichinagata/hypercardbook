// An unlisted MiniApp is not public (not on the shelf or in search) but anyone who knows its link can use it.
// It is only served when addressed by its book UUID (unguessable), never by a slug that the author may have chosen freely.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isBookUuid(id: string): boolean {
    return UUID.test(id);
}

export function servesUnlistedMiniApp(id: string, playMode: string | undefined | null): boolean {
    return isBookUuid(id) && playMode === 'miniapp';
}
