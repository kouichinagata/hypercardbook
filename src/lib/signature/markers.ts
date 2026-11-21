// Signature slots in Markdown. Each comes in two versions (my = the owner's, your = the other person's, plain = anyone's):
//   {{MarkdownAIverifyConfirm}} / {{myMarkdownAIverifyConfirm}} / {{your MarkdownAIverifyConfirm}}
//       Signed once: the marker becomes a signed image. When the last one is signed the document is complete and recorded (Verify).
//   {{MarkdownAIverify}} / {{myMarkdownAIverify}} / {{your MarkdownAIverify}}
//       Can be signed again any number of times: the image URL is kept in the marker, {{MarkdownAIverify=https://…/signature.webp}}.
//       It never counts toward completion.
export type SignKind = 'any' | 'my' | 'your';

const MARKER = /\{\{\s*(myMarkdownAIverifyConfirm|your\s*MarkdownAIverifyConfirm|MarkdownAIverifyConfirm)\s*\}\}/g;
const CHANGEABLE = /\{\{\s*(myMarkdownAIverify|your\s*MarkdownAIverify|MarkdownAIverify)(?:\s*=\s*(https?:\/\/[^\s{}()]+))?\s*\}\}/g;
// Fenced code blocks and inline code are never slots
const CODE = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g;

function kindOf(name: string): SignKind {
    if (name.startsWith('my')) return 'my';
    if (name.startsWith('your')) return 'your';
    return 'any';
}

/** Replace each unsigned Confirm slot (numbered in order of appearance) with the text returned by `render`. */
export function replaceSignMarkers(markdown: string, render: (slot: number, kind: SignKind, raw: string) => string): string {
    let slot = 0;
    return markdown
        .split(CODE)
        .map((part, i) => (i % 2 === 1 ? part : part.replace(MARKER, (raw, name: string) => render(slot++, kindOf(name), raw))))
        .join('');
}

// A signed slot is a plain Markdown image: ![MarkdownAIverify:my](https://…/signature.webp)
const SIGNED = /!\[MarkdownAIverify:(?:my|your|any)\]\((https?:\/\/[^\s()]+)\)/g;

export function signedImageMarkdown(kind: SignKind, url: string): string {
    return `![MarkdownAIverify:${kind}](${url})`;
}

/** Replace each signed slot with the text returned by `render(url)`. */
export function replaceSignedImages(markdown: string, render: (url: string) => string): string {
    return markdown
        .split(CODE)
        .map((part, i) => (i % 2 === 1 ? part : part.replace(SIGNED, (_m, url: string) => render(url))))
        .join('');
}

/** The document is complete when it has Confirm signatures and no unsigned Confirm slot is left. */
export const isComplete = (markdown: string) => signSlotKinds(markdown).length === 0 && replaceSignedImages(markdown, () => '\0').includes('\0');

/** Kinds of the unsigned Confirm slots in order of appearance */
export function signSlotKinds(markdown: string): SignKind[] {
    const kinds: SignKind[] = [];
    replaceSignMarkers(markdown, (_slot, kind) => (kinds.push(kind), ''));
    return kinds;
}

export function hasSignMarkers(markdown: string): boolean {
    return signSlotKinds(markdown).length > 0;
}

/** Replace the `slot`-th unsigned marker with a signed image link; null when the slot does not exist or is not `kind`. */
export function signSlotInMarkdown(markdown: string, slot: number, kind: SignKind, url: string): string | null {
    let done = false;
    const next = replaceSignMarkers(markdown, (n, k, raw) => {
        if (n !== slot || k !== kind) return raw;
        done = true;
        return signedImageMarkdown(kind, url);
    });
    return done ? next : null;
}

/** Guests (no login) may sign `your` and `any` slots, never `my` */
export function guestMaySign(kind: SignKind): boolean {
    return kind !== 'my';
}

// A stamp pressed before the signature (stamp + sign mode) is a plain Markdown image placed just before its slot's marker:
//   ![MarkdownAIverify:stamp](https://…/stamp.webp) {{MarkdownAIverifyConfirm}}
// It is not a signed slot: the slot stays open until it is signed (or, in stamp-only mode, it is stamped as a whole).
const STAMPED = /!\[MarkdownAIverify:stamp\]\((https?:\/\/[^\s()]+)\)/g;

export function stampImageMarkdown(url: string): string {
    return `![MarkdownAIverify:stamp](${url})`;
}

/** Replace each stamp image with the text returned by `render(url)`. */
export function replaceStampImages(markdown: string, render: (url: string) => string): string {
    return markdown
        .split(CODE)
        .map((part, i) => (i % 2 === 1 ? part : part.replace(STAMPED, (_m, url: string) => render(url))))
        .join('');
}

/** Insert a stamp image (after the stamps already there) just before the `slot`-th unsigned marker; null when the slot does not exist. */
export function stampSlotInMarkdown(markdown: string, slot: number, url: string): string | null {
    let done = false;
    const next = replaceSignMarkers(markdown, (n, _kind, raw) => {
        if (n !== slot) return raw;
        done = true;
        return `${stampImageMarkdown(url)} ${raw}`;
    });
    return done ? next : null;
}

const ANY_IMAGE = /!\[MarkdownAIverify:(?:my|your|any|stamp)\]\((https?:\/\/[^\s()]+)\)/g;

/** URLs of every signed or stamped image, in order of appearance */
export function signatureImageUrls(markdown: string): string[] {
    const urls: string[] = [];
    markdown.split(CODE).forEach((part, i) => {
        if (i % 2 === 1) return;
        for (const m of part.matchAll(ANY_IMAGE)) urls.push(m[1]);
    });
    return urls;
}

/** The first unsigned slot that `mayFill` accepts (a stamp goes top to bottom, one slot at a time) */
export function nextStampSlot(markdown: string, mayFill: (kind: SignKind) => boolean): { slot: number; kind: SignKind } | null {
    const kinds = signSlotKinds(markdown);
    const slot = kinds.findIndex(mayFill);
    return slot < 0 ? null : { slot, kind: kinds[slot] };
}

/** Replace each changeable slot (numbered in order of appearance) with the text returned by `render`; `url` is null until it is signed. */
export function replaceChangeableSigns(markdown: string, render: (slot: number, kind: SignKind, url: string | null, raw: string) => string): string {
    let slot = 0;
    return markdown
        .split(CODE)
        .map((part, i) => (i % 2 === 1 ? part : part.replace(CHANGEABLE, (raw, name: string, url: string | undefined) => render(slot++, kindOf(name), url ?? null, raw))))
        .join('');
}

/** Kinds of the changeable slots in order of appearance */
export function changeableSignKinds(markdown: string): SignKind[] {
    const kinds: SignKind[] = [];
    replaceChangeableSigns(markdown, (_slot, kind) => (kinds.push(kind), ''));
    return kinds;
}

const MARKER_NAME: Record<SignKind, string> = { any: 'MarkdownAIverify', my: 'myMarkdownAIverify', your: 'your MarkdownAIverify' };

/** Sign (or sign again) the `slot`-th changeable slot; null when the slot does not exist or is not `kind`. */
export function signChangeableInMarkdown(markdown: string, slot: number, kind: SignKind, url: string): string | null {
    let done = false;
    const next = replaceChangeableSigns(markdown, (n, k, _url, raw) => {
        if (n !== slot || k !== kind) return raw;
        done = true;
        return `{{${MARKER_NAME[kind]}=${url}}}`;
    });
    return done ? next : null;
}
