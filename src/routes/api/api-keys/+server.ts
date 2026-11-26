import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminClient } from '$lib/server/signatures';
import { apiKeyInfo, issueApiKey, revokeApiKey } from '$lib/server/api-keys';

// The signed-in user's API key for the HyperBook DB HTTP Request API (hooks.server.ts requires a session for /api/)
export const GET: RequestHandler = async ({ locals }) => {
    try {
        return json({ key: await apiKeyInfo(adminClient(), locals.session!.user.id) });
    } catch (err) {
        console.error('[api-keys] read failed:', err);
        return json({ error: 'Could not read the API key.' }, { status: 500 });
    }
};

export const POST: RequestHandler = async ({ locals }) => {
    try {
        const admin = adminClient();
        const userId = locals.session!.user.id;
        const key = await issueApiKey(admin, userId);
        return json({ apiKey: key, key: await apiKeyInfo(admin, userId) });
    } catch (err) {
        console.error('[api-keys] issue failed:', err);
        return json({ error: 'Could not create an API key.' }, { status: 500 });
    }
};

export const DELETE: RequestHandler = async ({ locals }) => {
    try {
        await revokeApiKey(adminClient(), locals.session!.user.id);
        return json({ key: null });
    } catch (err) {
        console.error('[api-keys] revoke failed:', err);
        return json({ error: 'Could not delete the API key.' }, { status: 500 });
    }
};
