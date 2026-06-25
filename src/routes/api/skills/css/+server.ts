import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';

export const GET: RequestHandler = async ({ url, locals }) => {
    try {
        const session = locals.session;
        let userId = url.searchParams.get('userId') || session?.user?.id || 'global';
        userId = userId.replace(/[^a-zA-Z0-9_\-]/g, '');

        const pluginIdsStr = url.searchParams.get('pluginIds') || '';
        const pluginIds = pluginIdsStr.split(',').map(id => id.trim()).filter(Boolean);

        let combinedCss = '';

        for (const id of pluginIds) {
            if (!id.startsWith('my-plugin-')) {
                continue;
            }
            const skillName = id.substring('my-plugin-'.length).replace(/[^a-zA-Z0-9_\-]/g, '');
            if (!skillName) continue;

            const skillMdPath = path.resolve('data/skills', userId, skillName, 'SKILL.md');
            if (fs.existsSync(skillMdPath)) {
                const skillMd = fs.readFileSync(skillMdPath, 'utf-8');
                // Extract all CSS code blocks
                const cssRegex = /```css\r?\n([\s\S]*?)\r?\n```/g;
                let match;
                while ((match = cssRegex.exec(skillMd)) !== null) {
                    combinedCss += match[1] + '\n';
                }
            }
        }

        return json({ css: combinedCss });
    } catch (err: any) {
        console.error('Failed to get plugin CSS:', err);
        return json({ error: err.message || 'Failed to get plugin CSS' }, { status: 500 });
    }
};
