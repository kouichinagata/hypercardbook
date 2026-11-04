// A template is a card with MarkdownAI variables that is not itself a contract: opening it outside the workspace
// makes a contract (one document per signing), and the contract is the one that is filled and signed.
import { hasFields } from './fields.ts';
import { signatureImageUrls, signSlotKinds } from './markers.ts';

const FRONTMATTER = /^---\s*\n([\s\S]*?)\n---(?:\r?\n|$)/;

function hasFrontmatterKey(markdown: string, key: string): boolean {
    const match = markdown.match(FRONTMATTER);
    return !!match && match[1].split('\n').some((line) => line.startsWith(`${key}:`));
}

/** Made from a template for one signing (see contractMarkdown) */
export const isContract = (markdown: string) => hasFrontmatterKey(markdown, 'contract_source_id');

/** Template, contract or certificate: only MarkdownAI markers, signed images or the contract / certificate frontmatter count, never an ordinary HTML form */
export function isVerifyDocument(markdown: string): boolean {
    return (
        signSlotKinds(markdown).length > 0 ||
        hasFields(markdown) ||
        signatureImageUrls(markdown).length > 0 ||
        hasFrontmatterKey(markdown, 'contract_source_id') ||
        hasFrontmatterKey(markdown, 'certificate_issuance_id')
    );
}

/** Has a variable, is not a contract or certificate, and has nothing signed yet */
export function isTemplate(markdown: string): boolean {
    if (!signSlotKinds(markdown).length && !hasFields(markdown)) return false;
    if (hasFrontmatterKey(markdown, 'contract_source_id') || hasFrontmatterKey(markdown, 'certificate_issuance_id')) return false;
    return signatureImageUrls(markdown).length === 0;
}

/** "2026-11-03 15:20" in Japan time: tells contracts made from one template apart */
export function contractStamp(date: Date): string {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** The template's Markdown as a contract: its own id, private, the template it came from, and a title that tells it apart */
export function contractMarkdown(markdown: string, input: { id: string; sourceId: string; title: string }): string {
    const match = markdown.match(FRONTMATTER);
    const fields = match ? match[1].split('\n').filter((line) => !/^(id|is_public|published_at|contract_[a-z_]+):/.test(line)).map((line) => (line.startsWith('title:') ? `title: ${input.title}` : line)).join('\n') : 'play_mode: card';
    const body = match ? markdown.slice(match[0].length) : markdown;
    return `---\nid: ${input.id}\nis_public: false\ncontract_source_id: ${input.sourceId}\n${fields}\n---\n${body}`;
}

/** A completed contract as the signer's own private copy: only its identity changes, the signatures stay */
export function signedCopyMarkdown(markdown: string, slug: string): string {
    const match = markdown.match(FRONTMATTER);
    if (!match) return markdown;
    const fields = match[1].split('\n').filter((line) => !/^(id|is_public|published_at):/.test(line)).join('\n');
    return `---\nid: ${slug}\nis_public: false\n${fields}\n---\n${markdown.slice(match[0].length)}`;
}
