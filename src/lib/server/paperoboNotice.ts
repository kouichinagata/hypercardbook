import { env } from '$env/dynamic/private';
import { WWW_ORIGIN } from '../content-origin.ts';

const PAPEROBO_ORIGIN = 'https://paperobo.hypercardbook.org';

/**
 * Tell the document owner, through Amy in PapeRobo, that someone signed their MarkdownAI Verify document.
 * Failures are logged only: signing never fails because of this.
 */
export async function notifyOwnerSigned(input: { ownerId: string; bookId: string; title: string; complete: boolean; signatureId: string }) {
    const secret = env.HYPERCARDBOOK_SHARED_SECRET || '';
    if (!secret) return;
    const link = `${WWW_ORIGIN}/hypercard/${input.bookId}`;
    const content = `「${input.title || 'Untitled'}」にサインがありました。${input.complete ? 'すべてのサインがそろい、書類が完成しました。' : ''}\n\n${link}`;
    try {
        const res = await fetch(`${env.PAPEROBO_ORIGIN || PAPEROBO_ORIGIN}/api/hypercardbook/notices`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: input.ownerId, noticeId: `verify-signed-${input.signatureId}`, content }),
            signal: AbortSignal.timeout(5000)
        });
        if (!res.ok) console.error('[notice] PapeRobo refused the signed notice:', res.status);
    } catch (err) {
        console.error('[notice] could not send the signed notice:', err);
    }
}
