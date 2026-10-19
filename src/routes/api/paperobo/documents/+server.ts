import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { documentSecret, documentClient, accessibleDocument, documentKind, documentLinks } from '$lib/server/paperoboDocuments';
export const POST: RequestHandler = async ({ request, url }) => {
    const expected = Buffer.from(documentSecret());
    const received = Buffer.from((request.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''));
    if (!expected.length || expected.length !== received.length || !timingSafeEqual(expected, received)) throw error(401, 'Unauthorized');
    const body = await request.json();
    if (!body || typeof body.userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.userId)) throw error(400, 'Invalid user');
    const client = documentClient();
    if (body.action === 'list') {
        if (!['card','book','miniapp','hyperrobo','paperobo','scenariobook','scriptbook'].includes(body.kind)) throw error(400, 'Invalid kind');
        const offset = Number.isSafeInteger(body.offset) && body.offset >= 0 ? body.offset : 0;
        // Filter before paginating so other document kinds never hide a matching item.
        const items: any[] = []; let matching = 0; let more = false;
        for (let start = 0; !more; start += 200) {
            const { data, error: dbError } = await client.from('books').select('*').or(`user_id.eq.${body.userId},is_public.eq.true`).order('updated_at', { ascending: false }).order('id').range(start,start + 199);
            if (dbError) throw error(502, '本棚を読み込めませんでした。');
            for (const row of data || []) {
                if (documentKind(row.markdown_content || '') !== body.kind || (typeof body.query === 'string' && !String(row.title).normalize('NFKC').toLocaleLowerCase().includes(body.query.normalize('NFKC').toLocaleLowerCase().slice(0,100)))) continue;
                if (matching++ < offset) continue;
                if (items.length === 24) { more = true; break; }
                items.push({ id: row.id, title: row.title, kind: body.kind, isPublic: row.is_public === true, ...documentLinks(row,body.userId,url) });
            }
            if (!data || data.length < 200) break;
        }
        return json({ ok: true, items, more }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (typeof body.id !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(body.id)) throw error(400, 'Invalid id');
    // selectedBy is supplied only by PapeRobo after it verifies the saved attachment and chat membership.
    const selectedBy = body.action === 'open' ? body.selectedBy : body.userId;
    if (typeof selectedBy !== 'string' || !/^[0-9a-f-]{36}$/i.test(selectedBy)) throw error(400, 'Invalid sharing user');
    const row = await accessibleDocument(body.id, selectedBy);
    if (body.action === 'read') {
        if (row.markdown_content.length > 1_000_000) throw error(413, '資料の本文は100万文字以内にしてください。');
        return json({ ok: true, document: { id: row.id, title: row.title, kind: documentKind(row.markdown_content), source: row.markdown_content, isPublic: row.is_public === true } });
    }
    if (body.action === 'open') return json({ ok: true, ...documentLinks(row,selectedBy,url,true), isPublic: row.is_public === true });
    if (body.action === 'download' || body.action === 'add') {
        if (row.is_public !== true) throw error(403, '公開資料のみ保存できます。');
        if (body.action === 'download') return json({ ok: true, source: row.markdown_content, title: row.title });
        const slug = `chat-${randomUUID()}`;
        let markdown = row.markdown_content;
        if (/^---\s*\n/.test(markdown)) markdown = markdown.replace(/^---\s*\n([\s\S]*?)\n---/, (_, fm: string) => `---\nid: ${slug}\nis_public: false\n${fm.split('\n').filter(line => !/^(id|is_public|published_at):/.test(line)).join('\n')}\n---`);
        else markdown = `---\nid: ${slug}\nplay_mode: book\nis_public: false\n---\n${markdown}`;
        const { data, error: dbError } = await client.from('books').insert({ user_id: body.userId, slug, title: row.title, author: row.author || null, cover_image: row.cover_image || null, theme_color: row.theme_color || null, markdown_content: markdown, is_public: false, published_at: null }).select('id').single();
        if (dbError || !data) throw error(502, 'HyperCardBookに追加できませんでした。');
        return json({ ok: true, id: data.id });
    }
    throw error(400, 'Invalid action');
};
