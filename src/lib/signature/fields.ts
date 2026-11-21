// MarkdownAI form fields in Markdown. Each kind comes in two versions:
//   {{MarkdownAIinputConfirm:…}} / {{MarkdownAIcheckConfirm}} / {{MarkdownAIradioConfirm}}
//            Confirmed once with its Confirm button: the marker is replaced and never comes back.
//   {{MarkdownAIinput:…}} / {{MarkdownAIcheck}} / {{MarkdownAIradio}}
//            Can be changed any number of times. The value is kept in the marker after `=`:
//            {{MarkdownAIinput=Taro}}, {{MarkdownAIinput:date=2026/10/21}}, {{MarkdownAIcheck=x}} / {{MarkdownAIcheck=}},
//            {{MarkdownAIradio=x}} on the selected option of a group.
//   input    text field (xxxx = up to 4 chars, XXXX = exactly 4, nnnn / NNNN = digits), :date (calendar), :textarea (multi-line).
//   check    check box; `:x` = checked at first. Confirm replaces the marker with ☑ (checked) or ☐.
//   radio    radio button; `:x` = selected at first. Consecutive lines of the same version form one group. Confirm replaces
//            the group's markers with ◉ (the selected one) and ○ (the others); the options stay in the text.
//   input:time  time of day, kept as 09:30.
//   slider   {{MarkdownAIslider:0,100=50}}: a whole number from min to max (starts at min without `=`). Confirm replaces it with the number.
//   select   a block: {{MarkdownAIselect}} / a Markdown list (the selected item ends with `=x`) / {{/MarkdownAIselect}}.
//            Confirm replaces the whole block with the selected item.
//   button   {{MarkdownAIbutton:mailto}} / {{MarkdownAIbutton:mailto:taro@example.com,hanako@example.com}}: opens the mail app
//            (to those addresses) with the whole Markdown as the body, any number of times (no value). The Confirm version can be
//            sent once, and is then replaced with "Sent by email to taro@example.com on 2026/11/22 10:30 (UTC+09:00)".
export type FieldKind = 'input' | 'check' | 'radio' | 'slider' | 'select' | 'button';
export type InputSpec = { type: 'text' | 'digits'; length: number | null; fixed: boolean } | { type: 'date' } | { type: 'time' } | { type: 'textarea' };
export type FieldValue = string | boolean;

export type FieldMarker = {
    index: number;
    kind: FieldKind;
    /** true: the Confirm version (one time); false: can be changed any number of times */
    confirm: boolean;
    start: number;
    end: number;
    line: number;
    raw: string;
    checked: boolean;
    input?: InputSpec;
    /** Changeable input: the saved text as the user typed it (a date as YYYY-MM-DD), '' when nothing is saved. Slider: the number */
    value?: string;
    /** Slider only */
    range?: { min: number; max: number };
    /** Select only: the items, and the selected one (-1 when none) */
    options?: string[];
    selected?: number;
    /** Button only: the addresses to send to (none: the mail app opens with no address) */
    mailto?: string[];
    /** Changeable fields only: the order among the changeable fields */
    changeable?: number;
    /** Radio only: the first field index of its group, and whether it is the last one of the group */
    group?: number;
    lastInGroup?: boolean;
};

const MARKER = /\{\{\s*MarkdownAI(input|check|radio|slider|button)(Confirm)?(?:\s*:\s*([^\s{}=]+))?(?:\s*=((?:(?!\}\})[^\r\n])*?))?\s*\}\}/g;
// A select block: the opening marker, list items one per line, the closing marker of the same version
const SELECT = /\{\{\s*MarkdownAIselect(Confirm)?\s*\}\}[ \t]*\r?\n((?:[ \t]*[-*+][ \t]+[^\r\n]*\r?\n)+)[ \t]*\{\{\s*\/MarkdownAIselect\1\s*\}\}/g;
const SELECT_ITEM = /^([ \t]*[-*+][ \t]+)(.*?)(?:[ \t]*=[ \t]*x)?[ \t]*$/;
const EMAIL = /^[A-Za-z0-9._+\-]+@[A-Za-z0-9\-]+(\.[A-Za-z0-9\-]+)+$/;
const SENT_AT = /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2} \(UTC[+-]\d{2}:\d{2}\)$/;
const CODE = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g;

export function inputSpecOf(arg: string | undefined): InputSpec | null {
    // No argument: an ordinary text field, no length limit
    if (arg === undefined) return { type: 'text', length: null, fixed: false };
    if (arg === 'date') return { type: 'date' };
    if (arg === 'time') return { type: 'time' };
    if (arg === 'textarea') return { type: 'textarea' };
    if (/^[xX]+$/.test(arg) || /^[nN]+$/.test(arg)) {
        return { type: /^[xX]/.test(arg) ? 'text' : 'digits', length: arg.length, fixed: arg === arg.toUpperCase() };
    }
    return null;
}

/** Every field marker outside code, numbered in order of appearance */
export function scanFields(markdown: string): FieldMarker[] {
    const fields: (FieldMarker & { saved?: string })[] = [];
    let offset = 0;
    markdown.split(CODE).forEach((part, i) => {
        if (i % 2 === 0) {
            const blocks: [number, number][] = [];
            for (const m of part.matchAll(SELECT)) {
                const start = offset + m.index!;
                const lines = m[2].split(/\r?\n/).filter((l) => l.trim());
                const options: string[] = [];
                let selected = -1;
                lines.forEach((l, n) => {
                    options.push(l.match(SELECT_ITEM)![2]);
                    if (selected < 0 && /=[ \t]*x[ \t]*$/.test(l)) selected = n;
                });
                blocks.push([m.index!, m.index! + m[0].length]);
                fields.push({ index: -1, kind: 'select', confirm: !!m[1], start, end: start + m[0].length, line: markdown.slice(0, start).split('\n').length - 1, raw: m[0], checked: false, options, selected });
            }
            for (const m of part.matchAll(MARKER)) {
                const kind = m[1] as FieldKind;
                const confirm = !!m[2];
                const arg = m[3];
                const saved = m[4];
                // Only the changeable version keeps a value (a slider's `=` is also where a Confirm slider starts)
                if (confirm && saved !== undefined && kind !== 'slider') continue;
                if (blocks.some(([a, b]) => m.index! >= a && m.index! < b)) continue;
                const start = offset + m.index!;
                const field: FieldMarker & { saved?: string } = {
                    index: -1,
                    kind,
                    confirm,
                    start,
                    end: start + m[0].length,
                    line: markdown.slice(0, start).split('\n').length - 1,
                    raw: m[0],
                    checked: (kind === 'check' || kind === 'radio') && arg === 'x',
                    saved
                };
                if (kind === 'slider') {
                    const r = arg?.match(/^(-?\d+),(-?\d+)$/);
                    if (!r || Number(r[1]) >= Number(r[2])) continue;
                    const range = { min: Number(r[1]), max: Number(r[2]) };
                    const v = saved !== undefined && /^-?\d+$/.test(saved.trim()) ? Number(saved.trim()) : range.min;
                    field.range = range;
                    field.value = String(Math.min(range.max, Math.max(range.min, v)));
                    delete field.saved;
                } else if (kind === 'button') {
                    const to = arg?.match(/^mailto(?::(.+))?$/);
                    if (!to || saved !== undefined) continue;
                    const addresses = to[1] ? to[1].split(',') : [];
                    if (!addresses.every((a) => EMAIL.test(a))) continue;
                    field.mailto = addresses;
                } else if (kind === 'input') {
                    const spec = inputSpecOf(arg);
                    if (!spec) continue;
                    field.input = spec;
                    if (!confirm) field.value = saved === undefined ? '' : savedToInput(spec, saved.trim());
                } else if (arg !== undefined && arg !== 'x') continue;
                fields.push(field);
            }
        }
        offset += part.length;
    });
    fields.sort((a, b) => a.start - b.start);
    fields.forEach((f, n) => (f.index = n));
    let changeable = 0;
    fields.forEach((f) => {
        // A changeable button has no value to keep
        if (!f.confirm && f.kind !== 'button') f.changeable = changeable++;
        if (f.kind === 'check' && !f.confirm && f.saved !== undefined) f.checked = f.saved.trim() === 'x';
        if (f.kind !== 'radio') return;
        const [first, last] = radioGroup(fields, f.index);
        f.group = first;
        f.lastInGroup = f.index === last;
    });
    // A saved selection (=x) in a changeable group wins over the first-time `:x`
    fields.forEach((f) => {
        if (f.kind !== 'radio' || f.confirm || f.group !== f.index) return;
        const [first, last] = radioGroup(fields, f.index);
        const members = fields.slice(first, last + 1);
        if (members.some((r) => r.saved !== undefined)) members.forEach((r) => (r.checked = r.saved?.trim() === 'x'));
    });
    return fields.map(({ saved: _saved, ...f }) => f);
}

/** A radio group is the run of radio fields of the same version on consecutive lines: [first, last] field indexes */
function radioGroup(fields: FieldMarker[], index: number): [number, number] {
    const same = (a: FieldMarker, b: FieldMarker) => a.kind === 'radio' && a.confirm === b.confirm;
    let first = index;
    let last = index;
    while (first > 0 && same(fields[first - 1], fields[first]) && fields[first].line - fields[first - 1].line === 1) first--;
    while (last < fields.length - 1 && same(fields[last + 1], fields[last]) && fields[last + 1].line - fields[last].line === 1) last++;
    return [first, last];
}

/** Replace each field marker with the text returned by `render` */
export function replaceFieldMarkers(markdown: string, render: (field: FieldMarker) => string): string {
    const fields = scanFields(markdown);
    let out = '';
    let at = 0;
    for (const f of fields) {
        out += markdown.slice(at, f.start) + render(f);
        at = f.end;
    }
    return out + markdown.slice(at);
}

export function hasFields(markdown: string): boolean {
    return scanFields(markdown).length > 0;
}

/** Confirm fields not confirmed yet (they must all be confirmed before the last signature) */
export function hasConfirmFields(markdown: string): boolean {
    return scanFields(markdown).some((f) => f.confirm);
}

/** Returns an error message, or null when the value fits the field */
export function validateInput(spec: InputSpec, value: string): string | null {
    if (spec.type === 'time') return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? null : 'Pick a time.';
    if (spec.type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? null : 'Pick a date.';
    if (spec.type === 'textarea') return null;
    if (/[\r\n]/.test(value)) return 'Enter a single line.';
    if (spec.type === 'digits' && !/^\d*$/.test(value)) return 'Digits only.';
    if (spec.length === null) return null;
    if (spec.fixed ? value.length !== spec.length : value.length > spec.length) {
        return spec.fixed ? `Enter exactly ${spec.length} characters.` : `Up to ${spec.length} characters.`;
    }
    return null;
}

/** The entered text, made safe to put into Markdown: no new markers, no raw HTML (a textarea line break becomes <br>) */
export function inputToMarkdown(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\{\{/g, '{ {')
        .replace(/\}\}/g, '} }')
        .replace(/\r?\n/g, '<br>');
}

/** The text kept after `=` of a changeable input, back to what the user typed (a date 2026/10/21 becomes 2026-10-21) */
function savedToInput(spec: InputSpec, saved: string): string {
    if (spec.type === 'date') return saved.replace(/\//g, '-');
    if (spec.type === 'time') return saved;
    return saved
        .replace(/<br>/g, '\n')
        .replace(/&#123;/g, '{')
        .replace(/&#125;/g, '}')
        .replace(/&#124;/g, '|')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

/** The text kept after `=` of a changeable input (a date is kept as 2026/10/21) */
function inputToSaved(spec: InputSpec, value: string): string {
    if (spec.type === 'date') return value.replace(/-/g, '/');
    if (spec.type === 'time') return value;
    // Braces and | are kept as entities so the marker (and a table cell around it) always ends where it should
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\{/g, '&#123;')
        .replace(/\}/g, '&#125;')
        .replace(/\|/g, '&#124;')
        .replace(/\r?\n/g, '<br>');
}

function changeableMarker(field: FieldMarker, saved: string | null): string {
    const name = `MarkdownAI${field.kind}`;
    if (field.kind === 'slider') return `{{${name}:${field.range!.min},${field.range!.max}=${saved}}}`;
    if (field.kind === 'input') {
        const arg = field.raw.match(/:\s*([^\s{}=]+)/)?.[1];
        const head = arg ? `${name}:${arg}` : name;
        return saved ? `{{${head}=${saved}}}` : `{{${head}}}`;
    }
    return saved === null ? `{{${name}}}` : `{{${name}=${saved}}}`;
}

/**
 * Set a field. `value` is the text for an input, a boolean for a check box (ticked or not),
 * and `true` for a radio (this one is the selected option of its group).
 * A Confirm field's marker is replaced and never comes back; a changeable field keeps its marker with the value after `=`.
 * Null when the field does not exist or the value does not fit.
 */
export function setFieldInMarkdown(markdown: string, index: number, value: FieldValue): string | null {
    const fields = scanFields(markdown);
    const target = fields[index];
    if (!target) return null;
    const replacements = new Map<number, string>();
    if (target.kind === 'button') {
        // Only the Confirm button is set: it was sent once, at `value` (2026/11/22 10:30 (UTC+09:00))
        if (!target.confirm || typeof value !== 'string' || !SENT_AT.test(value)) return null;
        const to = target.mailto!.length ? ` to ${target.mailto!.join(', ')}` : '';
        replacements.set(index, `Sent by email${to} on ${value}`);
    } else if (target.kind === 'slider') {
        if (typeof value !== 'string' || !/^-?\d+$/.test(value)) return null;
        const n = Number(value);
        if (n < target.range!.min || n > target.range!.max) return null;
        replacements.set(index, target.confirm ? String(n) : changeableMarker(target, String(n)));
    } else if (target.kind === 'select') {
        if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
        const pick = Number(value);
        if (pick >= target.options!.length) return null;
        if (target.confirm) replacements.set(index, target.options![pick]);
        else {
            // The block is kept; only the `=x` moves to the selected item
            let n = -1;
            replacements.set(index, target.raw.split('\n').map((l) => {
                const item = l.replace(/\r$/, '').match(SELECT_ITEM);
                if (!item) return l;
                n++;
                return `${item[1]}${item[2]}${n === pick ? '=x' : ''}${l.endsWith('\r') ? '\r' : ''}`;
            }).join('\n'));
        }
    } else if (target.kind === 'input') {
        if (typeof value !== 'string') return null;
        // Emptying a changeable input clears its saved value
        if (!target.confirm && value === '') replacements.set(index, changeableMarker(target, null));
        else if (validateInput(target.input!, value)) return null;
        else replacements.set(index, target.confirm ? inputToMarkdown(value) : changeableMarker(target, inputToSaved(target.input!, value)));
    } else if (typeof value !== 'boolean') {
        return null;
    } else if (target.kind === 'check') {
        replacements.set(index, target.confirm ? (value ? '☑' : '☐') : changeableMarker(target, value ? 'x' : ''));
    } else {
        if (!value) return null;
        const [first, last] = radioGroup(fields, index);
        for (let i = first; i <= last; i++) {
            replacements.set(i, target.confirm ? (i === index ? '◉' : '○') : changeableMarker(fields[i], i === index ? 'x' : null));
        }
    }
    let out = '';
    let at = 0;
    for (const f of fields) {
        const next = replacements.get(f.index);
        if (next === undefined) continue;
        out += markdown.slice(at, f.start) + next;
        at = f.end;
    }
    return out + markdown.slice(at);
}

/** The current value of each changeable field, in order: text for an input (null when nothing is saved), checked for a check box / radio */
export function changeableValues(markdown: string): (FieldValue | null)[] {
    return scanFields(markdown)
        .filter((f) => f.changeable !== undefined)
        .map(currentValue);
}

/** A changeable field's value: text for an input / slider / select (the item number), null when nothing is set; checked for a check box / radio */
function currentValue(f: FieldMarker): FieldValue | null {
    if (f.kind === 'input' || f.kind === 'slider') return f.value ? f.value : null;
    if (f.kind === 'select') return f.selected! >= 0 ? String(f.selected) : null;
    return f.checked;
}

/**
 * Write the changeable values sent with a signature (see changeableValues) into the Markdown.
 * Null when they do not match the document's changeable fields or a value does not fit.
 */
export function applyChangeableValues(markdown: string, values: unknown): string | null {
    if (!Array.isArray(values)) return null;
    const changeable = scanFields(markdown).filter((f) => f.changeable !== undefined);
    if (values.length !== changeable.length) return null;
    let out = markdown;
    for (let n = 0; n < changeable.length; n++) {
        const value = values[n];
        // Fields are found again each time: an earlier value may have changed the offsets
        const field = scanFields(out).find((f) => f.changeable === n)!;
        // Unchanged values are left as they are (a value written by hand need not fit the field)
        if (value === currentValue(field)) continue;
        if (field.kind === 'input' || field.kind === 'slider' || field.kind === 'select') {
            if (value === null) continue;
            if (typeof value !== 'string') return null;
        } else if (typeof value !== 'boolean') return null;
        // A radio is set by its selected option only
        if (field.kind === 'radio' && value === false) continue;
        const next = setFieldInMarkdown(out, field.index, value as FieldValue);
        if (next === null) return null;
        out = next;
    }
    return out;
}
