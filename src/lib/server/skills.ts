import type { SupabaseClient } from '@supabase/supabase-js';
import { fallbackSkillDescription, parseSkillMd, type SkillDoc, type SkillFile } from '$lib/skill-md';

export interface StoredSkill {
    name: string;
    description: string;
    body: string;
    enabled: boolean;
    source: 'builtin' | 'user';
    files: string[];
}

// 組み込み Skill はビルドに同梱する（Vercel の関数ではリポジトリ内ファイルを実行時に読めないため）
const BUILTIN_ROOT = '/src/lib/server/builtin-skills/';
const builtinRaw = import.meta.glob('/src/lib/server/builtin-skills/**/*', {
    query: '?raw',
    import: 'default',
    eager: true
}) as Record<string, string>;

const builtinSkills = new Map<string, { skill: StoredSkill; files: Map<string, string> }>();
{
    const grouped = new Map<string, { md: string; files: Map<string, string> }>();
    for (const [key, content] of Object.entries(builtinRaw)) {
        const [dir, ...rest] = key.slice(BUILTIN_ROOT.length).split('/');
        const relPath = rest.join('/');
        const entry = grouped.get(dir) ?? { md: '', files: new Map<string, string>() };
        if (relPath === 'SKILL.md') entry.md = content;
        else entry.files.set(relPath, content);
        grouped.set(dir, entry);
    }
    for (const [dir, { md, files }] of grouped) {
        if (!md) continue;
        const { metadata, body } = parseSkillMd(md);
        builtinSkills.set(dir, {
            skill: {
                name: dir,
                description: metadata.description || fallbackSkillDescription(body),
                body,
                enabled: true,
                source: 'builtin',
                files: [...files.keys()].sort()
            },
            files
        });
    }
}

type SkillRow = {
    name: string;
    description: string;
    body: string;
    enabled: boolean;
    skill_files: { path: string }[] | null;
};

const SKILL_COLUMNS = 'name, description, body, enabled, skill_files(path)';

function toStoredSkill(row: SkillRow): StoredSkill {
    return {
        name: row.name,
        description: row.description,
        body: row.body,
        enabled: row.enabled,
        source: 'user',
        files: (row.skill_files ?? []).map(file => file.path).sort()
    };
}

// ユーザー Skill と組み込み Skill を返す。同名ならユーザー Skill が優先される。
export async function listSkills(
    supabase: SupabaseClient,
    userId: string,
    options: { enabledOnly?: boolean; includeBuiltin?: boolean } = {}
): Promise<StoredSkill[]> {
    let query = supabase
        .from('skills')
        .select(SKILL_COLUMNS)
        .eq('user_id', userId)
        .order('name');
    if (options.enabledOnly) query = query.eq('enabled', true);
    const { data, error } = await query;
    if (error) throw error;

    const userSkills = ((data ?? []) as SkillRow[]).map(toStoredSkill);
    if (!options.includeBuiltin) return userSkills;

    const userNames = new Set(userSkills.map(skill => skill.name));
    const builtins = [...builtinSkills.values()]
        .map(entry => entry.skill)
        .filter(skill => !userNames.has(skill.name));
    return [...userSkills, ...builtins];
}

// references/ や assets/ のファイル内容を取得。skill は listSkills で得たもの（組み込みかどうかで読み先が変わる）
export async function getSkillFile(
    supabase: SupabaseClient,
    userId: string,
    skill: StoredSkill,
    path: string
): Promise<string | null> {
    if (skill.source === 'builtin') return builtinSkills.get(skill.name)?.files.get(path) ?? null;

    const { data, error } = await supabase
        .from('skills')
        .select('skill_files(content)')
        .eq('user_id', userId)
        .eq('name', skill.name)
        .eq('skill_files.path', path)
        .maybeSingle();
    if (error) throw error;
    return (data as { skill_files: { content: string }[] | null } | null)?.skill_files?.[0]?.content ?? null;
}

// files を渡した場合は、そのスキルのファイル一式を置き換える。省略時は既存ファイルを維持する。
export async function saveSkill(
    supabase: SupabaseClient,
    userId: string,
    doc: SkillDoc,
    options: { files?: SkillFile[]; enabled?: boolean } = {}
): Promise<void> {
    const row: Record<string, unknown> = {
        user_id: userId,
        name: doc.name,
        description: doc.description,
        body: doc.body,
        updated_at: new Date().toISOString()
    };
    if (options.enabled !== undefined) row.enabled = options.enabled;

    const { data, error } = await supabase
        .from('skills')
        .upsert(row, { onConflict: 'user_id,name' })
        .select('id')
        .single();
    if (error) throw error;

    if (options.files) {
        const { error: deleteError } = await supabase.from('skill_files').delete().eq('skill_id', data.id);
        if (deleteError) throw deleteError;
        if (options.files.length > 0) {
            const { error: insertError } = await supabase
                .from('skill_files')
                .insert(options.files.map(file => ({ skill_id: data.id, path: file.path, content: file.content })));
            if (insertError) throw insertError;
        }
    }
}

export async function deleteSkill(supabase: SupabaseClient, userId: string, name: string): Promise<void> {
    const { error } = await supabase.from('skills').delete().eq('user_id', userId).eq('name', name);
    if (error) throw error;
}
