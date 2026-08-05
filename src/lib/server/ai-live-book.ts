export interface AiLiveHistoryEntry {
    bookUuid: string;
    creatorName: string;
}

export interface AiLiveCanonicalMetadata {
    bookId: string;
    rootBookId: string;
    branchRootBookId: string;
    parentBookId: string | null;
    canonicalAuthor: string;
    prompt: string;
    generationCount: number;
    history: AiLiveHistoryEntry[];
}

const FRONTMATTER_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

function splitFrontmatter(markdown: string) {
    const match = markdown.match(FRONTMATTER_RE);
    if (!match) return { lines: [] as string[], body: markdown.trimStart() };
    return {
        lines: match[1].split(/\r?\n/),
        body: markdown.slice(match[0].length)
    };
}

function topLevelKey(line: string): string | null {
    if (!line || /^\s/.test(line) || line.trimStart().startsWith('#')) return null;
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:/);
    return match?.[1] || null;
}

function fieldRange(lines: string[], key: string): [number, number] | null {
    const start = lines.findIndex((line) => topLevelKey(line) === key);
    if (start < 0) return null;
    let end = start + 1;
    while (end < lines.length && topLevelKey(lines[end]) === null) end += 1;
    return [start, end];
}

function unquoteYamlScalar(value: string): string {
    const trimmed = value.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        try {
            return JSON.parse(trimmed);
        } catch {
            return trimmed.slice(1, -1);
        }
    }
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
        return trimmed.slice(1, -1).replace(/''/g, "'");
    }
    return trimmed;
}

export function topLevelFrontmatterValue(markdown: string, key: string): string {
    const { lines } = splitFrontmatter(markdown);
    const range = fieldRange(lines, key);
    if (!range) return '';
    const firstLine = lines[range[0]];
    const raw = firstLine.slice(firstLine.indexOf(':') + 1).trim();
    if (/^[|>][-+]?\s*$/.test(raw)) {
        return lines
            .slice(range[0] + 1, range[1])
            .map((line) => line.startsWith('  ') ? line.slice(2) : line.trimStart())
            .join('\n')
            .replace(/\n+$/, '');
    }
    return unquoteYamlScalar(raw);
}

export function isAiLiveBookMarkdown(markdown: string): boolean {
    return topLevelFrontmatterValue(markdown, 'ai_live_book').toLowerCase() === 'true';
}

export function extractAiLivePrompt(markdown: string): string {
    return topLevelFrontmatterValue(markdown, 'ai_live_prompt').trim();
}

function yamlString(value: string): string {
    return JSON.stringify(value || '');
}

function blockScalar(key: string, value: string): string[] {
    const normalized = (value || '').replace(/\r\n/g, '\n').trim();
    const content = normalized ? normalized.split('\n') : [''];
    return [`${key}: |`, ...content.map((line) => `  ${line}`)];
}

function historyText(history: AiLiveHistoryEntry[]): string {
    return history
        .map((entry, index) => `${index + 1}. ${entry.creatorName} [${entry.bookUuid}]`)
        .join('\n');
}

export function canonicalizeAiLiveMarkdown(
    markdown: string,
    metadata: AiLiveCanonicalMetadata
): string {
    const { lines: originalLines, body } = splitFrontmatter(markdown);
    const managedKeys = new Set([
        'author',
        'play_mode',
        'is_public',
        'ai_live_book',
        'ai_live_book_id',
        'ai_live_root_book',
        'ai_live_branch',
        'ai_live_parent_book',
        'ai_live_generation',
        'ai_live_prompt',
        'ai_live_history'
    ]);

    const retained: string[] = [];
    for (let index = 0; index < originalLines.length;) {
        const key = topLevelKey(originalLines[index]);
        if (key && managedKeys.has(key)) {
            const range = fieldRange(originalLines, key)!;
            index = range[1];
            continue;
        }
        retained.push(originalLines[index]);
        index += 1;
    }

    while (retained.length > 0 && !retained[retained.length - 1].trim()) retained.pop();
    const authorBioIndex = retained.findIndex((line) => topLevelKey(line) === 'author_bio');
    const insertAt = authorBioIndex >= 0 ? authorBioIndex : retained.length;
    const managed = [
        `author: ${yamlString(metadata.canonicalAuthor)}`,
        'play_mode: book',
        'is_public: true',
        'ai_live_book: true',
        `ai_live_book_id: ${yamlString(metadata.bookId)}`,
        `ai_live_root_book: ${yamlString(metadata.rootBookId)}`,
        `ai_live_branch: ${yamlString(metadata.branchRootBookId)}`,
        `ai_live_parent_book: ${yamlString(metadata.parentBookId || '')}`,
        `ai_live_generation: ${Math.max(1, metadata.generationCount)}`,
        ...blockScalar('ai_live_prompt', metadata.prompt),
        ...blockScalar('ai_live_history', historyText(metadata.history))
    ];
    const finalLines = [...retained.slice(0, insertAt), ...managed, ...retained.slice(insertAt)];
    return `---\n${finalLines.join('\n')}\n---\n${body.replace(/^\s+/, '')}`;
}

export function markdownFromModelResponse(text: string): string {
    const fenced = text.match(/```markdown\s*([\s\S]*?)```/i);
    return (fenced?.[1] || text).trim();
}
