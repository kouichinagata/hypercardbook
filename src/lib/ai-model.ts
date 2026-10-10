// 文章生成AIのモデル定義（サーバー・ブラウザ共通）。画像生成は generate-image で別に指定。
export const DEFAULT_CLAUDE_MODEL = 'claude-haiku-5-5';
export const DEFAULT_CLAUDE_LABEL = 'Claude Haiku 5.5';
// Gemini は Web 検索と、Claude 障害時のフォールバックに使う。
export const GEMINI_TEXT_MODEL = 'gemini-3.8-flash';
export const GEMINI_TEXT_LABEL = 'Gemini 3.8 Flash';

export const AI_MODEL_STORAGE_KEY = 'user_ai_model';
// 画像モードで選ぶ画像生成モデル（自分の Gemini キーがあるときだけ有効。localStorage）
export const IMAGE_MODEL_STORAGE_KEY = 'user_image_model';
export const AI_KEYS_CHANGED_EVENT = 'hcb-ai-keys-changed';

// 画像生成モデル（Google 公式の名称。https://ai.google.dev/gemini-api/docs/image-generation）。Interactions API で共通に使える。
export const IMAGE_MODELS = [
	{ id: 'gemini-3.1-flash-lite-image', label: 'Nano Banana 2 Lite' },
	{ id: 'gemini-nano-banana-2.1', label: 'Nano Banana 2.1' },
	{ id: 'gemini-3-pro-image', label: 'Nano Banana Pro' }
] as const;
// 標準は Nano Banana 2.1（画像の出力料金は Lite と同じ。入力料金は高い）
export const DEFAULT_IMAGE_MODEL = IMAGE_MODELS[1].id;

export function isImageModelId(value: unknown): value is string {
	return IMAGE_MODELS.some((m) => m.id === value);
}

export function imageModelLabel(id: string): string {
	return IMAGE_MODELS.find((m) => m.id === id)?.label ?? id;
}

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

/** 自分の Gemini キーを登録しているか。ブラウザ専用。 */
export function hasUserGeminiKey(): boolean {
	return Boolean(readStorage('user_gemini_api_key'));
}

/** 選択中の画像モデル。キー未登録、または未選択・不正な値のときは既定（Lite）。ブラウザ専用。 */
export function selectedImageModel(): string {
	const saved = readStorage(IMAGE_MODEL_STORAGE_KEY);
	return hasUserGeminiKey() && isImageModelId(saved) ? saved : DEFAULT_IMAGE_MODEL;
}

/** /api/generate-image に付けるヘッダー（ユーザーの Gemini キーと選択した画像モデル）。ブラウザ専用。 */
export function imageRequestHeaders(): Record<string, string> {
	if (typeof window === 'undefined') return {};
	const headers: Record<string, string> = {};
	const gemini = readStorage('user_gemini_api_key');
	if (gemini) {
		headers['x-user-gemini-api-key'] = gemini;
		headers['x-user-image-model'] = selectedImageModel();
	}
	return headers;
}
