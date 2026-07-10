import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        const session = locals.session;

        if (!session) {
            return json({ error: 'Unauthorized. Please login first.' }, { status: 401 });
        }

        const plan = session.user?.user_metadata?.plan || 'free';
        const isProPlan = ['pro', 'enterprise'].includes(plan);
        if (!isProPlan) {
            return json({ error: 'GitHub Integration is only available on Pro plan or above.' }, { status: 403 });
        }

        const { markdown, filename, commitMessage } = await request.json();

        if (!markdown || !filename) {
            return json({ error: 'Missing markdown or filename.' }, { status: 400 });
        }

        const token = session.user?.user_metadata?.github_token;
        const owner = session.user?.user_metadata?.github_owner;
        const repo = session.user?.user_metadata?.github_repo;

        if (!token || !owner || !repo) {
            return json({ error: 'GitHub integration is not fully configured in settings.' }, { status: 400 });
        }

        const cleanFilename = filename.replace(/[^a-zA-Z0-9_\-\.]/g, '');
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${cleanFilename}`;

        // 1. Get SHA of existing file if it exists
        const getRes = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });

        let sha: string | undefined = undefined;
        if (getRes.ok) {
            const fileData = await getRes.json();
            sha = fileData.sha;
        }

        // 2. PUT the file content
        const contentBase64 = Buffer.from(markdown).toString('base64');
        const commitMsg = commitMessage || `Update ${cleanFilename} from HyperCardBook`;

        const putRes = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28'
            },
            body: JSON.stringify({
                message: commitMsg,
                content: contentBase64,
                sha
            })
        });

        if (!putRes.ok) {
            const errText = await putRes.text();
            return json({ error: `GitHub API error: ${errText}` }, { status: 500 });
        }

        const putData = await putRes.json();
        return json({
            success: true,
            commitUrl: putData.commit.html_url,
            fileUrl: putData.content.html_url
        });
    } catch (err: any) {
        console.error('github-push error:', err);
        return json({ error: err.message || 'Internal server error.' }, { status: 500 });
    }
};
