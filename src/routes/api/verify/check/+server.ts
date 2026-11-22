import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from './$types';
import { adminClient } from '$lib/server/signatures';
import { checkMarkdown, MAX_MARKDOWN_LENGTH } from '$lib/server/verify-check';
import { createRateLimiter } from '$lib/server/rate-limit';

// Shared Verify API: the anonymous Verify Checker card, and later Realtime Verify, PapeRobo, company AI and other systems.
// Anonymous callers are limited per IP; a caller with an API key (MARKDOWN_VERIFY_API_KEYS, comma separated) per key.
// The submitted Markdown is never logged or stored.

const anonymousLimit = createRateLimiter(10, 60_000);
const keyLimit = createRateLimiter(120, 60_000);
const NO_STORE = { 'Cache-Control': 'no-store' };

function apiKeyFrom(request: Request): string | null | false {
    const header = request.headers.get('authorization');
    if (!header) return null;
    const received = Buffer.from(header.replace(/^Bearer\s+/i, '').trim());
    const keys = (env.MARKDOWN_VERIFY_API_KEYS || '').split(',').map((k) => k.trim()).filter(Boolean);
    for (const key of keys) {
        const expected = Buffer.from(key);
        if (expected.length === received.length && timingSafeEqual(expected, received)) return key;
    }
    return false;
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
    const apiKey = apiKeyFrom(request);
    if (apiKey === false) return json({ ok: false, result: 'unverifiable', reason: 'invalid_api_key', error: 'Invalid API key.' }, { status: 401, headers: NO_STORE });

    const limit = apiKey ? keyLimit.take(`key:${apiKey}`) : anonymousLimit.take(`ip:${getClientAddress()}`);
    if (!limit.allowed) {
        return json({ ok: false, result: 'unverifiable', reason: 'rate_limited', error: 'Too many requests. Please wait and try again.' }, { status: 429, headers: { ...NO_STORE, 'Retry-After': String(limit.retryAfter) } });
    }

    // A character takes at most six bytes in JSON (\uXXXX), plus room for the id
    if (Number(request.headers.get('content-length') || 0) > MAX_MARKDOWN_LENGTH * 6 + 4096) {
        return json({ ok: false, result: 'unverifiable', reason: 'invalid_request', error: 'The Markdown is too large.' }, { status: 413, headers: NO_STORE });
    }
    let body: { verifyId?: unknown; markdown?: unknown };
    try {
        body = await request.json();
    } catch {
        return json({ ok: false, result: 'unverifiable', reason: 'invalid_request', error: 'Send JSON with verifyId and markdown.' }, { status: 400, headers: NO_STORE });
    }

    let admin;
    try {
        admin = adminClient();
    } catch {
        console.error('[verify-check] the database is not configured');
        return json({ ok: false, result: 'unverifiable', reason: 'unavailable', error: 'The verification service is unavailable. Please try again later.' }, { status: 503, headers: NO_STORE });
    }
    const outcome = await checkMarkdown(admin, body?.verifyId, body?.markdown);
    return json(outcome.body, { status: outcome.status, headers: NO_STORE });
};
