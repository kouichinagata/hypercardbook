import { env } from '$env/dynamic/private';
import { effectivePlanFromUser, isProPlan } from '$lib/plan';

export {
    activePromotionFromUser,
    effectivePlanFromUser,
    isPaidPlan,
    isProPlan,
    normalizeMarkdownAiPlan
} from '$lib/plan';
export type { MarkdownAiPlan } from '$lib/plan';

/**
 * ユーザーのプランとカスタムAPIキーヘッダーを検証し、有効なGemini APIキーを返します。
 * ProまたはEnterpriseプランの場合のみ、ヘッダーのカスタムキーの適用を許可します。
 */
export function getActiveGeminiApiKey(session: any, userApiKeyHeader: string | null): string {
    const canUseCustomApiKey = isProPlan(effectivePlanFromUser(session?.user));
    
    const userApiKey = canUseCustomApiKey ? userApiKeyHeader : null;
    return userApiKey || env.GEMINI_API_KEY || '';
}
