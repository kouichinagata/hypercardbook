import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listSkills } from '$lib/server/skills';

// ログイン中ユーザー本人の Skill からのみ CSS を抽出する（userId クエリは受け付けない）
export const GET: RequestHandler = async ({ url, locals }) => {
    const session = locals.session;
    if (!session) return json({ css: '' });
    try {
        const requested = new Set(
            (url.searchParams.get('pluginIds') || '')
                .split(',')
                .map(id => id.trim())
                .filter(id => id.startsWith('my-plugin-'))
                .map(id => id.slice('my-plugin-'.length))
        );
        if (requested.size === 0) return json({ css: '' });

        const skills = await listSkills(locals.supabase, session.user.id);
        let combinedCss = '';
        for (const skill of skills) {
            if (!requested.has(skill.name)) continue;
            for (const match of skill.body.matchAll(/```css\r?\n([\s\S]*?)\r?\n```/g)) {
                combinedCss += match[1] + '\n';
            }
        }
        return json({ css: combinedCss });
    } catch (err: any) {
        console.error('Failed to get plugin CSS:', err);
        return json({ error: err.message || 'Failed to get plugin CSS' }, { status: 500 });
    }
};
