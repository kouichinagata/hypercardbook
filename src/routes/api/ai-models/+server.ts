import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AiTextError, listClaudeModels } from '$lib/server/ai-text';

// ユーザーが登録した Claude API キーで利用できるモデル一覧を返す。
export const GET: RequestHandler = async ({ request, locals }) => {
    if (!locals.session) {
        return json({ error: 'Unauthorized. Please login first.' }, { status: 401 });
    }
    const apiKey = request.headers.get('x-user-anthropic-api-key')?.trim();
    if (!apiKey) {
        return json({ error: 'No Claude API key is registered.' }, { status: 400 });
    }
    try {
        const models = await listClaudeModels(apiKey, AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]));
        return json({ models }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (err) {
        const status = err instanceof AiTextError && err.status >= 400 && err.status < 600 ? err.status : 502;
        return json({ error: err instanceof Error ? err.message : 'Could not load the model list.' }, { status });
    }
};
