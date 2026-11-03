import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminClient, applyField, applySignature } from '$lib/server/signatures';

// The owner signs any slot of their own document (login is required by hooks.server.ts)
export const POST: RequestHandler = async ({ request, locals }) => {
    const userId = locals.session?.user.id;
    if (!userId) return json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    if (body.field) {
        const done = await applyField(adminClient(), { bookId: String(body.bookId ?? ''), index: body.index, value: body.value, actor: { type: 'owner', userId } });
        return done.ok ? json(done) : json({ error: done.error }, { status: done.status });
    }
    const { bookId, slot, kind, baseVersion, svg } = body;
    const outcome = await applySignature(adminClient(), { bookId: String(bookId ?? ''), slot, kind, baseVersion, svg, actor: { type: 'owner', userId } });
    return outcome.ok ? json(outcome) : json({ error: outcome.error }, { status: outcome.status });
};
