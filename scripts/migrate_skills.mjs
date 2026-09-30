// data/skills/<userId>/ と user_metadata.user_plugins の Skill を Supabase の skills テーブルへ移行する。
// 使い方: npm run skills:migrate -- --dry-run   （--dry-run を外すと書き込む）
// 何度実行しても同じ結果になる（user_id + name で upsert）。index.js（実行コード）は移行しない。
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const dryRun = process.argv.includes('--dry-run');
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your .env file.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

// src/lib/skill-md.ts と同じ規則（.mjs から TS を直接読めないため複製）
function normalizeSkillName(raw) {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 64)
        .replace(/-$/, '');
}

function fallbackDescription(body) {
    const firstLine = body.split('\n').map(line => line.replace(/^[\s#>*-]+/, '').trim()).find(Boolean) || '';
    return firstLine.slice(0, 200);
}

function parseSkillMd(content) {
    const match = content.replace(/^﻿/, '').match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/);
    if (!match) return { metadata: {}, body: content.trim() };
    const metadata = {};
    for (const line of match[1].split(/\r?\n/)) {
        const kv = line.match(/^([A-Za-z0-9_-]+):[ \t]*(.*)$/);
        if (!kv) continue;
        let value = kv[2].trim();
        if (/^".*"$/.test(value)) {
            try { value = JSON.parse(value); } catch { value = value.slice(1, -1); }
        }
        metadata[kv[1]] = value;
    }
    return { metadata, body: match[2].trim() };
}

async function listAllUsers() {
    const users = [];
    for (let page = 1; ; page++) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw new Error(`Failed to fetch users: ${error.message}`);
        users.push(...data.users);
        if (data.users.length < 1000) return users;
    }
}

// oldId (my-plugin-xxx) -> { name, description, body }
function collectSkills(user) {
    const skills = new Map();

    const userDir = path.resolve('data/skills', user.id);
    if (fs.existsSync(userDir)) {
        for (const entry of fs.readdirSync(userDir, { withFileTypes: true })) {
            const mdPath = path.join(userDir, entry.name, 'SKILL.md');
            if (!entry.isDirectory() || !fs.existsSync(mdPath)) continue;
            const { metadata, body } = parseSkillMd(fs.readFileSync(mdPath, 'utf-8'));
            if (!body) continue;
            skills.set(`my-plugin-${entry.name}`, {
                name: normalizeSkillName(entry.name),
                description: metadata.description || '',
                body
            });
        }
    }

    for (const plugin of user.user_metadata?.user_plugins || []) {
        if (typeof plugin?.id !== 'string' || !plugin.id.startsWith('my-plugin-')) continue;
        const body = String(plugin.skill || '').trim();
        if (!body) continue;
        const existing = skills.get(plugin.id);
        if (existing) {
            if (!existing.description && plugin.description) existing.description = String(plugin.description);
            continue;
        }
        skills.set(plugin.id, {
            name: normalizeSkillName(plugin.id.slice('my-plugin-'.length)) || normalizeSkillName(plugin.name),
            description: String(plugin.description || ''),
            body
        });
    }

    for (const [oldId, skill] of skills) {
        if (!skill.name) skill.name = `skill-${Buffer.from(oldId).toString('hex').slice(0, 12)}`;
        skill.description = (skill.description.trim() || fallbackDescription(skill.body) || skill.name).slice(0, 1024);
    }
    return skills;
}

async function run() {
    const users = await listAllUsers();
    console.log(`${dryRun ? '[dry-run] ' : ''}Checking ${users.length} users...`);
    let migrated = 0;

    for (const user of users) {
        const skills = collectSkills(user);
        if (skills.size === 0) continue;

        console.log(`\nUser ${user.email || user.id} (${user.id})`);
        const idMap = new Map();
        for (const [oldId, skill] of skills) {
            const newId = `my-plugin-${skill.name}`;
            idMap.set(oldId, newId);
            console.log(`  ${oldId} -> ${skill.name}  description: ${JSON.stringify(skill.description.slice(0, 60))}`);
            if (dryRun) continue;
            const { error } = await supabase.from('skills').upsert({
                user_id: user.id,
                name: skill.name,
                description: skill.description,
                body: skill.body,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id,name' });
            if (error) throw new Error(`Failed to upsert ${skill.name}: ${error.message}`);
            migrated++;
        }

        const metadata = user.user_metadata || {};
        const activeIds = Array.isArray(metadata.active_plugin_ids) ? metadata.active_plugin_ids : null;
        const userPlugins = Array.isArray(metadata.user_plugins) ? metadata.user_plugins : null;
        const nextActiveIds = activeIds ? [...new Set(activeIds.map(id => idMap.get(id) || id))] : activeIds;
        const nextUserPlugins = userPlugins
            ? userPlugins.map(plugin => {
                const newId = idMap.get(plugin?.id);
                return newId ? { ...plugin, id: newId, name: newId.slice('my-plugin-'.length) } : plugin;
            })
            : userPlugins;

        if (JSON.stringify(nextActiveIds) !== JSON.stringify(activeIds) || JSON.stringify(nextUserPlugins) !== JSON.stringify(userPlugins)) {
            console.log(`  metadata: active_plugin_ids ${JSON.stringify(activeIds)} -> ${JSON.stringify(nextActiveIds)}`);
            if (!dryRun) {
                const { error } = await supabase.auth.admin.updateUserById(user.id, {
                    user_metadata: { ...metadata, active_plugin_ids: nextActiveIds, user_plugins: nextUserPlugins }
                });
                if (error) throw new Error(`Failed to update metadata for ${user.id}: ${error.message}`);
            }
        }
    }

    console.log(`\n${dryRun ? '[dry-run] No changes written.' : `Migrated ${migrated} skills.`}`);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
