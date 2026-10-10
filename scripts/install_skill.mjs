// skills/<name>/ のフォルダ（SKILL.md と references/ など）を、指定ユーザーの個人 Skill として Supabase に登録する。
// 使い方:
//   node --env-file=.env scripts/install_skill.mjs <email> skills/manga-book            （確認のみ）
//   node --env-file=.env scripts/install_skill.mjs <email> skills/manga-book --apply    （書き込む）
// 何度実行しても同じ結果になる（user_id + name で upsert し、添付ファイルは入れ替える）。
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const [email, dir] = args.filter(arg => !arg.startsWith('--'));
if (!email || !dir) {
    console.error('Usage: node --env-file=.env scripts/install_skill.mjs <email> <skill-dir> [--apply]');
    process.exit(1);
}
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your .env file.');
    process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { autoRefreshToken: false, persistSession: false } });

// src/lib/skill-md.ts と同じ規則（.mjs から TS を直接読めないため複製）
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FILE_PATH_PATTERN = /^(?:references|assets)(?:\/[A-Za-z0-9_-][A-Za-z0-9._-]*)+$/;

function parseSkillMd(content) {
    const match = content.replace(/^﻿/, '').match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/);
    if (!match) throw new Error('SKILL.md needs a YAML frontmatter with name and description.');
    const metadata = {};
    for (const line of match[1].split(/\r?\n/)) {
        const kv = line.match(/^([A-Za-z0-9_-]+):[ \t]*(.*)$/);
        if (!kv) continue;
        let value = kv[2].trim();
        if (/^".*"$/.test(value)) value = JSON.parse(value);
        metadata[kv[1]] = value;
    }
    return { metadata, body: match[2].trim() };
}

function collectFiles(root, rel = '') {
    const files = [];
    for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
        const relPath = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) files.push(...collectFiles(root, relPath));
        else if (relPath !== 'SKILL.md') files.push({ path: relPath, content: fs.readFileSync(path.join(root, relPath), 'utf-8') });
    }
    return files;
}

async function findUser(targetEmail) {
    for (let page = 1; ; page++) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw new Error(`Failed to fetch users: ${error.message}`);
        const user = data.users.find(u => u.email?.toLowerCase() === targetEmail.toLowerCase());
        if (user) return user;
        if (data.users.length < 1000) return null;
    }
}

async function run() {
    const root = path.resolve(dir);
    const { metadata, body } = parseSkillMd(fs.readFileSync(path.join(root, 'SKILL.md'), 'utf-8'));
    const name = metadata.name;
    const description = metadata.description;
    if (!NAME_PATTERN.test(name || '') || name.length > 64) throw new Error(`Invalid skill name: ${name}`);
    if (!description || description.length > 1024) throw new Error('description is required (max 1024 characters).');
    if (!body || body.length > 100_000) throw new Error('SKILL.md body is empty or too long.');
    const files = collectFiles(root);
    for (const file of files) {
        if (!FILE_PATH_PATTERN.test(file.path) || file.path.length > 200) throw new Error(`Invalid skill file path: ${file.path}`);
        if (file.content.length > 200_000) throw new Error(`Skill file too large: ${file.path}`);
    }
    if (files.length > 20) throw new Error('A skill can contain at most 20 files.');

    const user = await findUser(email);
    if (!user) throw new Error(`User not found: ${email}`);
    console.log(`${apply ? '' : '[dry-run] '}Install skill "${name}" for ${user.email} (${user.id})`);
    console.log(`  description: ${description.slice(0, 80)}…`);
    console.log(`  body: ${body.length} chars, files: ${files.map(f => f.path).join(', ') || '(none)'}`);
    if (!apply) return console.log('[dry-run] No changes written. Add --apply to write.');

    const { data: skill, error } = await supabase.from('skills').upsert(
        { user_id: user.id, name, description, body, enabled: true, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,name' }
    ).select('id').single();
    if (error) throw new Error(`Failed to upsert skill: ${error.message}`);

    const { error: deleteError } = await supabase.from('skill_files').delete().eq('skill_id', skill.id);
    if (deleteError) throw new Error(`Failed to clear old files: ${deleteError.message}`);
    if (files.length > 0) {
        const { error: insertError } = await supabase.from('skill_files').insert(files.map(file => ({ skill_id: skill.id, ...file })));
        if (insertError) throw new Error(`Failed to insert files: ${insertError.message}`);
    }
    console.log('Done.');
}

run().catch(err => {
    console.error(err.message || err);
    process.exit(1);
});
