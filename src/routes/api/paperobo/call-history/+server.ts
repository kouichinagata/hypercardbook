import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

const specialBookKey = 'call_history';
const sourceApp = 'paperobo';

type PapeRoboCallHistoryPayload = {
	action?: unknown;
	version?: unknown;
	call?: {
		callId?: unknown;
		startedAt?: unknown;
		endedAt?: unknown;
		durationSeconds?: unknown;
		endReason?: unknown;
		locale?: unknown;
	};
	historyOwner?: {
		type?: unknown;
		supabaseUserId?: unknown;
	};
	user?: {
		paperoboUserId?: unknown;
		supabaseUserId?: unknown;
		email?: unknown;
		displayName?: unknown;
		isAnonymous?: unknown;
	};
	agent?: {
		agentId?: unknown;
		publicId?: unknown;
		name?: unknown;
		voice?: unknown;
		launchUrl?: unknown;
		thumbnailUrl?: unknown;
	};
	transcript?: Array<{
		id?: unknown;
		role?: unknown;
		speakerName?: unknown;
		text?: unknown;
		at?: unknown;
		source?: unknown;
	}>;
	artifacts?: unknown;
	links?: unknown;
	metadata?: Record<string, unknown>;
};

type CallHistoryBookRow = {
	id: string;
	markdown_content?: string | null;
	created_at?: string | null;
	updated_at?: string | null;
};

export const POST: RequestHandler = async ({ request, url }) => {
	try {
		const authHeader = request.headers.get('Authorization') || '';
		const token = authHeader.replace(/^Bearer\s+/i, '').trim();
		const expectedSecret = env.HYPERCARDBOOK_SHARED_SECRET || process.env.HYPERCARDBOOK_SHARED_SECRET || '';

		if (!expectedSecret) {
			console.error('Integration Error: HYPERCARDBOOK_SHARED_SECRET is not configured on the server.');
			return jsonError('server_misconfigured', 'Server integration is misconfigured.', 500);
		}

		if (token !== expectedSecret) {
			return jsonError('unauthorized', 'Unauthorized integration token.', 401);
		}

		const payload = (await request.json().catch(() => ({}))) as PapeRoboCallHistoryPayload;
		const validated = validatePayload(payload);
		if (!validated.ok) {
			return jsonError('invalid_payload', validated.error, 400);
		}

		const supabaseUrl = publicEnv.PUBLIC_SUPABASE_URL || env.PUBLIC_SUPABASE_URL || '';
		const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || '';

		if (!supabaseUrl || !serviceRoleKey) {
			console.error('Integration Error: Supabase service role client is not configured.');
			return jsonError('server_misconfigured', 'Server integration is misconfigured.', 500);
		}

		const supabase = createClient(supabaseUrl, serviceRoleKey, {
			auth: {
				persistSession: false,
				autoRefreshToken: false
			}
		});

		const ownerUserId = validated.ownerUserId;
		const bookSlug = 'paperobo-call-history';
		const now = new Date().toISOString();

		const { data: exactBooks, error: findBookError } = await supabase
			.from('books')
			.select('id, markdown_content, created_at, updated_at')
			.eq('user_id', ownerUserId)
			.eq('slug', bookSlug);

		if (findBookError) {
			console.error('Failed to load call history book:', findBookError);
			return jsonError('database_error', findBookError.message, 500);
		}

		const existingBook = chooseCanonicalBook(exactBooks || []);
		const previousMarkdown = existingBook?.markdown_content || buildInitialBookMarkdown();
		const { markdown, created } = upsertCallPage(previousMarkdown, validated.payload);
		const bookData = {
			user_id: ownerUserId,
			slug: bookSlug,
			title: 'Call history',
			author: 'PapeRobo',
			cover_image: null,
			theme_color: 'green',
			markdown_content: markdown,
			is_public: false,
			published_at: null
		};

		const { data: savedBook, error: saveError } = existingBook
			? await supabase
					.from('books')
					.update(bookData)
					.eq('id', existingBook.id)
					.select('id')
					.single()
			: await supabase.from('books').insert(bookData).select('id').single();

		if (saveError || !savedBook) {
			console.error('Failed to save call history book:', saveError);
			return jsonError('database_error', saveError?.message || 'Book could not be saved.', 500);
		}

		return json({
			ok: true,
			bookId: savedBook.id,
			pageId: validated.payload.call.callId,
			openUrl: `${url.origin}/hyperbook/${savedBook.id}?page=1`,
			created,
			updatedAt: now
		});
	} catch (err: any) {
		console.error('Call history webhook execution error:', err);
		return jsonError('internal_error', err.message || 'Internal server error.', 500);
	}
};

function validatePayload(payload: PapeRoboCallHistoryPayload):
	| { ok: true; ownerUserId: string; payload: NormalizedPayload }
	| { ok: false; error: string } {
	if (payload.action !== 'upsert_call_history') return { ok: false, error: 'action is invalid.' };
	if (payload.version !== 1) return { ok: false, error: 'version is invalid.' };

	const ownerUserId = stringValue(payload.historyOwner?.supabaseUserId);
	const callId = stringValue(payload.call?.callId);
	const startedAt = stringValue(payload.call?.startedAt);
	const endedAt = stringValue(payload.call?.endedAt);
	const agentName = stringValue(payload.agent?.name);
	const transcript = Array.isArray(payload.transcript)
		? payload.transcript
				.map((entry, index) => {
					const role: 'user' | 'assistant' | 'system' =
						entry.role === 'user' || entry.role === 'assistant' || entry.role === 'system'
							? entry.role
							: 'system';
					return {
						id: stringValue(entry.id) || `turn_${String(index + 1).padStart(4, '0')}`,
						role,
						speakerName: stringValue(entry.speakerName) || role,
						text: stringValue(entry.text),
						at: stringValue(entry.at),
						source: stringValue(entry.source)
					};
				})
				.filter((entry) => entry.text)
		: [];

	if (!ownerUserId) return { ok: false, error: 'historyOwner.supabaseUserId is required.' };
	if (!callId) return { ok: false, error: 'call.callId is required.' };
	if (!startedAt) return { ok: false, error: 'call.startedAt is required.' };
	if (!endedAt) return { ok: false, error: 'call.endedAt is required.' };
	if (!agentName) return { ok: false, error: 'agent.name is required.' };
	if (transcript.length === 0) return { ok: false, error: 'transcript is required.' };

	return {
		ok: true,
		ownerUserId,
		payload: {
			call: {
				callId,
				startedAt,
				endedAt,
				durationSeconds: numberValue(payload.call?.durationSeconds),
				endReason: stringValue(payload.call?.endReason),
				locale: stringValue(payload.call?.locale)
			},
			user: {
				paperoboUserId: stringValue(payload.user?.paperoboUserId),
				supabaseUserId: stringValue(payload.user?.supabaseUserId),
				email: stringValue(payload.user?.email),
				displayName: stringValue(payload.user?.displayName),
				isAnonymous: payload.user?.isAnonymous === true
			},
			agent: {
				agentId: stringValue(payload.agent?.agentId),
				publicId: stringValue(payload.agent?.publicId),
				name: agentName,
				voice: stringValue(payload.agent?.voice),
				launchUrl: stringValue(payload.agent?.launchUrl)
			},
			transcript,
			rawPayload: payload
		}
	};
}

type NormalizedPayload = {
	call: {
		callId: string;
		startedAt: string;
		endedAt: string;
		durationSeconds: number;
		endReason: string;
		locale: string;
	};
	user: {
		paperoboUserId: string;
		supabaseUserId: string;
		email: string;
		displayName: string;
		isAnonymous: boolean;
	};
	agent: {
		agentId: string;
		publicId: string;
		name: string;
		voice: string;
		launchUrl: string;
	};
	transcript: Array<{
		id: string;
		role: 'user' | 'assistant' | 'system';
		speakerName: string;
		text: string;
		at: string;
		source: string;
	}>;
	rawPayload: PapeRoboCallHistoryPayload;
};

function buildInitialBookMarkdown() {
	return `---
title: Call history
author: PapeRobo
theme_color: green
play_mode: book
id: paperobo-call-history
source_app: paperobo
special_book_key: call_history
is_public: false
---
`;
}

function chooseCanonicalBook(books: CallHistoryBookRow[]) {
	return [...books].sort((left, right) => {
		const leftTime = Date.parse(left.created_at || left.updated_at || '');
		const rightTime = Date.parse(right.created_at || right.updated_at || '');
		return (Number.isFinite(leftTime) ? leftTime : 0) - (Number.isFinite(rightTime) ? rightTime : 0);
	})[0];
}

function upsertCallPage(markdown: string, payload: NormalizedPayload) {
	const page = buildCallPage(payload);
	const marker = callMarker(payload.call.callId);
	const parts = splitBookMarkdown(markdown);
	const existingIndex = parts.pages.findIndex((item) => item.includes(marker));
	const pages =
		existingIndex >= 0
			? [page, ...parts.pages.filter((_, index) => index !== existingIndex)]
			: [page, ...parts.pages];

	return {
		markdown: [parts.frontmatter, ...pages].filter(Boolean).join('\n\n***\n\n'),
		created: existingIndex < 0
	};
}

function splitBookMarkdown(markdown: string) {
	const trimmed = markdown.trim();
	const frontmatterMatch = trimmed.match(/^(---\s*[\s\S]*?\s*---)([\s\S]*)$/);
	const frontmatter = frontmatterMatch ? frontmatterMatch[1].trim() : buildInitialBookMarkdown().trim();
	const body = frontmatterMatch ? frontmatterMatch[2].trim() : trimmed;
	const pages = body
		.split(/(?:^|\n)\s*\*\*\s*(?:\n|$)/)
		.map((page) => page.trim())
		.filter(Boolean);

	return { frontmatter, pages };
}

function buildCallPage(payload: NormalizedPayload) {
	const started = formatDateTime(payload.call.startedAt);
	const ended = formatDateTime(payload.call.endedAt);
	const duration = formatDuration(payload.call.durationSeconds);
	const title = `${payload.agent.name}との通話 - ${started}`;
	const transcript = payload.transcript
		.map((entry) => `**${escapeMarkdown(entry.speakerName)}**: ${escapeMarkdown(entry.text)}`)
		.join('\n\n');
	const rawPayload = Buffer.from(JSON.stringify(payload.rawPayload)).toString('base64');

	return `<!-- paperobo_call_id: ${payload.call.callId} -->
<!-- paperobo_payload_base64: ${rawPayload} -->

# ${escapeMarkdown(title)}

- 日時: ${escapeMarkdown(started)} - ${escapeMarkdown(ended)}
- 時間: ${escapeMarkdown(duration)}
- 相手: ${escapeMarkdown(payload.agent.name)}
- 保存元: PapeRobo
${payload.call.endReason ? `- 終了理由: ${escapeMarkdown(payload.call.endReason)}` : ''}
${payload.user.isAnonymous ? '- 利用者: 未ログインユーザー' : ''}

## 会話

${transcript}
`;
}

function callMarker(callId: string) {
	return `<!-- paperobo_call_id: ${callId} -->`;
}

function formatDateTime(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat('ja-JP', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit'
	}).format(date);
}

function formatDuration(seconds: number) {
	if (!seconds) return '0秒';
	const minutes = Math.floor(seconds / 60);
	const restSeconds = seconds % 60;
	return minutes > 0 ? `${minutes}分${restSeconds}秒` : `${restSeconds}秒`;
}

function escapeMarkdown(value: string) {
	return value.replace(/\r?\n/g, ' ').trim();
}

function stringValue(value: unknown) {
	return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown) {
	const number = Number(value);
	return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function jsonError(code: string, error: string, status: number) {
	return json({ ok: false, code, error }, { status });
}
