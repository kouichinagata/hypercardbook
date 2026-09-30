// Agent Skills 形式 (SKILL.md) の解析・生成・検証。クライアント／サーバー共用。

export const SKILL_NAME_MAX = 64;
export const SKILL_DESCRIPTION_MAX = 1024;
export const SKILL_BODY_MAX = 100_000;
export const SKILL_FILE_MAX = 200_000;
export const SKILL_FILES_MAX = 20;

const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// references/ と assets/ のみ許可。各セグメントは "." で始められないので ".." も通らない。
const SKILL_FILE_PATH_PATTERN = /^(references|assets)\/[A-Za-z0-9_-][A-Za-z0-9._-]*(?:\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$/;

export interface SkillDoc {
    name: string;
    description: string;
    body: string;
}

export interface SkillFile {
    path: string;
    content: string;
}

export function isValidSkillName(name: string): boolean {
    return name.length <= SKILL_NAME_MAX && SKILL_NAME_PATTERN.test(name);
}

export function normalizeSkillName(raw: string): string {
    return raw
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, SKILL_NAME_MAX)
        .replace(/-$/, '');
}

export function isValidSkillFilePath(path: string): boolean {
    return path.length <= 200 && SKILL_FILE_PATH_PATTERN.test(path);
}

// 本文の最初の行から description の代替を作る（description 未入力の旧データ救済用）
export function fallbackSkillDescription(body: string): string {
    const firstLine = body.split('\n').map(line => line.replace(/^[\s#>*-]+/, '').trim()).find(Boolean) || '';
    return firstLine.slice(0, 200);
}

export function parseSkillMd(content: string): { metadata: Record<string, string>; body: string } {
    const text = content.replace(/^﻿/, '');
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/);
    if (!match) return { metadata: {}, body: text.trim() };
    return { metadata: parseFrontmatter(match[1]), body: match[2].trim() };
}

// SKILL.md の frontmatter に必要な範囲の YAML（スカラー、引用符、| / > ブロック）だけを扱う。
// ネストしたマップ（metadata: など）の子要素は読み飛ばす。
function parseFrontmatter(yaml: string): Record<string, string> {
    const result: Record<string, string> = {};
    const lines = yaml.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/^([A-Za-z0-9_-]+):[ \t]*(.*)$/);
        if (!match) continue;
        const [, key, rawValue] = match;
        const value = rawValue.trim();
        if (/^[|>][+-]?$/.test(value)) {
            const block: string[] = [];
            while (i + 1 < lines.length && (/^\s/.test(lines[i + 1]) || lines[i + 1].trim() === '')) {
                block.push(lines[++i]);
            }
            const indents = block.filter(line => line.trim()).map(line => line.match(/^\s*/)![0].length);
            const indent = indents.length ? Math.min(...indents) : 0;
            const stripped = block.map(line => line.slice(indent));
            result[key] = value.startsWith('>')
                ? stripped.join(' ').replace(/\s+/g, ' ').trim()
                : stripped.join('\n').trim();
        } else if (/^".*"$/.test(value)) {
            try {
                result[key] = JSON.parse(value);
            } catch {
                result[key] = value.slice(1, -1);
            }
        } else if (/^'.*'$/.test(value)) {
            result[key] = value.slice(1, -1).replace(/''/g, "'");
        } else {
            result[key] = value;
        }
    }
    return result;
}

export function serializeSkillMd(doc: SkillDoc): string {
    // JSON の二重引用符文字列は YAML としても有効なので、description に ":" や改行があっても壊れない
    return `---\nname: ${doc.name}\ndescription: ${JSON.stringify(doc.description)}\n---\n\n${doc.body.trim()}\n`;
}

export function validateSkill(doc: SkillDoc, files: SkillFile[] = []): string | null {
    if (!isValidSkillName(doc.name)) return 'Skill name must use lowercase letters, numbers, and hyphens (max 64 characters).';
    if (!doc.description.trim()) return 'Skill description is required.';
    if (doc.description.length > SKILL_DESCRIPTION_MAX) return `Skill description must be ${SKILL_DESCRIPTION_MAX} characters or fewer.`;
    if (!doc.body.trim()) return 'Skill body is required.';
    if (doc.body.length > SKILL_BODY_MAX) return `Skill body must be ${SKILL_BODY_MAX} characters or fewer.`;
    if (files.length > SKILL_FILES_MAX) return `A skill can contain at most ${SKILL_FILES_MAX} files.`;
    for (const file of files) {
        if (!isValidSkillFilePath(file.path)) return `Invalid skill file path: ${file.path} (only references/ and assets/ are supported).`;
        if (file.content.length > SKILL_FILE_MAX) return `Skill file ${file.path} must be ${SKILL_FILE_MAX} characters or fewer.`;
    }
    return null;
}
