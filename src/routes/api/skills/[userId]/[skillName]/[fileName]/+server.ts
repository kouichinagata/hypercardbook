import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';

// GET /api/skills/[userId]/[skillName]/[fileName]
export const GET: RequestHandler = async ({ params }) => {
    const { userId, skillName, fileName } = params;
    
    if (!userId || !skillName || !fileName) {
        throw error(400, 'Missing parameters');
    }

    // サニタイズ
    const safeUserId = userId.replace(/[^a-zA-Z0-9_\-]/g, '');
    const safeSkillName = skillName.replace(/[^a-zA-Z0-9_\-]/g, '');
    const safeFileName = fileName.replace(/[^a-zA-Z0-9_\-\.]/g, '');

    // セキュリティチェック：親ディレクトリへのアクセス（../）を禁止
    if (safeFileName.includes('..')) {
        throw error(400, 'Invalid filename');
    }

    const filePath = path.resolve('data/skills', safeUserId, safeSkillName, safeFileName);

    if (!fs.existsSync(filePath)) {
        throw error(404, 'File not found');
    }

    try {
        const content = fs.readFileSync(filePath);
        
        let contentType = 'text/plain';
        if (safeFileName.endsWith('.js')) {
            contentType = 'application/javascript; charset=utf-8';
        } else if (safeFileName.endsWith('.md')) {
            contentType = 'text/markdown; charset=utf-8';
        }

        return new Response(content, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'no-cache'
            }
        });
    } catch (err: any) {
        console.error('Failed to read file:', err);
        throw error(500, 'Failed to read file');
    }
};
