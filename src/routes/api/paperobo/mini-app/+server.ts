import { addMiniAppByRef } from '$lib/server/mini-app-registration';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { createClient } from '@supabase/supabase-js';
import { dev } from '$app/environment';
import { contentOrigins, servedOnMarkdown } from '$lib/content-origin';
import { absoluteCoverImage, helloWorldMiniAppMarkdown, miniAppCardUrl, miniAppUrls, newMiniAppSlug, validMiniAppRef, MINI_APP_TITLE, STANDARD_MINI_APP_REFS } from '$lib/mini-app';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Called server-to-server by PapeRobo with the shared secret.
//   create: makes an unlisted "Hello World" MiniApp (not public; usable by anyone with its UUID link) and adds it to the user's list
//   add:    appends an existing MiniApp by its URL reference without replacing the list
//   list:   returns the standard MiniApps, then the user's MiniApps (title, cover and Card URL resolved from the books table)
//   remove: removes one entry from the user's list (standard MiniApps cannot be removed)
export const POST: RequestHandler = async ({ request, url }) => {
    try {
        // Local development hands out local URLs; production always uses the public origins.
        // Card URLs point at the domain each MiniApp is served from (new ones and the standard MiniApps: the markdown domain).
        const origins = contentOrigins(url, dev);
        const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
        const expectedSecret = env.HYPERCARDBOOK_SHARED_SECRET || process.env.HYPERCARDBOOK_SHARED_SECRET || '';
        if (!expectedSecret) {
            console.error('Integration Error: HYPERCARDBOOK_SHARED_SECRET is not configured on the server.');
            return json({ error: 'Server integration is misconfigured.' }, { status: 500 });
        }
        if (token !== expectedSecret) return json({ error: 'Unauthorized integration token.' }, { status: 401 });

        const payload = await request.json();
        const { action, userId } = payload;
        if (typeof userId !== 'string' || !UUID.test(userId)) return json({ error: 'Missing or invalid userId.' }, { status: 400 });

        const supabaseUrl = publicEnv.PUBLIC_SUPABASE_URL || env.PUBLIC_SUPABASE_URL || '';
        const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
        if (!supabaseUrl || !serviceRoleKey) {
            console.error('Integration Error: Supabase service role client is not configured.');
            return json({ error: 'Server integration is misconfigured.' }, { status: 500 });
        }
        const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

        if (action === 'add') {
            const result = await addMiniAppByRef(supabase, userId, payload.ref);
            return json(result.error ? { error: result.error } : { ok: true }, { status: result.status });
        }

        if (action === 'create') {
            const slug = newMiniAppSlug();
            const { data: created, error: dbError } = await supabase.from('books').insert({
                user_id: userId,
                slug,
                title: MINI_APP_TITLE,
                author: null,
                cover_image: null,
                theme_color: '#F8C8DC',
                markdown_content: helloWorldMiniAppMarkdown(slug),
                is_public: false,
                published_at: null
            }).select('id').single();
            if (dbError || !created) {
                console.error('Failed to create mini app card:', dbError);
                return json({ error: dbError?.message || 'Failed to create the MiniApp.' }, { status: 500 });
            }
            const { data: last } = await supabase.from('mini_apps').select('position').eq('user_id', userId).order('position', { ascending: false }).limit(1).maybeSingle();
            const { error: listError } = await supabase.from('mini_apps').insert({ user_id: userId, ref: created.id, title: MINI_APP_TITLE, position: (last?.position ?? -1) + 1 });
            if (listError) {
                console.error('Failed to register mini app:', listError);
                return json({ error: listError.message }, { status: 500 });
            }
            return json({ ok: true, id: created.id, slug, title: MINI_APP_TITLE, ...miniAppUrls(created.id, origins.www), cardUrl: miniAppCardUrl(created, origins.markdown) });
        }

        if (action === 'list') {
            const { data: rows, error: listError } = await supabase.from('mini_apps').select('ref, title, cover_image, position').eq('user_id', userId).order('position', { ascending: true });
            if (listError) return json({ error: listError.message }, { status: 500 });
            const standardRows = STANDARD_MINI_APP_REFS.map((ref) => ({ ref, title: '', standard: true }));
            const allRows = [...standardRows, ...(rows || []).map((row) => ({ ...row, standard: false }))];
            const refs = allRows.map((row) => row.ref).filter(validMiniAppRef);
            const uuids = refs.filter((ref) => UUID.test(ref));
            const slugs = refs.filter((ref) => !UUID.test(ref));
            const found: any[] = [];
            if (uuids.length) found.push(...((await supabase.from('books').select('id, slug, title, cover_image, theme_color, created_at, is_public').in('id', uuids)).data || []));
            if (slugs.length) found.push(...((await supabase.from('books').select('id, slug, title, cover_image, theme_color, created_at, is_public').in('slug', slugs)).data || []));
            const shown = new Set<string>();
            const apps = allRows.flatMap((row) => {
                const book = found.find((b) => b.id === row.ref || b.slug === row.ref);
                // A user's own entry for a standard MiniApp (by UUID or slug) is not listed twice
                if (!book || shown.has(book.id)) return [];
                shown.add(book.id);
                return [{
                    ref: row.ref,
                    standard: row.standard,
                    title: book.title || row.title || 'MiniApp',
                    coverImage: absoluteCoverImage(book.cover_image, origins.www),
                    themeColor: book.theme_color || 'white',
                    cardUrl: miniAppCardUrl(book, servedOnMarkdown(book, true) ? origins.markdown : origins.www)
                }];
            });
            return json({ ok: true, apps });
        }

        if (action === 'remove') {
            if (!validMiniAppRef(payload.ref)) return json({ error: 'Missing or invalid ref.' }, { status: 400 });
            if (STANDARD_MINI_APP_REFS.includes(payload.ref)) return json({ error: 'Standard MiniApps cannot be removed.' }, { status: 400 });
            const { error: delError } = await supabase.from('mini_apps').delete().eq('user_id', userId).eq('ref', payload.ref);
            if (delError) return json({ error: delError.message }, { status: 500 });
            return json({ ok: true });
        }

        return json({ error: `Invalid action: ${action}` }, { status: 400 });
    } catch (err: any) {
        console.error('Mini app integration error:', err);
        return json({ error: err.message || 'Internal server error.' }, { status: 500 });
    }
};
