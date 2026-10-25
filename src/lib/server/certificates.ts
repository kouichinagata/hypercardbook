import type { SupabaseClient } from '@supabase/supabase-js';
import { error } from '@sveltejs/kit';
import { signSlotKinds, signatureImageUrls } from '../signature/markers.ts';
import { isComplete, newVerifyId, recordCompletion, verifyHash, type VerifyRecord } from './markdown-verify.ts';

export const issuanceKey = (bookId: string) => `certificate-issued:${bookId}`;

/** An issuance is recorded even while slots remain open. Completion has its own immutable record. */
export async function certificateIssuance(admin: SupabaseClient, bookId: string, certificateId?: string) {
    const { data, error: dbError } = await admin.from('markdown_verify').select('*').eq('book_id', bookId).eq('complete_key', issuanceKey(bookId)).maybeSingle();
    if (dbError) throw error(503, 'Could not read the certificate issuance record.');
    if (!data || (certificateId && data.verify_id !== certificateId)) {
        if (certificateId) throw error(404, 'Certificate issuance not found.');
        return null;
    }
    if (verifyHash(data) !== data.sha256) throw error(409, 'The certificate issuance record is invalid.');
    return data as VerifyRecord & { sha256: string };
}

export function certificateMarkdown(markdown: string, input: { id: string; sourceId: string; issuer: string; certificateId: string; issuedAt: string }) {
    // Keep the template's presentation but give this private copy its own identity and provenance.
    const match = markdown.match(/^---\s*\n([\s\S]*?)\n---(?:\r?\n|$)/);
    const fields = match ? match[1].split('\n').filter(line => !/^(id|is_public|published_at|certificate_[a-z_]+):/.test(line)).join('\n') : 'play_mode: card';
    const body = match ? markdown.slice(match[0].length) : markdown;
    return `---\nid: ${input.id}\nis_public: false\ncertificate_issuance_id: ${input.certificateId}\ncertificate_source_id: ${input.sourceId}\ncertificate_issuer: ${input.issuer}\ncertificate_issued_at: ${input.issuedAt}\n${fields}\n---\n${body}`;
}

export async function issueCertificate(admin: SupabaseClient, template: { id: string; title: string; markdown_content: string; author?: string; cover_image?: string; theme_color?: string }, userId: string) {
    if (!signSlotKinds(template.markdown_content).length) throw error(400, 'This card has no MarkdownAIVerify fields.');
    if (signatureImageUrls(template.markdown_content).length) throw error(400, 'Choose an unsigned certificate template.');
    const certificateId = newVerifyId();
    const issuedAt = new Date().toISOString();
    const slug = `certificate-${certificateId}`;
    const markdown = certificateMarkdown(template.markdown_content, { id: slug, sourceId: template.id, issuer: userId, certificateId, issuedAt });
    const { data: copy, error: copyError } = await admin.from('books').insert({ user_id: userId, slug, title: template.title, author: template.author || null, cover_image: template.cover_image || null, theme_color: template.theme_color || 'white', markdown_content: markdown, is_public: false, published_at: null }).select('id').single();
    if (copyError || !copy) throw error(503, 'Could not create the certificate.');
    const record: VerifyRecord = { verify_id: certificateId, book_id: copy.id, markdown, signatures: [], completed_at: issuedAt };
    const { error: recordError } = await admin.from('markdown_verify').insert({ ...record, sha256: verifyHash(record), complete_key: issuanceKey(copy.id) });
    if (recordError) {
        // No issuance exists, so this unissued copy is safe to discard; the template is untouched.
        await admin.from('books').delete().eq('id', copy.id);
        throw error(503, 'Could not record the certificate issuance. Please try again.');
    }
    return { id: copy.id, title: template.title, kind: 'card', source: markdown, isPublic: false, certificateId };
}

export async function certificateState(admin: SupabaseClient, bookId: string, markdown: string, certificateId: string) {
    const issuance = await certificateIssuance(admin, bookId, certificateId);
    if (!issuance) throw error(404, 'Certificate issuance not found.');
    const { data: completed, error: completedError } = await admin.from('markdown_verify').select('*').eq('book_id', bookId).neq('complete_key', issuanceKey(bookId)).order('completed_at').limit(1).maybeSingle();
    if (completedError) throw error(503, 'Could not read the completed certificate.');
    if (completed) {
        if (verifyHash(completed) !== completed.sha256 || !isComplete(completed.markdown)) throw error(409, 'The completed certificate record is invalid.');
        return { status: 'complete' as const, remaining: 0, verifyId: completed.verify_id as string, record: completed as VerifyRecord };
    }
    const complete = isComplete(markdown);
    // Retry recording on open/download after a transient DB failure. Never label an unrecorded completion as valid.
    const record = complete ? await recordCompletion(admin, bookId, markdown) : null;
    return { status: complete ? (record ? 'complete' as const : 'recording' as const) : 'pending' as const, remaining: signSlotKinds(markdown).length, verifyId: record?.verify_id || issuance.verify_id, record };
}
