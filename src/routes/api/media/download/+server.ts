import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { createClient } from '@supabase/supabase-js';

export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        const { url, id } = await request.json();
        const session = locals.session;

        if (!session) {
            return json({ error: 'Unauthorized. Please login first.' }, { status: 401 });
        }

        if (!url || !id) {
            return json({ error: 'Missing url or id.' }, { status: 400 });
        }

        const supabaseUrl = publicEnv.PUBLIC_SUPABASE_URL || env.PUBLIC_SUPABASE_URL || '';
        const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || '';

        if (!supabaseUrl || !serviceRoleKey) {
            console.error('Supabase server environment variables are missing.');
            return json({ error: 'Server configuration error.' }, { status: 500 });
        }

        // Create Supabase Admin client to bypass RLS policies for shared-pixabay folder
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });

        const bucketName = 'HyperCardBookBucket';
        const fileExtension = 'jpg';
        const filePath = `shared-pixabay/pixabay_${id}.${fileExtension}`;

        // 1. Check if the image file already exists in the bucket
        const { data: files, error: listError } = await supabaseAdmin.storage
            .from(bucketName)
            .list('shared-pixabay', {
                search: `pixabay_${id}`
            });

        if (listError) {
            console.error('Failed to list files from Supabase Storage:', listError);
        }

        const fileExists = files && files.some(file => file.name === `pixabay_${id}.${fileExtension}`);

        if (fileExists) {
            // Retrieve the public URL for the existing file
            const { data: publicUrlData } = supabaseAdmin.storage
                .from(bucketName)
                .getPublicUrl(filePath);

            return json({ url: publicUrlData.publicUrl });
        }

        // 2. Image does not exist, download it from Pixabay CDN
        const imageResponse = await fetch(url);
        if (!imageResponse.ok) {
            throw new Error(`Failed to fetch image from Pixabay (status: ${imageResponse.status})`);
        }

        const buffer = await imageResponse.arrayBuffer();

        // 3. Upload the image blob to Supabase Storage
        const { error: uploadError } = await supabaseAdmin.storage
            .from(bucketName)
            .upload(filePath, new Blob([buffer]), {
                contentType: 'image/jpeg',
                cacheControl: '3600',
                upsert: true
            });

        if (uploadError) {
            console.error('Upload to Supabase Storage failed:', uploadError);
            return json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
        }

        // 4. Retrieve public URL for the newly uploaded file
        const { data: publicUrlData } = supabaseAdmin.storage
            .from(bucketName)
            .getPublicUrl(filePath);

        return json({ url: publicUrlData.publicUrl });

    } catch (err: any) {
        console.error('Media download and self-host error:', err);
        return json({ error: err.message || 'Failed to download and self-host media.' }, { status: 500 });
    }
};
