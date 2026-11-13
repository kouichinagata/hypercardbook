import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import sharp from 'sharp';
import { IMAGE_BUCKET, measureStoredBytes, storageLimitForPlan, storagePathFromPublicUrl } from '$lib/server/image-gen';
import { effectivePlanFromUser } from '$lib/plan';

// A wide picture (double-page spread, cols=2 rows=1) or a grid picture (2 or 4 pages in one image, cols=2 rows=1|2) is cut into cells and every cell is stored,
// so each book page is a plain image that works in every view and export.
export const POST: RequestHandler = async ({ request, locals }) => {
    const uploadedPaths: string[] = [];
    try {
        const session = locals.session;
        if (!session) return json({ error: 'Unauthorized. Please login first.' }, { status: 401 });
        const { url, cols: rawCols, rows: rawRows } = await request.json();
        const cols = Math.min(2, Math.max(1, Math.floor(Number(rawCols) || 2)));
        const rows = Math.min(2, Math.max(1, Math.floor(Number(rawRows) || 1)));
        const userId = session.user.id;
        const supabase = locals.supabase;

        const sourcePath = storagePathFromPublicUrl(String(url ?? ''), userId);
        if (!sourcePath) return json({ error: 'Only your own stored images can be split.' }, { status: 400 });
        const { data, error } = await supabase.storage.from(IMAGE_BUCKET).download(sourcePath);
        if (error || !data) return json({ error: 'Could not load the image.' }, { status: 400 });

        const source = Buffer.from(await data.arrayBuffer());
        const meta = await sharp(source).metadata();
        if (!meta.width || !meta.height) return json({ error: 'Could not read the image size.' }, { status: 400 });
        const cellW = Math.floor(meta.width / cols);
        const cellH = Math.floor(meta.height / rows);
        const parts: Buffer[] = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                parts.push(await sharp(source).extract({ left: c * cellW, top: r * cellH, width: cellW, height: cellH }).jpeg({ quality: 90 }).toBuffer());
            }
        }

        const used = await measureStoredBytes(supabase, userId);
        if (used + parts.reduce((sum, b) => sum + b.byteLength, 0) > storageLimitForPlan(effectivePlanFromUser(session.user))) {
            return json({ error: 'Image storage limit exceeded.' }, { status: 403 });
        }

        const urls: string[] = [];
        for (const bytes of parts) {
            const path = `${userId}/spread_${crypto.randomUUID()}.jpg`;
            const { error: uploadError } = await supabase.storage.from(IMAGE_BUCKET).upload(path, bytes, {
                contentType: 'image/jpeg',
                cacheControl: '31536000',
                upsert: false
            });
            if (uploadError) throw uploadError;
            uploadedPaths.push(path);
            urls.push(supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl);
        }
        return json({ success: true, urls, left: urls[0], right: urls[1] });
    } catch (err: any) {
        if (uploadedPaths.length > 0) await locals.supabase.storage.from(IMAGE_BUCKET).remove(uploadedPaths);
        console.error('[Split-Image Error]:', err);
        return json({ error: err.message || 'Failed to split image' }, { status: 500 });
    }
};
