import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminClient, applySignature } from '$lib/server/signatures';

// The owner signs any slot of their own document (login is required by hooks.server.ts)
export const POST: RequestHandler = async ({ request, locals }) => {
    const userId = locals.session?.user.id;
    if (!userId) return json({ error: 'Unauthorized' }, { status: 401 });
    const { bookId, slot, kind, baseVersion, svg } = await request.json();
    const outcome = await applySignature(adminClient(), { bookId: String(bookId ?? ''), slot, kind, baseVersion, svg, actor: { type: 'owner', userId } });
    return outcome.ok ? json(outcome) : json({ error: outcome.error }, { status: outcome.status });
};
