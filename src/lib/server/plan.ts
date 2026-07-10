import { env } from '$env/dynamic/private';

/**
 * ユーザーのプランとカスタムAPIキーヘッダーを検証し、有効なGemini APIキーを返します。
 * ProまたはEnterpriseプランの場合のみ、ヘッダーのカスタムキーの適用を許可します。
 */
export function getActiveGeminiApiKey(session: any, userApiKeyHeader: string | null): string {
    const userMetadata = session?.user?.user_metadata || {};
    const plan = userMetadata.plan || 'free';
    const canUseCustomApiKey = plan === 'pro' || plan === 'enterprise';
    
    const userApiKey = canUseCustomApiKey ? userApiKeyHeader : null;
    return userApiKey || env.GEMINI_API_KEY || '';
}
