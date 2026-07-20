import { createServerClient } from '@supabase/ssr';
import { type Handle, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

export const handle: Handle = async ({ event, resolve }) => {
    event.locals.supabase = createServerClient(
        publicEnv.PUBLIC_SUPABASE_URL || env.PUBLIC_SUPABASE_URL || '',
        publicEnv.PUBLIC_SUPABASE_ANON_KEY || env.PUBLIC_SUPABASE_ANON_KEY || '',
        {
            cookies: {
                getAll() {
                    return event.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        event.cookies.set(name, value, { ...options, path: '/' });
                    });
                }
            }
        }
    );

    event.locals.safeGetSession = async () => {
        const {
            data: { session }
        } = await event.locals.supabase.auth.getSession();
        if (!session) {
            return { session: null, user: null };
        }

        const {
            data: { user },
            error
        } = await event.locals.supabase.auth.getUser();
        if (error) {
            return { session: null, user: null };
        }

        return { session, user };
    };

    const { session, user } = await event.locals.safeGetSession();
    event.locals.session = session;
    event.locals.user = user;

    const pathname = event.url.pathname;
    const isProtectedRoute = pathname.startsWith('/workspace');
    const isApiRoute = pathname.startsWith('/api/') &&
                       !pathname.startsWith('/api/paperobo/published-notification') &&
                       !pathname.startsWith('/api/paperobo/call-history') &&
                       !pathname.startsWith('/api/hypertv/scenario') &&
                       !pathname.startsWith('/api/skills/css');

    if ((isProtectedRoute || isApiRoute) && !session) {
        if (isApiRoute) {
            return new Response(JSON.stringify({ error: 'Unauthorized. Please login first.' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        throw redirect(303, '/login');
    }

    if (pathname === '/login' && session) {
        throw redirect(303, '/');
    }

    return resolve(event, {
        filterSerializedResponseHeaders(name) {
            return name === 'content-range' || name === 'x-supabase-api-version';
        }
    });
};
