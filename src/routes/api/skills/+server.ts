import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { effectivePlanFromUser, isProPlan } from '$lib/plan';
import {
    SKILL_DESCRIPTION_MAX,
    fallbackSkillDescription,
    normalizeSkillName,
    parseSkillMd,
    validateSkill,
    type SkillFile
} from '$lib/skill-md';
import { deleteSkill, listSkills, saveSkill } from '$lib/server/skills';

function requireProSession(locals: App.Locals): { userId: string; error?: undefined } | { userId?: undefined; error: Response } {
    const session = locals.session;
    if (!session) return { error: json({ error: 'Unauthorized' }, { status: 401 }) };
    if (!isProPlan(effectivePlanFromUser(session.user))) {
        return { error: json({ error: 'Pro plan or above is required.' }, { status: 403 }) };
    }
    return { userId: session.user.id };
}

// GET /api/skills: ログイン中ユーザーの Skill 一覧
export const GET: RequestHandler = async ({ locals }) => {
    const auth = requireProSession(locals);
    if (auth.error) return auth.error;
    try {
        const skills = await listSkills(locals.supabase, auth.userId);
        return json({
            skills: skills.map(skill => ({
                id: `my-plugin-${skill.name}`,
                name: skill.name,
                description: skill.description,
                kinds: 'Skill',
                owner: 'My plugin',
                skill: skill.body,
                enabled: skill.enabled,
                files: skill.files
            }))
        });
    } catch (err: any) {
        console.error('Failed to list skills:', err);
        return json({ error: err.message || 'Failed to list skills' }, { status: 500 });
    }
};

// POST /api/skills: Skill の作成・更新 { skillName, skillMd, files?, enabled? }
export const POST: RequestHandler = async ({ request, locals }) => {
    const auth = requireProSession(locals);
    if (auth.error) return auth.error;
    try {
        const { skillName, skillMd, files, enabled } = await request.json();
        if (typeof skillMd !== 'string' || !skillMd.trim()) {
            return json({ error: 'Missing skillMd' }, { status: 400 });
        }

        const { metadata, body } = parseSkillMd(skillMd);
        const name = normalizeSkillName(String(skillName || metadata.name || '')) || `skill-${Date.now().toString(36)}`;
        const description = (metadata.description?.trim() || fallbackSkillDescription(body)).slice(0, SKILL_DESCRIPTION_MAX);
        const skillFiles: SkillFile[] | undefined = Array.isArray(files)
            ? files.map((file: any) => ({ path: String(file?.path || ''), content: String(file?.content ?? '') }))
            : undefined;

        const doc = { name, description, body };
        const validationError = validateSkill(doc, skillFiles);
        if (validationError) return json({ error: validationError }, { status: 400 });

        await saveSkill(locals.supabase, auth.userId, doc, {
            files: skillFiles,
            enabled: typeof enabled === 'boolean' ? enabled : undefined
        });
        return json({ success: true, skillId: name });
    } catch (err: any) {
        console.error('Failed to save skill:', err);
        return json({ error: err.message || 'Failed to save skill' }, { status: 500 });
    }
};

// DELETE /api/skills: Skill の削除 { skillName }（"my-plugin-" 付きの ID も受け付ける）
export const DELETE: RequestHandler = async ({ request, locals }) => {
    const auth = requireProSession(locals);
    if (auth.error) return auth.error;
    try {
        const { skillName } = await request.json();
        const name = normalizeSkillName(String(skillName || '').replace(/^my-plugin-/, ''));
        if (!name) return json({ error: 'Missing skillName' }, { status: 400 });

        await deleteSkill(locals.supabase, auth.userId, name);
        return json({ success: true });
    } catch (err: any) {
        console.error('Failed to delete skill:', err);
        return json({ error: err.message || 'Failed to delete skill' }, { status: 500 });
    }
};
