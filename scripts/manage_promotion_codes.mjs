import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const command = args[0];
const options = parseOptions(args.slice(1));
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !serviceRoleKey) {
    fail('PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

if (command === 'issue') {
    requireProductionTarget();
    await issueCode();
} else if (command === 'revoke') {
    requireProductionTarget();
    await revokeCode();
} else if (command === 'list') {
    await listCodes();
} else {
    fail(
        'Usage: promotion:codes -- <issue|list|revoke> [options]\n' +
        'Issue:  issue --production --plan pro --days 30 --label summer-2026 [--code CODE] [--available-from ISO] [--redeem-by ISO] [--max-redemptions N]\n' +
        'List:   list\n' +
        'Revoke: revoke --production --id UUID'
    );
}

async function issueCode() {
    const plan = stringOption('plan');
    if (!['standard', 'pro', 'enterprise'].includes(plan)) {
        fail('--plan must be standard, pro, or enterprise.');
    }

    const days = positiveIntegerOption('days');
    const label = stringOption('label');
    if (!label) fail('--label is required.');

    const suppliedCode = options.code === true ? '' : String(options.code || '').trim();
    const plainCode = suppliedCode || `hcb-${randomBytes(18).toString('base64url')}`;
    const codeHash = createHash('sha256').update(plainCode).digest('hex');
    const availableFrom = optionalDateOption('available-from');
    const redeemBy = optionalDateOption('redeem-by');
    const maxRedemptions = optionalPositiveIntegerOption('max-redemptions');
    if (availableFrom && redeemBy && Date.parse(redeemBy) <= Date.parse(availableFrom)) {
        fail('--redeem-by must be later than --available-from.');
    }

    const { data, error } = await supabase
        .from('plan_promotion_codes')
        .insert({
            label,
            code_hash: codeHash,
            plan,
            entitlement_days: days,
            ...(availableFrom ? { available_from: availableFrom } : {}),
            redeem_by: redeemBy,
            max_redemptions: maxRedemptions
        })
        .select('id, label, plan, entitlement_days, available_from, redeem_by, max_redemptions')
        .single();

    if (error) fail(`Could not issue promotion code: ${error.message}`);

    console.log(JSON.stringify(data, null, 2));
    console.log(`Promotion code (shown once): ${plainCode}`);
}

async function revokeCode() {
    const id = stringOption('id');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        fail('--id must be a promotion code UUID.');
    }

    const { data, error } = await supabase
        .from('plan_promotion_codes')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('id, label, plan, is_active')
        .single();

    if (error) fail(`Could not revoke promotion code: ${error.message}`);
    console.log(JSON.stringify(data, null, 2));
}

async function listCodes() {
    const { data, error } = await supabase
        .from('plan_promotion_codes')
        .select('id, label, plan, entitlement_days, available_from, redeem_by, max_redemptions, redemption_count, is_active, created_at')
        .order('created_at', { ascending: false });

    if (error) fail(`Could not list promotion codes: ${error.message}`);
    console.log(JSON.stringify(data, null, 2));
}

function requireProductionTarget() {
    if (options.production !== true) {
        fail('Mutating commands require the explicit --production flag.');
    }

    let hostname = '';
    try {
        hostname = new URL(supabaseUrl).hostname;
    } catch {
        fail('PUBLIC_SUPABASE_URL is not a valid URL.');
    }
    if (!hostname.endsWith('.supabase.co')) {
        fail(`Refusing to mutate non-production Supabase target: ${hostname || '(unknown)'}`);
    }
}

function parseOptions(values) {
    const parsed = {};
    for (let index = 0; index < values.length; index += 1) {
        const token = values[index];
        if (!token.startsWith('--')) fail(`Unexpected argument: ${token}`);
        const key = token.slice(2);
        const next = values[index + 1];
        if (!next || next.startsWith('--')) {
            parsed[key] = true;
        } else {
            parsed[key] = next;
            index += 1;
        }
    }
    return parsed;
}

function stringOption(name) {
    return options[name] === true ? '' : String(options[name] || '').trim();
}

function positiveIntegerOption(name) {
    const value = Number(stringOption(name));
    if (!Number.isInteger(value) || value <= 0) fail(`--${name} must be a positive integer.`);
    return value;
}

function optionalPositiveIntegerOption(name) {
    if (options[name] === undefined) return null;
    return positiveIntegerOption(name);
}

function optionalDateOption(name) {
    if (options[name] === undefined) return null;
    const value = stringOption(name);
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) fail(`--${name} must be a valid ISO date/time.`);
    return new Date(timestamp).toISOString();
}

function fail(message) {
    console.error(message);
    process.exit(1);
}
