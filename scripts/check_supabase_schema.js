import pkg from 'pg';
const { Client } = pkg;
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const dbPassword = process.env.DB_PASSWORD || '';

console.log('PUBLIC_SUPABASE_URL:', supabaseUrl);
console.log('SUPABASE_SERVICE_ROLE_KEY configured:', !!supabaseServiceKey);

const refMatch = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase/);
const projectRef = refMatch ? refMatch[1] : '';
const username = `postgres.${projectRef}`;
const host = `db.${projectRef}.supabase.co`;

async function checkSchema() {
    console.log('\n--- 1. Supabase Authのユーザーデータを確認中 ---');
    if (supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        try {
            const { data: { users }, error } = await supabase.auth.admin.listUsers();
            if (error) throw error;
            console.log(`登録ユーザー数: ${users.length}`);
            users.forEach((user, idx) => {
                console.log(`\n[User ${idx + 1}] ID: ${user.id}, Email: ${user.email}`);
                console.log('User Metadata:', JSON.stringify(user.user_metadata, null, 2));
                console.log('App Metadata:', JSON.stringify(user.app_metadata, null, 2));
            });
        } catch (err) {
            console.error('Auth check error:', err.message);
        }
    } else {
        console.log('Supabase credentials missing for Auth check.');
    }

    if (projectRef && dbPassword) {
        console.log('\n--- 2. SupabaseのDBテーブル一覧を取得中 ---');
        const client = new Client({
            host: host,
            port: 6543,
            user: username,
            password: dbPassword,
            database: 'postgres',
            ssl: { rejectUnauthorized: false }
        });

        try {
            await client.connect();
            const res = await client.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                ORDER BY table_name;
            `);
            console.log('【存在するテーブル一覧】:');
            res.rows.forEach(row => console.log(` - ${row.table_name}`));

            for (const row of res.rows) {
                const cols = await client.query(`
                    SELECT column_name, data_type 
                    FROM information_schema.columns 
                    WHERE table_schema = 'public' AND table_name = '${row.table_name}';
                `);
                console.log(`\nテーブル: ${row.table_name}`);
                cols.rows.forEach(c => console.log(`   * ${c.column_name} (${c.data_type})`));
            }

            await client.end();
        } catch (err) {
            console.error('Database connection error:', err.message);
        }
    } else {
        console.log('Database credentials missing for pg check.');
    }
}

checkSchema();
