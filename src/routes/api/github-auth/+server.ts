import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env as publicEnv } from '$env/dynamic/public';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        const session = locals.session;

        if (!session) {
            return json({ error: 'Unauthorized. Please login first.' }, { status: 401 });
        }

        const { action, deviceCode } = await request.json();
        const client_id = publicEnv.PUBLIC_GITHUB_CLIENT_ID || env.PUBLIC_GITHUB_CLIENT_ID;

        if (!client_id) {
            return json({ error: 'PUBLIC_GITHUB_CLIENT_ID is not set in environment variables.' }, { status: 500 });
        }

        // 1. Device Flow Start
        if (action === 'start') {
            const response = await fetch('https://github.com/login/device/code', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    client_id,
                    scope: 'repo'
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                return json({ error: `GitHub API error: ${errText}` }, { status: 500 });
            }

            const data = await response.json();
            return json({
                device_code: data.device_code,
                user_code: data.user_code,
                verification_uri: data.verification_uri,
                interval: data.interval
            });
        }

        // 2. Device Flow Polling
        if (action === 'poll') {
            if (!deviceCode) {
                return json({ error: 'Missing deviceCode parameter.' }, { status: 400 });
            }

            const response = await fetch('https://github.com/login/oauth/access_token', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    client_id,
                    device_code: deviceCode,
                    grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                return json({ error: `GitHub API error: ${errText}` }, { status: 500 });
            }

            const data = await response.json();
            if (data.error) {
                return json({ error: data.error, error_description: data.error_description });
            }

            return json({ access_token: data.access_token });
        }

        return json({ error: 'Invalid action.' }, { status: 400 });
    } catch (err: any) {
        console.error('github-auth error:', err);
        return json({ error: err.message || 'Internal server error.' }, { status: 500 });
    }
};
