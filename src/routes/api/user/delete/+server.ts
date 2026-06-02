import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
    try {
        const session = locals.session;
        if (!session) {
            return json({ error: 'Unauthorized. Please login first.' }, { status: 401 });
        }

        const { email, password } = await request.json();
        if (!email || !password) {
            return json({ error: 'Email and password are required for reauthentication.' }, { status: 400 });
        }

        // 1. Verify user identity by trying to sign in with provided credentials
        const supabaseUrl = publicEnv.PUBLIC_SUPABASE_URL || env.PUBLIC_SUPABASE_URL || '';
        const supabaseAnonKey = publicEnv.PUBLIC_SUPABASE_ANON_KEY || env.PUBLIC_SUPABASE_ANON_KEY || '';
        
        // Setup a temporary client to verify the password
        const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
            auth: { persistSession: false, autoRefreshToken: false }
        });

        const { data: authData, error: authError } = await tempClient.auth.signInWithPassword({
            email,
            password
        });

        if (authError || !authData.user || authData.user.id !== session.user.id) {
            return json({ error: 'Incorrect email or password. Unable to delete account.' }, { status: 401 });
        }

        // 2. Perform account deletion using Service Role Key admin privileges
        const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
        if (!serviceRoleKey) {
            console.error('SUPABASE_SERVICE_ROLE_KEY is not defined in environment variables.');
            return json({ error: 'Server configuration error.' }, { status: 500 });
        }

        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });

        const userId = session.user.id;
        console.log(`Attempting to delete user: ${userId}`);

        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (deleteError) {
            console.error('Supabase admin deleteUser error:', deleteError);
            return json({ error: deleteError.message }, { status: 500 });
        }

        // 3. Clear session cookies on the server side
        // Supabase SSR uses 'sb-' prefixed cookies to store the session.
        // We delete them or let SvelteKit clear everything.
        const allCookies = cookies.getAll();
        allCookies.forEach(cookie => {
            if (cookie.name.startsWith('sb-')) {
                cookies.delete(cookie.name, { path: '/' });
            }
        });

        return json({ success: true });
    } catch (err: any) {
        console.error('Delete account API error:', err);
        return json({ error: err.message || 'Failed to delete account.' }, { status: 500 });
    }
};
