export const DOCUMENT_SELECTION_RESULT = 'paperobo:document-selection';
export const CONTENT_KINDS = [
    { kind: 'miniapp', title: 'miniApp' }, { kind: 'hyperrobo', title: 'HyperRobo' },
    { kind: 'paperobo', title: 'PapeRobo' }, { kind: 'scenariobook', title: 'ScenarioBook' },
    { kind: 'scriptbook', title: 'ScriptBook' }
] as const;
export type SelectionKind = 'card' | 'book' | typeof CONTENT_KINDS[number]['kind'];
export type DocumentSelection = { category: 'card' | 'book' | 'content'; requestId: string; origin: string; limit: number };
export function readDocumentSelection(url: URL, dev = false): DocumentSelection | null {
    const category = url.searchParams.get('paperobo_select');
    const requestId = url.searchParams.get('request_id') || '';
    const origin = url.searchParams.get('paperobo_origin') || '';
    const limit = Number(url.searchParams.get('limit'));
    if (category !== 'card' && category !== 'book' && category !== 'content') return null;
    if (!/^[0-9a-f-]{36}$/i.test(requestId) || !Number.isInteger(limit) || limit < 1 || limit > 4) return null;
    if (origin !== 'https://paperobo.hypercardbook.org' && !(dev && ['http://localhost:5180', 'http://127.0.0.1:5180'].includes(origin))) return null;
    return { category, requestId, origin, limit };
}
export function matchesDocumentSelection(book: { playMode?: string; sourceApp?: string; source_app?: string; isStack?: boolean }, kind: SelectionKind | null): boolean {
    if (!kind || book.isStack || book.playMode === 'stack') return false;
    const source = book.sourceApp || book.source_app;
    const actual = source === 'scriptbook' ? 'scriptbook' : source === 'hypertv' ? 'scenariobook' : ['card','miniapp','hyperrobo','paperobo'].includes(book.playMode || '') ? book.playMode : 'book';
    return actual === kind;
}
export const selectionPublicType = (kind: SelectionKind | null) => kind === 'scenariobook' ? 'hypertv' : kind || 'all';
