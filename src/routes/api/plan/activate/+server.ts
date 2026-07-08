import { json } from '@sveltejs/kit';
import { createHash } from 'crypto';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
    const supabase = locals.supabase;
    const session = locals.session;

    if (!session?.user?.id) {
        return json({ error: 'Unauthorized. Please login first.' }, { status: 401 });
    }

    try {
        const { plan, code } = await request.json();

        if (!['free', 'standard', 'pro', 'enterprise'].includes(plan)) {
            return json({ error: 'Invalid plan specified.' }, { status: 400 });
        }

        // 1. Identify Admin
        const userEmail = session.user.email || '';
        const adminEmailsEnv = env.ADMIN_EMAILS || 'kouichi.nagata@gmail.com';
        const adminEmails = adminEmailsEnv.split(',').map(e => e.trim().toLowerCase());
        const isAdmin = adminEmails.includes(userEmail.toLowerCase());

        // For non-admin users, validate activation codes for paid plans
        if (!isAdmin) {
            if (plan === 'standard') {
                const targetHash = env.STANDARD_ACTIVATION_CODE_HASH || '945e45a2ad8d39ff4e69b596f29630e2f5b4a0f4a86f7b1df639c054238e8334';
                if (!code) {
                    return json({ error: 'Activation code is required for Standard plan.' }, { status: 400 });
                }
                const inputHash = createHash('sha256').update(code).digest('hex');
                if (inputHash !== targetHash) {
                    return json({ error: 'Invalid activation code.' }, { status: 400 });
                }
            } else if (plan === 'pro') {
                const targetHash = env.PRO_ACTIVATION_CODE_HASH || '5ea751d3840e698ab9cb463c1a3577d6ad741f2fb8350cc8b91563f684cf0423';
                if (!code) {
                    return json({ error: 'Activation code is required for Pro plan.' }, { status: 400 });
                }
                const inputHash = createHash('sha256').update(code).digest('hex');
                if (inputHash !== targetHash) {
                    return json({ error: 'Invalid activation code.' }, { status: 400 });
                }
            } else if (plan === 'enterprise') {
                const targetHash = env.ENTERPRISE_ACTIVATION_CODE_HASH || 'fdf2998a65c92842e1329a28e75db353fef18f972b9a7c06eb18369324c4f3fa';
                if (!code) {
                    return json({ error: 'Activation code is required for Enterprise plan.' }, { status: 400 });
                }
                const inputHash = createHash('sha256').update(code).digest('hex');
                if (inputHash !== targetHash) {
                    return json({ error: 'Invalid activation code.' }, { status: 400 });
                }
            }
        }

        // 2. Update user metadata
        const { error } = await supabase.auth.updateUser({
            data: {
                plan: plan
            }
        });

        if (error) {
            console.error('Failed to update user plan metadata:', error);
            return json({ error: 'Failed to update plan. Please try again.' }, { status: 500 });
        }

        return json({ success: true, plan: plan });
    } catch (err: any) {
        console.error('Activation API error:', err);
        return json({ error: err.message || 'An unexpected error occurred.' }, { status: 500 });
    }
};
