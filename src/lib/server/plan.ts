import { env } from '$env/dynamic/private';
export {
    activePromotionFromUser,
    effectivePlanFromUser,
    isPaidPlan,
    isProPlan,
    normalizeMarkdownAiPlan
} from '$lib/plan';
export type { MarkdownAiPlan } from '$lib/plan';

/**
 * 有効なGemini APIキーを返します。
 * ユーザーが設定したカスタムキーがあれば、プランに関わらずそれを優先します。
 */
export function getActiveGeminiApiKey(_session: any, userApiKeyHeader: string | null): string {
    return userApiKeyHeader?.trim() || env.GEMINI_API_KEY || '';
}
