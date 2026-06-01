import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your .env file.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function run() {
    try {
        console.log('Fetching users from auth...');
        const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();
        
        if (usersError) {
            throw new Error(`Failed to fetch users: ${usersError.message}`);
        }

        if (users.length === 0) {
            console.error('\n⚠️ No users found in Supabase Auth.');
            console.error('Please register a user first by launching the site, clicking "ログイン (Login)" -> "新規登録 (Sign Up)".');
            console.error('Then run this migration script again.\n');
            process.exit(1);
        }

        const targetUser = users[0];
        console.log(`Migrating books under user: ${targetUser.email} (ID: ${targetUser.id})`);

        const booksDir = path.resolve('static/books');
        if (!fs.existsSync(booksDir)) {
            console.log('No static/books directory found. Nothing to migrate.');
            return;
        }

        const files = fs.readdirSync(booksDir);
        const mdFiles = files.filter(f => f.endsWith('.md') && f !== 'index.json');

        console.log(`Found ${mdFiles.length} markdown books to migrate.`);

        for (const filename of mdFiles) {
            const filePath = path.join(booksDir, filename);
            const content = fs.readFileSync(filePath, 'utf-8');

            const fmMatch = content.match(/^---\s*([\s\S]*?)\s*---/);
            let slug = filename.replace('.md', '');
            let title = '無題の書籍';
            let author = '';
            let coverImage = '';
            let themeColor = 'black';

            if (fmMatch) {
                const lines = fmMatch[1].split('\n');
                lines.forEach(line => {
                    const parts = line.split(':');
                    if (parts.length >= 2) {
                        const k = parts[0].trim();
                        const v = parts.slice(1).join(':').trim();
                        if (k === 'id') slug = v.replace(/[^a-zA-Z0-9_\-]/g, '');
                        if (k === 'title') title = v;
                        if (k === 'author') author = v;
                        if (k === 'cover_image') coverImage = v;
                        if (k === 'theme_color') themeColor = v;
                    }
                });
            }

            console.log(`Migrating: "${title}" (slug: ${slug})...`);

            const bookData = {
                user_id: targetUser.id,
                slug,
                title,
                author: author || null,
                cover_image: coverImage || null,
                theme_color: themeColor || 'black',
                markdown_content: content
            };

            const { error: upsertError } = await supabase
                .from('books')
                .upsert(bookData, { onConflict: 'slug' });

            if (upsertError) {
                console.error(`❌ Failed to migrate "${title}":`, upsertError.message);
            } else {
                console.log(`✅ Successfully migrated "${title}"`);
            }
        }

        console.log('\n🎉 Migration complete!');
    } catch (err) {
        console.error('Migration error:', err);
    }
}

run();
