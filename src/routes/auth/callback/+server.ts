import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
    const code = url.searchParams.get('code');
    const requestedNext = url.searchParams.get('next') ?? '/';
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
