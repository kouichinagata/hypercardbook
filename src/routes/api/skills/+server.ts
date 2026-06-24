import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';

// POST /api/skills: 個別Skillの物理フォルダ作成とファイル書き込み
export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        const session = locals.session;
        if (!session) {
            return json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { skillName, skillMd } = await request.json();
        if (!skillName || !skillMd) {
            return json({ error: 'Missing skillName or skillMd' }, { status: 400 });
        }

        const userId = session.user.id;
        // 安全のためにSkillNameをサニタイズ（アルファベット、数字、ハイフン、アンダースコアのみ）
        const safeSkillName = skillName.replace(/[^a-zA-Z0-9_\-]/g, '');
        if (!safeSkillName) {
            return json({ error: 'Invalid skillName' }, { status: 400 });
        }

        const baseDir = path.resolve('data/skills', userId, safeSkillName);
        fs.mkdirSync(baseDir, { recursive: true });

        // SKILL.md を書き込む
        fs.writeFileSync(path.join(baseDir, 'SKILL.md'), skillMd, 'utf-8');

        // index.js の抽出（skillMd 内の最初の ```js または ```javascript ブロックを抽出）
        const jsMatch = skillMd.match(/```(?:js|javascript)\r?\n([\s\S]*?)\r?\n```/);
        let jsCode = 'export default function(context) {\n    // Auto-generated skill\n}';
        if (jsMatch) {
            jsCode = jsMatch[1].trim();
        }

        fs.writeFileSync(path.join(baseDir, 'index.js'), jsCode, 'utf-8');

        return json({ success: true, skillId: safeSkillName });
    } catch (err: any) {
        console.error('Failed to create skill directory:', err);
        return json({ error: err.message || 'Failed to create skill directory' }, { status: 500 });
    }
};

// DELETE /api/skills: 個別Skillの物理フォルダを再帰的に削除
export const DELETE: RequestHandler = async ({ request, locals }) => {
    try {
        const session = locals.session;
        if (!session) {
            return json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { skillName } = await request.json();
        if (!skillName) {
            return json({ error: 'Missing skillName' }, { status: 400 });
        }

        const userId = session.user.id;
        const safeSkillName = skillName.replace(/[^a-zA-Z0-9_\-]/g, '');
        
        const baseDir = path.resolve('data/skills', userId, safeSkillName);
        
        if (fs.existsSync(baseDir)) {
            // 安全のため、削除対象のパスが意図しない場所（ルートなど）にならないようチェック
            if (baseDir.includes(path.join('data/skills', userId))) {
                fs.rmSync(baseDir, { recursive: true, force: true });
            }
        }

        return json({ success: true });
    } catch (err: any) {
        console.error('Failed to delete skill directory:', err);
        return json({ error: err.message || 'Failed to delete skill' }, { status: 500 });
    }
};
