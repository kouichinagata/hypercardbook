// A book id is a UUID; anything else is a slug the author chose.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isBookUuid(id: string): boolean {
    return UUID.test(id);
}
