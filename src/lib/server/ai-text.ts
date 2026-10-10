import { GoogleGenAI } from '@google/genai';
import { env } from '$env/dynamic/private';
import { DEFAULT_CLAUDE_MODEL, GEMINI_TEXT_MODEL, validModelId } from '$lib/ai-model';

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

export type TextProvider = 'anthropic' | 'gemini';

export type TextAi = {
	provider: TextProvider;
	model: string;
	/** 選択中プロバイダーのキー */
	apiKey: string;
	/** Claude 障害時のフォールバックと Web 検索に使う Gemini キー（なければ空） */
	geminiKey: string;
};

export class AiTextError extends Error {
	status: number;
	/** 障害・過負荷・通信エラーなど、別プロバイダーで再試行する価値があるか */
	retryable: boolean;
	constructor(message: string, status = 0) {
		super(message);
		this.status = status;
		this.retryable = status === 0 || status === 429 || status >= 500;
	}
}

/**
 * 文章生成に使うAIを決める。
 * - ユーザーが Gemini を選択 かつ Gemini キーあり → Gemini
 * - Claude キー（ユーザーのキー → ANTHROPIC_API_KEY）あり → Claude（選択モデル、未選択なら Haiku）
 * - Claude キーなし かつ Gemini キーあり → Gemini
 * request が null のときはサーバーの環境変数のみで決める。
 */
export function resolveTextAi(request: Request | null): TextAi {
	const header = (name: string) => request?.headers.get(name)?.trim() || '';
	const claudeKey = header('x-user-anthropic-api-key') || env.ANTHROPIC_API_KEY || '';
	const geminiKey = header('x-user-gemini-api-key') || env.GEMINI_API_KEY || '';
	const selected = header('x-user-ai-model');

	if (selected === GEMINI_TEXT_MODEL && geminiKey) {
		return { provider: 'gemini', model: GEMINI_TEXT_MODEL, apiKey: geminiKey, geminiKey };
	}
	if (claudeKey) {
		const model = validModelId(selected) && selected !== GEMINI_TEXT_MODEL ? selected : DEFAULT_CLAUDE_MODEL;
		return { provider: 'anthropic', model, apiKey: claudeKey, geminiKey };
	}
	if (geminiKey) {
		return { provider: 'gemini', model: GEMINI_TEXT_MODEL, apiKey: geminiKey, geminiKey };
	}
	throw new AiTextError('ANTHROPIC_API_KEY is not set. Register a Claude API key in Settings.', 500);
}

function claudeErrorMessage(status: number): string {
	if (status === 401) return 'Claude APIキーが無効です。設定のAPI Keyを確認してください。';
	if (status === 403) return 'Claude APIの利用が許可されていません。キーの権限を確認してください。';
	if (status === 404) return '選択したClaudeモデルが見つかりません。モデル選択を確認してください。';
	if (status === 429) return 'Claude APIの利用上限に達しました。しばらくしてからお試しください。';
	if (status >= 500) return 'Claudeが混雑または障害中です。しばらくしてからお試しください。';
	return `Claude APIでエラーが発生しました（${status}）。`;
}

async function claudeRequest(apiKey: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
	let maxTokens = body.max_tokens as number;
	for (let attempt = 0; attempt < 2; attempt++) {
		let response: Response;
		try {
			response = await fetch(ANTHROPIC_MESSAGES_URL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
				body: JSON.stringify({ ...body, max_tokens: maxTokens }),
				signal
			});
		} catch {
			throw new AiTextError('Claude APIに接続できませんでした。', 0);
		}
		if (response.ok) return response;
		const detail = await response.text().catch(() => '');
		// 出力上限が小さい旧モデルでは、上限値に合わせて一度だけ再試行する。
		const cap = response.status === 400 ? /max_tokens: \d+ > (\d+)/.exec(detail) : null;
		if (cap && attempt === 0 && Number(cap[1]) > 0) {
			maxTokens = Number(cap[1]);
			continue;
		}
		throw new AiTextError(claudeErrorMessage(response.status), response.status);
	}
	throw new AiTextError('Claude APIでエラーが発生しました。', 400);
}

/** モデルが返した文字列から JSON 本体だけを取り出す（コードフェンスや前置きを除去）。 */
export function extractJson(text: string): string {
	let value = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
	if (!value.startsWith('{') && !value.startsWith('[')) {
		const start = value.indexOf('{');
		const end = value.lastIndexOf('}');
		if (start !== -1 && end > start) value = value.slice(start, end + 1);
	}
	return value;
}

type TextRequest = { system: string; user: string; json?: boolean; signal?: AbortSignal };

async function claudeText(ai: TextAi, { system, user, json, signal }: TextRequest): Promise<string> {
	const response = await claudeRequest(ai.apiKey, {
		model: ai.model,
		max_tokens: 8000,
		system: json ? `${system}\n\nReturn ONLY one valid JSON value. Do not use Markdown code fences or add any other text.` : system,
		messages: [{ role: 'user', content: user }]
	}, signal);
	const data = await response.json();
	const text = (data.content || []).filter((block: any) => block.type === 'text').map((block: any) => block.text).join('');
	return json ? extractJson(text) : text;
}

async function geminiText(apiKey: string, { system, user, json }: TextRequest): Promise<string> {
	const gemini = new GoogleGenAI({ apiKey });
	const response = await gemini.models.generateContent({
		model: GEMINI_TEXT_MODEL,
		contents: [{ role: 'user', parts: [{ text: user }] }],
		config: { systemInstruction: system, temperature: 0.2, ...(json ? { responseMimeType: 'application/json' } : {}) }
	});
	const text = response.text || '';
	return json ? extractJson(text) : text;
}

/** 1回完結のテキスト（JSON）生成。Claude が障害・過負荷のときは Gemini キーがあれば Gemini で再試行する。 */
export async function generateAiText(ai: TextAi, request: TextRequest): Promise<string> {
	if (ai.provider === 'gemini') return geminiText(ai.apiKey, request);
	try {
		return await claudeText(ai, request);
	} catch (err) {
		if (err instanceof AiTextError && err.retryable && ai.geminiKey) {
			console.error('Claude unavailable, falling back to Gemini:', err.message);
			return geminiText(ai.geminiKey, request);
		}
		throw err;
	}
}

/** Gemini 形式のスキーマ（type が OBJECT/STRING 等の大文字）を JSON Schema へ変換する。 */
export function toJsonSchema(schema: any): any {
	if (Array.isArray(schema)) return schema.map(toJsonSchema);
	if (!schema || typeof schema !== 'object') return schema;
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(schema)) {
		result[key] = key === 'type' && typeof value === 'string' ? value.toLowerCase() : toJsonSchema(value);
	}
	return result;
}

export type ClaudeMessage = { role: 'user' | 'assistant'; content: string | any[] };

/** Gemini 形式の会話履歴（role: user/model, parts: [{text}]）を Claude の messages へ変換する。 */
export function toClaudeMessages(contents: { role: string; parts: { text?: string }[] }[]): ClaudeMessage[] {
	const messages: ClaudeMessage[] = [];
	for (const item of contents) {
		const text = (item.parts || []).map((part) => part.text || '').join('');
		if (!text.trim()) continue;
		const role = item.role === 'user' ? 'user' : 'assistant';
		const last = messages.at(-1);
		if (last && last.role === role && typeof last.content === 'string') last.content += `\n\n${text}`;
		else messages.push({ role, content: text });
	}
	// 先頭は user でなければならない。
	while (messages.length && messages[0].role !== 'user') messages.shift();
	return messages;
}

export type ClaudeTurn = {
	calls: { id: string; name: string; args: any }[];
	/** 次のターンの履歴に積む assistant のコンテンツ */
	content: any[];
	stopReason: string;
};

/** Claude を1ターン（ストリーミング）実行する。本文は onText に逐次渡し、ツール呼び出しは calls に集める。 */
export async function streamClaudeTurn(options: {
	apiKey: string;
	model: string;
	system: string;
	messages: ClaudeMessage[];
	tools?: { name: string; description: string; input_schema: unknown }[];
	maxTokens?: number;
	onText: (text: string) => void;
	signal?: AbortSignal;
}): Promise<ClaudeTurn> {
	const response = await claudeRequest(options.apiKey, {
		model: options.model,
		max_tokens: options.maxTokens ?? 32000,
		system: [{ type: 'text', text: options.system, cache_control: { type: 'ephemeral' } }],
		messages: options.messages,
		stream: true,
		...(options.tools?.length ? { tools: options.tools, tool_choice: { type: 'auto' } } : {})
	}, options.signal);
	if (!response.body) throw new AiTextError('Claudeの返答がありません。', 502);

	const blocks: any[] = [];
	let stopReason = '';
	const receive = (event: any) => {
		if (event.type === 'error') {
			const kind = event.error?.type;
			throw new AiTextError(kind === 'overloaded_error' ? claudeErrorMessage(529) : 'Claudeの応答が中断しました。', kind === 'overloaded_error' || kind === 'api_error' ? 529 : 502);
		}
		if (event.type === 'content_block_start') {
			blocks[event.index] = { ...event.content_block, partial: '' };
			if (event.content_block.type === 'text' && event.content_block.text) options.onText(event.content_block.text);
		} else if (event.type === 'content_block_delta') {
			const block = blocks[event.index];
			if (event.delta.type === 'text_delta') {
				block.text = (block.text || '') + event.delta.text;
				options.onText(event.delta.text);
			} else if (event.delta.type === 'input_json_delta') {
				block.partial += event.delta.partial_json;
			}
		} else if (event.type === 'content_block_stop') {
			const block = blocks[event.index];
			if (block?.type === 'tool_use') {
				try {
					block.input = block.partial ? JSON.parse(block.partial) : {};
				} catch {
					block.input = {};
				}
			}
		} else if (event.type === 'message_delta' && event.delta?.stop_reason) {
			stopReason = event.delta.stop_reason;
		}
	};

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let pending = '';
	const frame = (raw: string) => {
		const data = raw.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
		if (data && data !== '[DONE]') receive(JSON.parse(data));
	};
	try {
		while (true) {
			const { value, done } = await reader.read();
			pending += decoder.decode(value, { stream: !done });
			let match: RegExpExecArray | null;
			while ((match = /\r?\n\r?\n/.exec(pending))) {
				frame(pending.slice(0, match.index));
				pending = pending.slice(match.index + match[0].length);
			}
			if (done) break;
		}
		if (pending.trim()) frame(pending);
	} catch (err) {
		if (err instanceof AiTextError) throw err;
		throw new AiTextError('Claudeとの通信が途中で切れました。', 502);
	} finally {
		await reader.cancel().catch(() => {});
	}

	const content = blocks
		.filter((block) => block && (block.type === 'tool_use' || (block.type === 'text' && block.text)))
		.map((block) => block.type === 'tool_use'
			? { type: 'tool_use', id: block.id, name: block.name, input: block.input ?? {} }
			: { type: 'text', text: block.text });
	const calls = content.filter((block) => block.type === 'tool_use').map((block) => ({ id: block.id, name: block.name, args: block.input }));
	return { calls, content, stopReason };
}

/** 登録済みキーで利用できる Claude モデル一覧（新しい順）を取得する。 */
export async function listClaudeModels(apiKey: string, signal?: AbortSignal): Promise<{ id: string; name: string }[]> {
	const models = new Map<string, string>();
	let after = '';
	for (let page = 0; page < 10; page++) {
		const url = new URL('https://api.anthropic.com/v1/models');
		url.searchParams.set('limit', '1000');
		if (after) url.searchParams.set('after_id', after);
		let response: Response;
		try {
			response = await fetch(url, { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, signal });
		} catch {
			throw new AiTextError('Claude APIに接続できませんでした。', 0);
		}
		if (!response.ok) {
			await response.body?.cancel().catch(() => {});
			throw new AiTextError(claudeErrorMessage(response.status), response.status);
		}
		const data = await response.json();
		for (const row of data.data || []) {
			if (validModelId(row.id) && row.id.startsWith('claude')) models.set(row.id, String(row.display_name || row.id).replace(/[\r\n]+/g, ' ').slice(0, 100));
		}
		if (!data.has_more || !data.last_id || data.last_id === after) break;
		after = data.last_id;
	}
	return [...models].map(([id, name]) => ({ id, name }));
}
