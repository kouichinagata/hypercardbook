import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        env[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
});

const supabase = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data: books, error } = await supabase.from('books').select('*').limit(1);
    if (error) {
        console.error(error);
        return;
    }
    if (books && books.length > 0) {
        console.log("Columns:", Object.keys(books[0]));
    } else {
        console.log("No books found");
    }
}
run();
