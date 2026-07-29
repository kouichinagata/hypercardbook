import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import type { RequestHandler } from './$types';

const allowedPlans = new Set(['free', 'standard', 'pro', 'enterprise']);

export const POST: RequestHandler = async ({ request, locals }) => {
    const session = locals.session;
    if (!session?.user?.id) {
        return json({ error: 'Unauthorized. Please login first.' }, { status: 401 });
    }

    try {
        const { plan, code } = await request.json();
        if (!allowedPlans.has(plan)) {
            return json({ error: 'Invalid plan specified.' }, { status: 400 });
        }

        const supabaseUrl = publicEnv.PUBLIC_SUPABASE_URL || env.PUBLIC_SUPABASE_URL || '';
        const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
        if (!supabaseUrl || !serviceRoleKey) {
            console.error('Plan activation service role client is not configured.');
            return json({ error: 'Plan activation is not configured.' }, { status: 500 });
        }

        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });

        const userEmail = session.user.email || '';
        const adminEmailsEnv = env.ADMIN_EMAILS || 'kouichi.nagata@gmail.com';
        const adminEmails = adminEmailsEnv.split(',').map((email) => email.trim().toLowerCase());
        const isAdmin = adminEmails.includes(userEmail.toLowerCase());

        if (isAdmin || plan === 'free') {
            const currentAppMetadata = session.user.app_metadata || {};
            const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
                session.user.id,
                {
                    app_metadata: {
                        ...currentAppMetadata,
                        plan,
                        promotion_plan: null,
                        promotion_expires_at: null,
                        promotion_code_id: null
                    }
                }
            );

            if (updateError) {
                console.error('Failed to update permanent plan metadata:', updateError);
                return json({ error: 'Failed to update plan. Please try again.' }, { status: 500 });
            }

            return json({ success: true, plan, promotionExpiresAt: null });
        }

        const normalizedCode = typeof code === 'string' ? code.trim() : '';
        if (!normalizedCode) {
            return json({ error: `Activation code is required for ${plan} plan.` }, { status: 400 });
        }

        const codeHash = createHash('sha256').update(normalizedCode).digest('hex');
        const { data, error: redeemError } = await supabaseAdmin.rpc('redeem_plan_promotion', {
            p_code_hash: codeHash,
            p_user_id: session.user.id,
            p_expected_plan: plan
        });

        if (redeemError) {
            const message = promotionErrorMessage(redeemError.message);
            const status = message === 'Plan promotion service is not configured.' ? 500 : 400;
            if (status === 500) console.error('Promotion redemption failed:', redeemError);
            return json({ error: message }, { status });
        }

        const redemption = Array.isArray(data) ? data[0] : data;
        if (!redemption?.promotion_plan || !redemption?.expires_at) {
            console.error('Promotion redemption returned an invalid response:', data);
            return json({ error: 'Plan activation returned an invalid response.' }, { status: 500 });
        }

        return json({
            success: true,
            plan: redemption.promotion_plan,
            promotionExpiresAt: redemption.expires_at
        });
    } catch (error: any) {
        console.error('Activation API error:', error);
        return json({ error: error.message || 'An unexpected error occurred.' }, { status: 500 });
    }
};

function promotionErrorMessage(message: string) {
    if (message.includes('promotion_code_inactive')) return 'This activation code is inactive.';
    if (message.includes('promotion_code_not_started')) return 'This activation code is not available yet.';
    if (message.includes('promotion_code_expired')) return 'This activation code has expired.';
    if (message.includes('promotion_code_limit_reached')) return 'This activation code has reached its usage limit.';
    if (message.includes('promotion_plan_not_upgrade')) return 'Your current plan already includes this access.';
    if (message.includes('promotion_code_already_redeemed')) return 'You have already used this activation code.';
    if (message.includes('promotion_already_active')) return 'Another promotional plan is already active.';
    if (message.includes('promotion_code_invalid')) return 'Invalid activation code.';
    if (message.includes('Could not find the function') || message.includes('schema cache')) {
        return 'Plan promotion service is not configured.';
    }
    return 'Could not activate this promotion code.';
}
