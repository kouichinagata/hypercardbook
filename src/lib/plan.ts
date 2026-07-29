import type { User } from '@supabase/supabase-js';

export type MarkdownAiPlan = 'free' | 'standard' | 'pro' | 'enterprise';

const planRank: Record<MarkdownAiPlan, number> = {
    free: 0,
    standard: 1,
    pro: 2,
    enterprise: 3
};

export function normalizeMarkdownAiPlan(value: unknown): MarkdownAiPlan {
    if (value === 'standard' || value === 'pro' || value === 'enterprise') return value;
    return 'free';
}

export function effectivePlanFromUser(
    user: Pick<User, 'app_metadata'> | null | undefined,
    now = Date.now()
): MarkdownAiPlan {
    const metadata = user?.app_metadata || {};
    const basePlan = normalizeMarkdownAiPlan(metadata.plan);
    const promotionPlan = normalizeMarkdownAiPlan(metadata.promotion_plan);
    const promotionExpiresAt = Date.parse(String(metadata.promotion_expires_at || ''));
    const promotionIsActive =
        promotionPlan !== 'free' &&
        Number.isFinite(promotionExpiresAt) &&
        promotionExpiresAt > now;

    if (!promotionIsActive || planRank[basePlan] >= planRank[promotionPlan]) return basePlan;
    return promotionPlan;
}

export function activePromotionFromUser(
    user: Pick<User, 'app_metadata'> | null | undefined,
    now = Date.now()
): { plan: MarkdownAiPlan; expiresAt: string } | null {
    const metadata = user?.app_metadata || {};
    const plan = normalizeMarkdownAiPlan(metadata.promotion_plan);
    const expiresAt = String(metadata.promotion_expires_at || '');
    const expiresAtMs = Date.parse(expiresAt);

    if (plan === 'free' || !Number.isFinite(expiresAtMs) || expiresAtMs <= now) return null;
    return { plan, expiresAt };
}

export function isPaidPlan(plan: MarkdownAiPlan) {
    return plan === 'standard' || plan === 'pro' || plan === 'enterprise';
}

export function isProPlan(plan: MarkdownAiPlan) {
    return plan === 'pro' || plan === 'enterprise';
}
