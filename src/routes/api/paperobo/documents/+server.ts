import { effectivePlanFromUser, isPaidPlan, isProPlan } from '$lib/plan';
import { issueCertificate, certificateState } from '$lib/server/certificates';
import { hasSignMarkers, signSlotKinds } from '$lib/signature/markers';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { adminClient, applyStamp, applySignature } from '$lib/server/signatures';
import { documentSecret, documentClient, accessibleDocument, documentKind, documentLinks } from '$lib/server/paperoboDocuments';
export const POST: RequestHandler = async ({ request, url }) => {
    const expected = Buffer.from(documentSecret());
    const received = Buffer.from((request.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''));
    if (!expected.length || expected.length !== received.length || !timingSafeEqual(expected, received)) throw error(401, 'Unauthorized');
    const body = await request.json();
    if (!body || typeof body.userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.userId)) throw error(400, 'Invalid user');
    const client = documentClient();
    if (body.action === 'list') {
        if (!['card','book','miniapp','hyperrobo','paperobo','scenariobook'].includes(body.kind)) throw error(400, 'Invalid kind');
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
    const selectedBy = ['open', 'stamp', 'download', 'sign-certificate'].includes(body.action) ? (body.selectedBy || body.userId) : body.userId;
    if (typeof selectedBy !== 'string' || !/^[0-9a-f-]{36}$/i.test(selectedBy)) throw error(400, 'Invalid sharing user');
    const row = await accessibleDocument(body.id, selectedBy);
    if (body.action === 'issue-certificate' || body.action === 'read-contract') {
        const { data, error: userError } = await adminClient().auth.admin.getUserById(body.userId);
        if (userError || !data.user) throw error(503, 'Could not confirm your plan.');
        const plan = effectivePlanFromUser(data.user);
        if (body.action === 'issue-certificate' ? !isProPlan(plan) : !isPaidPlan(plan)) throw error(403, body.action === 'issue-certificate' ? 'Certificate issuance requires Pro or above.' : 'Contract issuance requires Standard or above.');
        if (documentKind(row.markdown_content) !== 'card') throw error(400, 'Only HyperCards can be used.');
        if (!signSlotKinds(row.markdown_content).length) throw error(400, 'This card has no MarkdownAIVerify fields.');
    }
    if (body.action === 'issue-certificate') {
        if (documentKind(row.markdown_content) !== 'card') throw error(400, 'Only HyperCards can be used as certificate templates.');
        if (row.markdown_content.length > 1_000_000 - 2048) throw error(413, 'The certificate template is too large.');
        return json({ ok: true, document: await issueCertificate(adminClient(), row, body.userId) }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const certificate = body.certificateId ? await certificateState(adminClient(), row.id, row.markdown_content, body.certificateId) : null;
    if (body.action === 'read' || body.action === 'read-contract') {
        if (row.markdown_content.length > 1_000_000) throw error(413, '資料の本文は100万文字以内にしてください。');
        return json({ ok: true, document: { id: row.id, title: row.title, kind: documentKind(row.markdown_content), source: row.markdown_content, isPublic: row.is_public === true } });
    }
    if (certificate?.record) row.markdown_content = certificate.record.markdown;
    const nextSlot = certificate ? signSlotKinds(row.markdown_content).findIndex(kind => body.userId === row.user_id ? kind !== 'your' : kind !== 'my') : -1;
    if (body.action === 'sign-certificate') {
        if (!certificate || certificate.status === 'complete') throw error(409, 'No certificate field is left to sign.');
        const outcome = await applySignature(adminClient(), { bookId: row.id, slot: body.slot, kind: body.kind, baseVersion: body.baseVersion, svg: body.svg, actor: body.userId === row.user_id ? { type: 'owner', userId: body.userId } : { type: 'guest', name: null, userId: body.userId } });
        if (!outcome.ok) throw error(outcome.status, outcome.error);
        return json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (body.action === 'open') {
        const progress = certificate ? {
            status: certificate.status,
            remaining: certificate.remaining,
            verifyId: certificate.verifyId,
            ...(nextSlot >= 0 ? { nextSlot: { slot: nextSlot, kind: signSlotKinds(row.markdown_content)[nextSlot], version: row.version } } : {})
        } : undefined;
        return json({
            ok: true,
            ...(progress ? { certificate: progress } : {}),
            ...documentLinks(row, selectedBy, url, true, body.certificateId),
            isPublic: row.is_public === true,
            hasSignMarkers: documentKind(row.markdown_content) === 'card' && hasSignMarkers(row.markdown_content)
        }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (body.action === 'stamp') {
        if (certificate?.status === 'complete') throw error(409, 'This certificate is already complete.');
        // PapeRobo has already checked that body.userId may see this document (a chat participant); the seal is pressed as that user
        if (documentKind(row.markdown_content) !== 'card') throw error(400, 'Only cards can be stamped.');
        const outcome = await applyStamp(adminClient(), { bookId: row.id, svg: body.svg, mode: body.mode, userId: body.userId });
        if (!outcome.ok) throw error(outcome.status, outcome.error);
        const { ok, markdown: _markdown, ...result } = outcome;
        return json({ ok, ...result });
    }
    if (body.action === 'download' || body.action === 'add') {
        if (body.action === 'download' && certificate) {
            if (certificate.status === 'recording') throw error(503, 'The completed certificate has not been recorded yet. Please try again.');
            return json({ ok: true, source: certificate.record?.markdown || row.markdown_content, title: row.title }, { headers: { 'Cache-Control': 'no-store' } });
        }
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
