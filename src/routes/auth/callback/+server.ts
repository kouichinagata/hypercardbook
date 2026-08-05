import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies, locals: { supabase } }) => {
    const code = url.searchParams.get('code');
    const encodedCookieNext = cookies.get('hypercardbook_auth_next') || '';
    cookies.delete('hypercardbook_auth_next', { path: '/' });
    let cookieNext = '/';
    try {
        cookieNext = encodedCookieNext
            ? (encodedCookieNext.startsWith('/') ? encodedCookieNext : decodeURIComponent(encodedCookieNext))
            : '/';
    } catch {
        cookieNext = '/';
    }
    const requestedNext = url.searchParams.get('next') ?? cookieNext;
    const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/';

    if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
            throw redirect(303, next);
        }
        console.error('OAuth code exchange failed:', error);
    }

    throw redirect(303, '/');
};
