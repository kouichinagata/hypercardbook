// Live progress lines for /api/generate (shared by the server and the browser).
// The server sends "[STATUS]text[/STATUS]" inside the plain-text stream; the browser removes the markers
// before any parsing, so a status line never becomes part of the chat text or the saved history.
export const STATUS_OPEN = '[STATUS]';
export const STATUS_CLOSE = '[/STATUS]';

/** Server side: one status frame. An empty text clears the current status. */
export function statusFrame(text: string): string {
    return `${STATUS_OPEN}${text.replace(/\[\/?STATUS\]/g, '').replace(/\s+/g, ' ').trim()}${STATUS_CLOSE}`;
}

export type StatusPart = { kind: 'text'; value: string } | { kind: 'status'; value: string };

/**
 * Browser side: split buffered stream text into plain text and status updates, in order.
 * `rest` is a tail that may be the start of a marker split across chunks; prepend it to the next chunk.
 * At the end of the stream, treat any remaining `rest` as plain text.
 */
export function splitStatusStream(buffer: string): { parts: StatusPart[]; rest: string } {
    const parts: StatusPart[] = [];
    let cursor = 0;
    while (cursor < buffer.length) {
        const open = buffer.indexOf(STATUS_OPEN, cursor);
        if (open === -1) {
            const tail = buffer.slice(cursor);
            const held = partialOpenLength(tail);
            const text = tail.slice(0, tail.length - held);
            if (text) parts.push({ kind: 'text', value: text });
            return { parts, rest: tail.slice(tail.length - held) };
        }
        if (open > cursor) parts.push({ kind: 'text', value: buffer.slice(cursor, open) });
        const close = buffer.indexOf(STATUS_CLOSE, open + STATUS_OPEN.length);
        if (close === -1) return { parts, rest: buffer.slice(open) };
        parts.push({ kind: 'status', value: buffer.slice(open + STATUS_OPEN.length, close).trim() });
        cursor = close + STATUS_CLOSE.length;
    }
    return { parts, rest: '' };
}

/** Length of the longest tail of `text` that is a proper prefix of STATUS_OPEN. */
function partialOpenLength(text: string): number {
    for (let length = Math.min(STATUS_OPEN.length - 1, text.length); length > 0; length--) {
        if (STATUS_OPEN.startsWith(text.slice(text.length - length))) return length;
    }
    return 0;
}

/** "2400" -> "2.4k" */
export function formatCount(value: number): string {
    return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}
