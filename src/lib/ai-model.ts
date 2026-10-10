// 文章生成AIのモデル定義（サーバー・ブラウザ共通）。画像生成は generate-image で別に指定。
export const DEFAULT_CLAUDE_MODEL = 'claude-haiku-5-5';
export const DEFAULT_CLAUDE_LABEL = 'Claude Haiku 5.5';
// Gemini は Web 検索と、Claude 障害時のフォールバックに使う。
export const GEMINI_TEXT_MODEL = 'gemini-3.8-flash';
export const GEMINI_TEXT_LABEL = 'Gemini 3.8 Flash';

export const AI_MODEL_STORAGE_KEY = 'user_ai_model';
export const AI_KEYS_CHANGED_EVENT = 'hcb-ai-keys-changed';

export function validModelId(value: unknown): value is string {
	return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(value);
}

function readStorage(key: string): string {
	try {
		return localStorage.getItem(key)?.trim() || '';
	} catch {
		return '';
	}
}

/** AI を呼ぶ API に付けるヘッダー（ユーザーのキーと選択モデル）。ブラウザ専用。 */
export function aiRequestHeaders(): Record<string, string> {
	if (typeof window === 'undefined') return {};
	const headers: Record<string, string> = {};
	const gemini = readStorage('user_gemini_api_key');
	const anthropic = readStorage('user_anthropic_api_key');
	const model = readStorage(AI_MODEL_STORAGE_KEY);
	if (gemini) headers['x-user-gemini-api-key'] = gemini;
	if (anthropic) headers['x-user-anthropic-api-key'] = anthropic;
	if (validModelId(model)) headers['x-user-ai-model'] = model;
	return headers;
}
