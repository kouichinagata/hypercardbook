// The old one-time MarkdownAI parts are now the Confirm parts: rename the markers still left in saved books.
//   {{MarkdownAIinput:…}} → {{MarkdownAIinputConfirm:…}}, {{MarkdownAIcheck}} → {{MarkdownAIcheckConfirm}}, {{MarkdownAIradio}} → {{MarkdownAIradioConfirm}},
//   {{MarkdownAIverify}} / {{myMarkdownAIverify}} / {{your MarkdownAIverify}} → …Confirm
// Confirmed fields (plain text, ☑ ◉) and signed images are not markers any more, so they are not touched. Code blocks are skipped.
// Slot and field numbers stay the same, so the version is not changed.
// Usage:
//   node --env-file=.env scripts/migrate_markdownai_confirm.mjs           (report only)
//   node --env-file=.env scripts/migrate_markdownai_confirm.mjs --apply   (write)
import { createClient } from '@supabase/supabase-js';

const apply = process.argv.includes('--apply');
const url = process.env.PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
    console.error('Error: PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your .env file.');
    process.exit(1);
}
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const CODE = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g;
const FIELD = /\{\{(\s*)MarkdownAI(input|check|radio)(\s*(?::\s*[^\s{}=]+)?\s*\}\})/g;
const VERIFY = /\{\{(\s*)(my|your\s*)?MarkdownAIverify(\s*\}\})/g;

function toConfirm(markdown) {
    let count = 0;
    const out = markdown
        .split(CODE)
        .map((part, i) => {
            if (i % 2 === 1) return part;
            return part
                .replace(FIELD, (_m, a, kind, rest) => (count++, `{{${a}MarkdownAI${kind}Confirm${rest}`))
                .replace(VERIFY, (_m, a, who, rest) => (count++, `{{${a}${who ?? ''}MarkdownAIverifyConfirm${rest}`));
        })
        .join('');
    return { markdown: out, count };
}

let changed = 0;
let markers = 0;
let failed = 0;
for (let from = 0; ; from += 500) {
    const { data, error } = await supabase
        .from('books')
        .select('id, slug, title, version, markdown_content')
        .ilike('markdown_content', '%MarkdownAI%')
        .order('id')
        .range(from, from + 499);
    if (error) throw error;
    for (const book of data) {
        const { markdown, count } = toConfirm(book.markdown_content || '');
        if (!count) continue;
        changed++;
        markers += count;
        console.log(`${apply ? 'update' : 'would update'} ${book.id} (${book.slug}) "${book.title}": ${count} marker(s)`);
        if (!apply) continue;
        const { data: saved, error: writeError } = await supabase
            .from('books')
            .update({ markdown_content: markdown })
            .eq('id', book.id)
            .eq('version', book.version)
            .select('id')
            .maybeSingle();
        if (writeError || !saved) {
            failed++;
            console.error(`  failed (${writeError?.message || 'changed meanwhile; run again'})`);
        }
    }
    if (data.length < 500) break;
}
console.log(`${apply ? 'Updated' : 'Would update'} ${changed} book(s), ${markers} marker(s)${failed ? `, ${failed} failed` : ''}.`);
