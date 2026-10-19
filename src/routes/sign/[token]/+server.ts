import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminClient, applySignature, resolveSignLink } from '$lib/server/signatures';

// A guest signs with the link alone (no login): only `your` / `any` slots, enforced in applySignature
export const POST: RequestHandler = async ({ params, request }) => {
    const admin = adminClient();
    const link = await resolveSignLink(admin, params.token);
    if (!link) return json({ error: 'This link is invalid or expired.' }, { status: 404 });
    const { slot, kind, baseVersion, svg, webp, name } = await request.json();
    const signerName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 100) : null;
    const outcome = await applySignature(admin, { bookId: link.bookId, slot, kind, baseVersion, svg, webp, actor: { type: 'guest', name: signerName } });
    return outcome.ok ? json(outcome) : json({ error: outcome.error }, { status: outcome.status });
};
