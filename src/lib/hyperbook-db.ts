// HyperBook as a database: pages are separated by a `***` line.
//
// Free layout (default): each page has its own MarkdownAI fields, numbered on the whole Markdown like a Card.
// Template (`db_mode: template`): page 1 defines the fields. The lines of page 1 that hold a changeable field
// (with their labels) are the layout shown on every page. A page keeps its own values as bare markers at its end
// ({{MarkdownAIinput=Taro}}), matched to page 1's fields by kind, input format and order.
//
// fieldView() gives the Markdown with every page's layout filled in: Card, Book and the server number and set
// fields on it as usual. fieldStore() writes a changed view back in the stored form.
import { parseBookFrontmatter } from './book-frontmatter.ts';
import { isCardMarkdown } from './play-mode.ts';
import { replaceFieldMarkers, scanFields, setFieldInMarkdown, type FieldMarker, type FieldValue } from './signature/fields.ts';

const FRONTMATTER = /^---\s*\n[\s\S]*?\n---[ \t]*(?:\r?\n|$)/;
const SEPARATOR = /^[ \t]*\*\*\*[ \t]*\r?$/;
const FENCE = /^[ \t]*(```|~~~)/;

type Split = { head: string; raw: string[]; seps: string[] };

/** The frontmatter, the text between separator lines (exactly as written), and the separator lines */
function split(markdown: string): Split {
    const head = markdown.match(FRONTMATTER)?.[0] ?? '';
    const lines = markdown.slice(head.length).split('\n');
    const raw: string[] = [];
    const seps: string[] = [];
    let current: string[] = [];
    let fence: string | null = null;
    for (const line of lines) {
        const f = line.match(FENCE)?.[1];
        if (f && (fence === null || fence === f)) fence = fence === null ? f : null;
        if (fence === null && !f && SEPARATOR.test(line)) {
            raw.push(current.join('\n'));
            seps.push(line);
            current = [];
        } else current.push(line);
    }
    raw.push(current.join('\n'));
    return { head, raw, seps };
}

function join(s: Split): string {
    let out = s.head + s.raw[0];
    for (let i = 1; i < s.raw.length; i++) out += '\n' + s.seps[i - 1] + '\n' + s.raw[i];
    return out;
}

const blank = (text: string) => text.trim() === '';

/** True for a HyperBook (not a Card / MiniApp) with `db_mode: template` */
export function isTemplateDb(markdown: string): boolean {
    return !isCardMarkdown(markdown) && parseBookFrontmatter(markdown).dbMode === 'template';
}

/** Which pieces of text count as pages: in a template every one but an empty last one; in free layout the non-empty ones (as Book shows them) */
function pageIndexes(s: Split, template: boolean): number[] {
    const all = s.raw.map((_, i) => i);
    if (!template) return all.filter((i) => !blank(s.raw[i]));
    if (s.raw.length === 1) return blank(s.raw[0]) ? [] : [0];
    return blank(s.raw[s.raw.length - 1]) ? all.slice(0, -1) : all;
}

const argOf = (raw: string) => raw.match(/^\{\{\s*MarkdownAI[a-z]+(?:Confirm)?\s*:\s*([^\s{}=]+)/)?.[1];

/** Fields are matched by kind and input format: input / input:date / input:XXX / check / radio / slider:0,100 / select. A button keeps nothing. */
export function fieldKey(f: FieldMarker): string | null {
    if (f.confirm || f.kind === 'button') return null;
    if (f.kind === 'input') {
        const arg = argOf(f.raw);
        return arg ? `input:${arg}` : 'input';
    }
    if (f.kind === 'slider') return `slider:${f.range!.min},${f.range!.max}`;
    return f.kind;
}

/** A field as defined, without a value */
function bareMarker(f: FieldMarker): string {
    if (f.kind === 'select') return f.raw.replace(/[ \t]*=[ \t]*x[ \t]*(?=\r?$)/gm, '');
    if (f.kind === 'slider') return `{{MarkdownAIslider:${f.range!.min},${f.range!.max}}}`;
    if (f.kind === 'button') return f.raw;
    const arg = argOf(f.raw);
    if (f.kind === 'input') return arg ? `{{MarkdownAIinput:${arg}}}` : '{{MarkdownAIinput}}';
    return `{{MarkdownAI${f.kind}${arg === 'x' ? ':x' : ''}}}`;
}

/** Line numbers covered by the given fields (a select block covers several lines) */
function coveredLines(fields: FieldMarker[]): Set<number> {
    const lines = new Set<number>();
    for (const f of fields) {
        const last = f.line + (f.raw.match(/\n/g)?.length ?? 0);
        for (let n = f.line; n <= last; n++) lines.add(n);
    }
    return lines;
}

const changeable = (f: FieldMarker) => !f.confirm;

/** The text of a page without the lines that hold a changeable field (in a stored page those are its values) */
function ownText(page: string): string {
    const covered = coveredLines(scanFields(page).filter(changeable));
    return page
        .split('\n')
        .filter((_, n) => !covered.has(n))
        .join('\n')
        .trim();
}

/** Page 1's lines holding a changeable field, without values; null when page 1 has none */
function layoutOf(page1: string): string | null {
    const fields = scanFields(page1).filter(changeable);
    if (!fields.length) return null;
    const lines = page1.split('\n');
    const picked = [...coveredLines(fields)].sort((a, b) => a - b);
    const out: string[] = [];
    picked.forEach((n, i) => {
        // A gap in page 1 stays a gap, so separate radio groups and paragraphs stay apart
        if (i > 0 && n - picked[i - 1] > 1) out.push('');
        out.push(lines[n]);
    });
    return replaceFieldMarkers(out.join('\n'), (f) => (f.confirm ? f.raw : bareMarker(f)));
}

/** A stored page shown with the layout: its own text, then the layout filled with its values */
function expandPage(page: string, layout: string): string {
    const queues = new Map<string, string[]>();
    for (const f of scanFields(page)) {
        const key = fieldKey(f);
        if (key) queues.set(key, [...(queues.get(key) ?? []), f.raw]);
    }
    const filled = replaceFieldMarkers(layout, (f) => {
        const key = fieldKey(f);
        return (key && queues.get(key)?.shift()) || f.raw;
    });
    const own = ownText(page);
    return `\n${own ? own + '\n\n' : ''}${filled}\n`;
}

/** A shown page back in the stored form: its own text, then each field's marker with its value */
function storePage(page: string): string {
    const values = scanFields(page)
        .filter((f) => fieldKey(f) !== null)
        .map((f) => f.raw);
    return `\n${[ownText(page), ...values].filter(Boolean).join('\n\n')}\n`;
}

/** The Markdown the fields are numbered and set on (unchanged unless it is a template DB) */
export function fieldView(markdown: string): string {
    if (!isTemplateDb(markdown)) return markdown;
    const s = split(markdown);
    const pages = pageIndexes(s, true);
    const layout = pages.length > 1 ? layoutOf(s.raw[pages[0]]) : null;
    if (!layout) return markdown;
    for (const i of pages.slice(1)) s.raw[i] = expandPage(s.raw[i], layout);
    return join(s);
}

/**
 * The stored form of a changed view (see fieldView). Pages whose fields did not change are kept exactly as stored.
 * Null when `view` is not a view of `before` (its pages differ).
 */
export function fieldStore(before: string, view: string): string | null {
    if (!isTemplateDb(before) || view === before) return view;
    const b = split(before);
    const v = split(view);
    const shown = split(fieldView(before));
    if (v.raw.length !== b.raw.length) return null;
    const pages = new Set(pageIndexes(b, true).slice(1));
    const out: Split = { head: v.head, raw: v.raw.map((text, i) => (!pages.has(i) ? text : text === shown.raw[i] ? b.raw[i] : storePage(text))), seps: v.seps };
    return join(out);
}

// ---- HTTP Request operations (see routes/hyperbook/[id]/db) ----

export type DbResult = { ok: true; markdown: string; page?: number } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): DbResult => ({ ok: false, status, error });

/** The pages by number (1 = the first), as fieldView shows them */
export function dbPages(markdown: string): string[] {
    const s = split(fieldView(markdown));
    return pageIndexes(s, isTemplateDb(markdown)).map((i) => s.raw[i].trim());
}

/** Pages whose Markdown contains the keyword (case is ignored) */
export function searchPages(markdown: string, keyword: string): { page: number; markdown: string }[] {
    const needle = keyword.toLowerCase();
    return dbPages(markdown)
        .map((text, n) => ({ page: n + 1, markdown: text }))
        .filter((p) => needle !== '' && p.markdown.toLowerCase().includes(needle));
}

/** The value a field in a request body holds; undefined when it says nothing (an unselected radio or select) */
function bodyValue(f: FieldMarker): FieldValue | undefined {
    if (f.kind === 'input' || f.kind === 'slider') return f.value ?? '';
    if (f.kind === 'select') return f.selected! >= 0 ? String(f.selected) : undefined;
    if (f.kind === 'radio') return f.checked ? true : undefined;
    return f.checked;
}

/** Set the page's fields from the body's fields, matched by kind, input format and order */
function applyBody(page: string, body: string): { ok: true; text: string } | { ok: false; error: string } {
    const seen = new Map<string, number>();
    let text = page;
    for (const f of scanFields(body)) {
        const key = fieldKey(f);
        if (!key) continue;
        const n = seen.get(key) ?? 0;
        seen.set(key, n + 1);
        const value = bodyValue(f);
        if (value === undefined) continue;
        const target = scanFields(text).filter((t) => fieldKey(t) === key)[n];
        if (!target) return { ok: false, error: `The page has no field ${key}(${n + 1}).` };
        const next = setFieldInMarkdown(text, target.index, value);
        if (next === null) return { ok: false, error: `The value does not fit ${key}(${n + 1}).` };
        text = next;
    }
    return { ok: true, text };
}

function located(markdown: string, page: number) {
    const template = isTemplateDb(markdown);
    const view = split(fieldView(markdown));
    const pages = pageIndexes(view, template);
    const at = Number.isInteger(page) && page >= 1 ? pages[page - 1] : undefined;
    return { template, view, pages, at };
}

/** A view with one page replaced, back in the stored form */
function withPage(markdown: string, view: Split, at: number, text: string): DbResult {
    view.raw[at] = text;
    const stored = fieldStore(markdown, join(view));
    return stored === null ? fail(500, 'Could not save the page.') : { ok: true, markdown: stored };
}

/** Add a page at the end: the body as it is, or (template) page 1's fields set from the body */
export function addPage(markdown: string, body: string): DbResult {
    const template = isTemplateDb(markdown);
    const s = split(markdown);
    const pages = pageIndexes(s, template);
    let text = body.trim();
    if (template && text) {
        const layout = pages.length ? layoutOf(s.raw[pages[0]]) : null;
        if (!layout) return fail(400, 'Page 1 has no fields.');
        const filled = applyBody(layout, text);
        if (!filled.ok) return fail(400, filled.error);
        text = storePage(filled.text).trim();
    }
    const page = `\n${text}\n`;
    if (!pages.length && s.raw.length === 1) s.raw[0] = page;
    else {
        const after = pages.length ? pages[pages.length - 1] : s.raw.length - 1;
        s.raw.splice(after + 1, 0, page);
        s.seps.splice(after, 0, '***');
    }
    return { ok: true, markdown: join(s), page: pages.length + 1 };
}

export function deletePage(markdown: string, page: number): DbResult {
    const template = isTemplateDb(markdown);
    const s = split(markdown);
    const pages = pageIndexes(s, template);
    const at = Number.isInteger(page) && page >= 1 ? pages[page - 1] : undefined;
    if (at === undefined) return fail(404, 'No such page.');
    if (template && page === 1) return fail(400, 'Page 1 defines the fields of a template and cannot be deleted.');
    if (s.raw.length === 1) s.raw[0] = '';
    else {
        s.raw.splice(at, 1);
        s.seps.splice(at > 0 ? at - 1 : 0, 1);
    }
    return { ok: true, markdown: join(s) };
}

/** Replace the page's Markdown (free layout), or set all of its fields from the body (template) */
export function updatePage(markdown: string, page: number, body: string): DbResult {
    const { template, view, at } = located(markdown, page);
    if (at === undefined) return fail(404, 'No such page.');
    if (!template) {
        view.raw[at] = `\n${body.trim()}\n`;
        return { ok: true, markdown: join(view) };
    }
    const filled = applyBody(view.raw[at], body);
    if (!filled.ok) return fail(400, filled.error);
    return withPage(markdown, view, at, filled.text);
}

/** `input(2)` / `input:date(1)` / `check(1)` / `slider:0,100(1)` …: a field of a page by kind, input format and order */
export function parseFieldSelector(selector: string): { key: string; n: number } | null {
    const m = selector.match(/^(input|check|radio|slider|select)(?::([^()\s]+))?\((\d+)\)$/);
    if (!m || Number(m[3]) < 1) return null;
    if (m[2] && m[1] !== 'input' && m[1] !== 'slider') return null;
    return { key: m[2] ? `${m[1]}:${m[2]}` : m[1], n: Number(m[3]) };
}

/** Set one field of a page from the first field in the body */
export function updateField(markdown: string, page: number, selector: string, body: string): DbResult {
    const sel = parseFieldSelector(selector);
    if (!sel) return fail(400, 'Invalid field.');
    const { view, at } = located(markdown, page);
    if (at === undefined) return fail(404, 'No such page.');
    const source = scanFields(body).find((f) => fieldKey(f) !== null);
    if (!source) return fail(400, 'The body has no field value.');
    if (source.kind !== sel.key.split(':')[0]) return fail(400, `The body does not hold a ${sel.key.split(':')[0]} value.`);
    const target = scanFields(view.raw[at]).filter((f) => fieldKey(f) === sel.key)[sel.n - 1];
    if (!target) return fail(404, `The page has no field ${selector}.`);
    const value = bodyValue(source);
    if (value === undefined) return fail(400, 'The body has no field value.');
    const next = setFieldInMarkdown(view.raw[at], target.index, value);
    if (next === null) return fail(400, `The value does not fit ${selector}.`);
    return withPage(markdown, view, at, next);
}

// ---- Who may call the DB API without an API key: the owner's own card ----

/**
 * The card a request came from, read from its Referer on the same host: /hypercard/{id} (the card page),
 * or /workspace?id={id} (the owner's workspace preview). Null for anything else.
 */
export function refererCard(referer: string | null, requestUrl: URL): string | null {
    if (!referer) return null;
    let from: URL;
    try {
        from = new URL(referer);
    } catch {
        return null;
    }
    if (from.origin !== requestUrl.origin) return null;
    const page = from.pathname.match(/^\/hypercard\/([A-Za-z0-9_-]+)\/?$/)?.[1];
    if (page) return page;
    if (/^\/workspace\/?$/.test(from.pathname)) {
        const id = from.searchParams.get('id');
        return id && /^[A-Za-z0-9_-]+$/.test(id) ? id : null;
    }
    return null;
}
