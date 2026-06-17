import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { createClient } from '@supabase/supabase-js';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        const expectedSecret = env.HYPERCARDBOOK_SHARED_SECRET || process.env.HYPERCARDBOOK_SHARED_SECRET || '';

        if (!expectedSecret) {
            console.error('Integration Error: HYPERCARDBOOK_SHARED_SECRET is not configured on the server.');
            return json({ error: 'Server integration is misconfigured.' }, { status: 500 });
        }

        if (token !== expectedSecret) {
            return json({ error: 'Unauthorized integration token.' }, { status: 401 });
        }

        const payload = await request.json();
        const { action, agentId, userId, title, coverImage, launchUrl } = payload;

        if (!agentId || !userId) {
            return json({ error: 'Missing required parameters: agentId and userId.' }, { status: 400 });
        }

        const supabaseUrl = publicEnv.PUBLIC_SUPABASE_URL || env.PUBLIC_SUPABASE_URL || '';
        const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || '';

        if (!supabaseUrl || !serviceRoleKey) {
            console.error('Integration Error: Supabase service role client is not configured.');
            return json({ error: 'Server integration is misconfigured.' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: {
                persistSession: false,
                autoRefreshToken: false
            }
        });
        const bookSlug = `paperobo-${agentId}`;

        if (action === 'publish') {
            if (!title) {
                return json({ error: 'Missing required parameter: title.' }, { status: 400 });
            }

            // Construct the markdown content with YAML frontmatter
            const markdown = `---
title: ${title}
play_mode: paperobo
launch_url: ${launchUrl || ''}
---
# ${title}
This character is integrated from PapeRobo.
`;

            const bookData = {
                user_id: userId,
                slug: bookSlug,
                title,
                author: 'PapeRobo',
                cover_image: coverImage || null,
                theme_color: 'white',
                markdown_content: markdown,
                is_public: true,
                published_at: new Date().toISOString()
            };

            const { error: dbError } = await supabase
                .from('books')
                .upsert(bookData, { onConflict: 'slug' });

            if (dbError) {
                console.error('Failed to upsert agent into books table:', dbError);
                return json({ error: dbError.message }, { status: 500 });
            }

            return json({ success: true, message: 'Agent published successfully.' });
        } else if (action === 'unpublish' || action === 'delete') {
            const { error: dbError } = await supabase
                .from('books')
                .delete()
                .eq('slug', bookSlug);

            if (dbError) {
                console.error('Failed to delete agent from books table:', dbError);
                return json({ error: dbError.message }, { status: 500 });
            }

            return json({ success: true, message: 'Agent unpublished/deleted successfully.' });
        } else {
            return json({ error: `Invalid action: ${action}` }, { status: 400 });
        }
    } catch (err: any) {
        console.error('Webhook execution error:', err);
        return json({ error: err.message || 'Internal server error.' }, { status: 500 });
    }
};
