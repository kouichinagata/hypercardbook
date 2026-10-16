import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { MAX_MINI_APPS, validMiniAppRef } from '$lib/mini-app';
import { isMiniApp } from '$lib/play-mode';
import { parseBookFrontmatter } from '$lib/server/book-frontmatter';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The signed-in user's MiniApp list (shown in PapeRobo).
export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.session) return json({ error: 'Unauthorized. Please login first.' }, { status: 401 });
    const { data, error } = await locals.supabase.from('mini_apps').select('ref, title, position').eq('user_id', locals.session.user.id).order('position', { ascending: true });
    if (error) return json({ error: error.message }, { status: 500 });
    return json({ items: data || [] });
};

// Replaces the list with the selected MiniApps (in order). Own MiniApps (listed or not) and public / Quark's Choice ones can be chosen.
export const PUT: RequestHandler = async ({ request, locals }) => {
    const session = locals.session;
    if (!session) return json({ error: 'Unauthorized. Please login first.' }, { status: 401 });
    const supabase = locals.supabase;
    const body = await request.json().catch(() => null);
    const refs: unknown[] = Array.isArray(body?.refs) ? body.refs : [];
    if (refs.length > MAX_MINI_APPS || !refs.every(validMiniAppRef) || new Set(refs).size !== refs.length) return json({ error: 'Invalid refs.' }, { status: 400 });

    const uuids = (refs as string[]).filter((ref) => UUID.test(ref));
    const slugs = (refs as string[]).filter((ref) => !UUID.test(ref));
    const found: any[] = [];
    if (uuids.length) found.push(...((await supabase.from('books').select('id, slug, title, user_id, is_public, is_quark_choice, markdown_content').in('id', uuids)).data || []));
    if (slugs.length) found.push(...((await supabase.from('books').select('id, slug, title, user_id, is_public, is_quark_choice, markdown_content').in('slug', slugs)).data || []));

    const rows: { ref: string; book: any }[] = [];
    for (const ref of refs as string[]) {
        const book = found.find((b) => b.id === ref || b.slug === ref);
        if (!book || !isMiniApp(parseBookFrontmatter(book.markdown_content || '').playMode)) return json({ error: `MiniApp not found: ${ref}` }, { status: 400 });
        const mine = book.user_id === session.user.id;
        if (!mine && !book.is_public && !book.is_quark_choice) return json({ error: `MiniApp is not available: ${ref}` }, { status: 400 });
        rows.push({ ref, book });
    }

    const { error: delError } = await supabase.from('mini_apps').delete().eq('user_id', session.user.id);
    if (delError) return json({ error: delError.message }, { status: 500 });
    if (rows.length) {
        const { error: insError } = await supabase.from('mini_apps').insert(rows.map(({ ref, book }, position) => ({ user_id: session.user.id, ref, title: book.title || '', position })));
        if (insError) return json({ error: insError.message }, { status: 500 });
    }
    return json({ ok: true, count: rows.length });
};
