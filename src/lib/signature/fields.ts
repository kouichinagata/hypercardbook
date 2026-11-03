// {{MarkdownAIinput:…}} / {{MarkdownAIcheck}} / {{MarkdownAIradio}} form fields in Markdown
//   input    text field (xxxx = up to 4 chars, XXXX = exactly 4, nnnn / NNNN = digits), :date (calendar), :textarea (multi-line).
//            Saving replaces the marker with the entered text.
//   check    check box; `:x` = checked. Confirm replaces the marker with ☑ (checked) or ☐.
//   radio    radio button; `:x` = selected. Consecutive lines form one group. Confirm replaces the group's markers
//            with ◉ (the selected one) and ○ (the others); the options stay in the text.
export type FieldKind = 'input' | 'check' | 'radio';
export type InputSpec = { type: 'text' | 'digits'; length: number | null; fixed: boolean } | { type: 'date' } | { type: 'textarea' };

export type FieldMarker = {
    index: number;
    kind: FieldKind;
    start: number;
    end: number;
    line: number;
    raw: string;
    checked: boolean;
    input?: InputSpec;
    /** Radio only: the first field index of its group, and whether it is the last one of the group */
    group?: number;
    lastInGroup?: boolean;
};

const MARKER = /\{\{\s*MarkdownAI(input|check|radio)(?:\s*:\s*([^\s{}]+))?\s*\}\}/g;
const CODE = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g;

export function inputSpecOf(arg: string | undefined): InputSpec | null {
    // No argument: an ordinary text field, no length limit
    if (arg === undefined) return { type: 'text', length: null, fixed: false };
    if (arg === 'date') return { type: 'date' };
    if (arg === 'textarea') return { type: 'textarea' };
    if (/^[xX]+$/.test(arg) || /^[nN]+$/.test(arg)) {
        return { type: /^[xX]/.test(arg) ? 'text' : 'digits', length: arg.length, fixed: arg === arg.toUpperCase() };
    }
    return null;
}

/** Every field marker outside code, numbered in order of appearance */
export function scanFields(markdown: string): FieldMarker[] {
    const fields: FieldMarker[] = [];
    let offset = 0;
    markdown.split(CODE).forEach((part, i) => {
        if (i % 2 === 0) {
            for (const m of part.matchAll(MARKER)) {
                const kind = m[1] as FieldKind;
                const arg = m[2];
                const start = offset + m.index!;
                const field: FieldMarker = {
                    index: -1,
                    kind,
                    start,
                    end: start + m[0].length,
                    line: markdown.slice(0, start).split('\n').length - 1,
                    raw: m[0],
                    checked: kind !== 'input' && arg === 'x'
                };
                if (kind === 'input') {
                    const spec = inputSpecOf(arg);
                    if (!spec) continue;
                    field.input = spec;
                } else if (arg !== undefined && arg !== 'x') continue;
                fields.push(field);
            }
        }
        offset += part.length;
    });
    fields.forEach((f, n) => (f.index = n));
    fields.forEach((f) => {
        if (f.kind !== 'radio') return;
        const [first, last] = radioGroup(fields, f.index);
        f.group = first;
        f.lastInGroup = f.index === last;
    });
    return fields;
}

/** A radio group is the run of radio fields on consecutive lines: [first, last] field indexes */
function radioGroup(fields: FieldMarker[], index: number): [number, number] {
    let first = index;
    let last = index;
    while (first > 0 && fields[first - 1].kind === 'radio' && fields[first].line - fields[first - 1].line === 1) first--;
    while (last < fields.length - 1 && fields[last + 1].kind === 'radio' && fields[last + 1].line - fields[last].line === 1) last++;
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

/** Returns an error message, or null when the value fits the field */
export function validateInput(spec: InputSpec, value: string): string | null {
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

/**
 * Confirm a field. `value` is the text for an input, a boolean for a check box (ticked or not),
 * and `true` for a radio (this one is the selected option of its group). The markers are replaced and never come back.
 * Null when the field does not exist or the value does not fit.
 */
export function setFieldInMarkdown(markdown: string, index: number, value: string | boolean): string | null {
    const fields = scanFields(markdown);
    const target = fields[index];
    if (!target) return null;
    const replacements = new Map<number, string>();
    if (target.kind === 'input') {
        if (typeof value !== 'string' || validateInput(target.input!, value)) return null;
        replacements.set(index, inputToMarkdown(value));
    } else if (typeof value !== 'boolean') {
        return null;
    } else if (target.kind === 'check') {
        replacements.set(index, value ? '☑' : '☐');
    } else {
        if (!value) return null;
        const [first, last] = radioGroup(fields, index);
        for (let i = first; i <= last; i++) replacements.set(i, i === index ? '◉' : '○');
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
