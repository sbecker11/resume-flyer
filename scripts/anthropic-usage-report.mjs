#!/usr/bin/env node
/**
 * Report Anthropic API usage and USD cost via the Admin API.
 *
 * Requires ANTHROPIC_ADMIN_API_KEY (sk-ant-admin...) from:
 *   https://console.anthropic.com/settings/admin-keys
 *
 * Usage:
 *   npm run anthropic-usage
 *   npm run anthropic-usage -- --days 7
 *   ANTHROPIC_MONTHLY_ALERT_USD=50 npm run anthropic-usage
 *
 * Auto-reload for these API credits is configured in the Anthropic Console
 * (not by this script): https://platform.claude.com/settings/billing
 * Typical policy: when balance reaches $5, reload up to $25.
 */
import 'dotenv/config';
import { reportError } from '../modules/utils/errorReporting.mjs';

const ADMIN_BASE = 'https://api.anthropic.com/v1/organizations';

function parseArgs(argv) {
    let days = 7;
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--days' && argv[i + 1]) {
            days = Math.min(31, Math.max(1, parseInt(argv[i + 1], 10) || 7));
            i++;
        }
        if (argv[i] === '--help' || argv[i] === '-h') {
            console.log(`Usage: node scripts/anthropic-usage-report.mjs [--days 7]

Env:
  ANTHROPIC_ADMIN_API_KEY   Admin key (sk-ant-admin...) — required
  ANTHROPIC_MONTHLY_ALERT_USD  Warn when period cost exceeds this (default: 25)
`);
            process.exit(0);
        }
    }
    return { days };
}

function snapDayStart(d) {
    const x = new Date(d);
    x.setUTCHours(0, 0, 0, 0);
    return x.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function snapDayEnd(d) {
    const x = new Date(d);
    x.setUTCHours(23, 59, 59, 0);
    return x.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * @param {string} adminKey
 * @param {string} endpoint e.g. usage_report/messages
 * @param {Record<string, string>} params
 */
async function adminGet(adminKey, endpoint, params) {
    const url = new URL(`${ADMIN_BASE}/${endpoint}`);
    for (const [k, v] of Object.entries(params)) {
        if (v != null && v !== '') url.searchParams.set(k, v);
    }
    const res = await fetch(url, {
        headers: {
            'anthropic-version': '2023-06-01',
            'x-api-key': adminKey,
        },
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Admin API ${endpoint} ${res.status}: ${body.slice(0, 400)}`);
    }
    return res.json();
}

async function fetchAllBuckets(adminKey, endpoint, params) {
    const buckets = [];
    let page = null;
    let guard = 0;
    do {
        const q = { ...params };
        if (page) q.page = page;
        const data = await adminGet(adminKey, endpoint, q);
        buckets.push(...(data.data || []));
        page = data.has_more ? data.next_page : null;
        guard++;
    } while (page && guard < 50);
    return buckets;
}

function sumCostUsd(buckets) {
    let cents = 0;
    for (const bucket of buckets) {
        for (const row of bucket.results || []) {
            const amount = parseFloat(row.amount || '0');
            if (!Number.isNaN(amount)) cents += amount;
        }
    }
    return cents / 100;
}

function sumTokens(buckets) {
    let input = 0;
    let output = 0;
    const byModel = new Map();
    for (const bucket of buckets) {
        for (const row of bucket.results || []) {
            const uncached = row.uncached_input_tokens || 0;
            const cacheRead = row.cache_read_input_tokens || 0;
            const cacheCreate = (row.cache_creation?.ephemeral_1h_input_tokens || 0)
                + (row.cache_creation?.ephemeral_5m_input_tokens || 0);
            const out = row.output_tokens || 0;
            input += uncached + cacheRead + cacheCreate;
            output += out;
            const model = row.model || 'unknown';
            const prev = byModel.get(model) || { input: 0, output: 0 };
            prev.input += uncached + cacheRead + cacheCreate;
            prev.output += out;
            byModel.set(model, prev);
        }
    }
    return { input, output, byModel };
}

async function main() {
    const { days } = parseArgs(process.argv.slice(2));
    const adminKey = (process.env.ANTHROPIC_ADMIN_API_KEY || '').trim();
    if (!adminKey) {
        console.error('ANTHROPIC_ADMIN_API_KEY is not set.');
        console.error('Create an Admin API key at https://console.anthropic.com/settings/admin-keys');
        process.exit(1);
    }
    if (!adminKey.startsWith('sk-ant-admin')) {
        console.warn('Warning: Admin API keys usually start with sk-ant-admin...');
    }

    const alertUsd = parseFloat(process.env.ANTHROPIC_MONTHLY_ALERT_USD || '25');
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (days - 1));

    const startingAt = snapDayStart(start);
    const endingAt = snapDayEnd(end);

    console.log(`Anthropic API usage (${days} day(s))`);
    console.log(`  ${startingAt} → ${endingAt}`);
    console.log('');

    const [usageBuckets, costBuckets] = await Promise.all([
        fetchAllBuckets(adminKey, 'usage_report/messages', {
            starting_at: startingAt,
            ending_at: endingAt,
            bucket_width: '1d',
            limit: String(days),
            group_by: 'model',
        }),
        fetchAllBuckets(adminKey, 'cost_report', {
            starting_at: startingAt,
            ending_at: endingAt,
            bucket_width: '1d',
            limit: String(days),
            group_by: 'description',
        }),
    ]);

    const tokens = sumTokens(usageBuckets);
    const costUsd = sumCostUsd(costBuckets);

    console.log(`Total tokens: ${tokens.input.toLocaleString()} in / ${tokens.output.toLocaleString()} out`);
    console.log(`Estimated cost: $${costUsd.toFixed(2)} USD`);
    console.log('');
    console.log('By model:');
    for (const [model, counts] of [...tokens.byModel.entries()].sort((a, b) => b[1].input - a[1].input)) {
        console.log(`  ${model}: ${counts.input.toLocaleString()} in, ${counts.output.toLocaleString()} out`);
    }

    if (alertUsd > 0 && costUsd >= alertUsd) {
        console.log('');
        console.warn(`⚠️  Cost $${costUsd.toFixed(2)} meets or exceeds ANTHROPIC_MONTHLY_ALERT_USD=$${alertUsd}`);
        console.warn('   Auto-reload API credits: https://platform.claude.com/settings/billing');
        console.warn('   Recommended: reload to $25 when balance reaches $5.');
    }

    console.log('');
    console.log('Billing pools (do not mix these up):');
    console.log('  • API key (sk-ant-api...) — resume-flyer skill ? + resume-parser');
    console.log('  • Cursor Ultra — IDE Agent only (separate from API)');
    console.log('  • Extra usage credits — claude.ai auto-reload for OAuth tools (not API keys)');
}

main().catch((e) => {
    reportError(e, '[anthropic-usage-report] Failed');
    process.exit(1);
});
