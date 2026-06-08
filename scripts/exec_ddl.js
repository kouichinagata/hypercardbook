import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';

// Read .env file
const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        env[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
});

const supabaseUrl = env.PUBLIC_SUPABASE_URL || '';
const dbPassword = env.DB_PASSWORD || '';

if (!supabaseUrl || !dbPassword) {
    console.error('Error: PUBLIC_SUPABASE_URL and DB_PASSWORD must be defined in .env');
    process.exit(1);
}

const refMatch = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase/);
if (!refMatch) {
    console.error('Error: Could not extract project reference ID from PUBLIC_SUPABASE_URL');
    process.exit(1);
}
const projectRef = refMatch[1];
const username = `postgres.${projectRef}`;

// Generate candidates for the connection pooler host
const hosts = [];
const regions = ['ap-northeast-1', 'ap-southeast-1', 'us-east-1', 'us-west-2', 'eu-west-1', 'eu-west-2'];
const indices = ['aws-0', 'aws-1', 'aws-2', 'aws-3'];

for (const region of regions) {
    for (const idx of indices) {
        hosts.push(`${idx}-${region}.pooler.supabase.com`);
    }
}

async function runMigration(client, host) {
    await client.connect();
    console.log(`\n🎉 Successfully connected to ${host}!`);
    console.log('Executing ALTER TABLE queries...');
    
    await client.query(`
        ALTER TABLE books ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;
    `);
    console.log('✅ Added is_public column (or already exists).');

    await client.query(`
        ALTER TABLE books ADD COLUMN IF NOT EXISTS published_at TIMESTAMP WITH TIME ZONE;
    `);
    console.log('✅ Added published_at column (or already exists).');

    await client.end();
    console.log('🚀 Database migration completed successfully.');
}

async function scanPoolers() {
    console.log(`Scanning poolers for project: ${projectRef}`);
    console.log(`Username: ${username}`);
    
    for (const host of hosts) {
        console.log(`Trying host: ${host} ...`);
        
        const client = new Client({
            host: host,
            port: 6543,
            user: username,
            password: dbPassword,
            database: 'postgres',
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 3000 // Timeout quickly
        });

        try {
            await runMigration(client, host);
            return; // Migration succeeded!
        } catch (err) {
            console.log(`   ❌ Error on ${host}: [${err.code || 'NO_CODE'}] ${err.message}`);
        }
    }
    
    console.error('\n❌ Could not connect to any pooler hosts.');
    console.error('Please check if the DB_PASSWORD is correct.');
    process.exit(1);
}

scanPoolers();
