#!/usr/bin/env node
/**
 * scripts/kv-cleanup.mjs
 *
 * Removes stale, expired and legacy keys from KV. Everything that carries user
 * value — profiles, points, mints, volume, leaderboards, battle records — is
 * preserved.
 *
 * Usage:
 *   node scripts/kv-cleanup.mjs                     # dry run (default)
 *   node scripts/kv-cleanup.mjs --apply             # delete
 *   node scripts/kv-cleanup.mjs --apply --reset-battle-count
 *
 * Requires UPSTASH_REDIS_REST_URL/TOKEN (or KV_REST_API_URL/TOKEN) in the env.
 * Load a .env file with Node's own flag if needed:
 *   node --env-file=.env scripts/kv-cleanup.mjs
 */

import { kv } from '../api/_lib/kv.js';

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const RESET_BATTLE_COUNT = args.has('--reset-battle-count');
const CHUNK = 100;

/**
 * Stale key patterns. These are all either expired-by-design or superseded.
 *  - challenge:ttl:*   legacy per-challenge TTL markers (expiry is now inline)
 *  - nonce:*           one-time SIWE nonces (5 min TTL, safe to clear)
 *  - ratelimit:*       rolling counters (60 s TTL)
 *  - lb:*              pre-rename leaderboards (current names are leaderboard:*)
 *  - events:*          legacy raw event blobs (no longer written)
 */
const STALE_PATTERNS = [
    'challenge:ttl:*',
    'nonce:*',
    'ratelimit:*',
    'lb:*',
    'events:*'
];

/** Never touched, listed for reassurance. */
const PRESERVED_PATTERNS = [
    'user:*:profile',
    'leaderboard:*',
    'stats:global',
    'battle:*',
    'history:user:*',
    'daily:stats:*',
    'collection:*'
];

function requireEnv() {
    const hasUpstash = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;
    const hasLegacy = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;
    if (!hasUpstash && !hasLegacy) {
        console.error('✖ Missing KV credentials. Set UPSTASH_REDIS_REST_URL/TOKEN or KV_REST_API_URL/TOKEN.');
        process.exit(1);
    }
}

/** SCAN, never KEYS: KEYS blocks the server on large datasets. */
async function scanKeys(pattern) {
    const found = [];
    let cursor = 0;
    do {
        const [next, keys] = await kv.scan(cursor, { match: pattern, count: 500 });
        cursor = next;
        found.push(...(keys || []));
    } while (cursor !== 0 && cursor !== '0');
    return found;
}

async function deleteKeys(keys) {
    for (let i = 0; i < keys.length; i += CHUNK) {
        const pipe = kv.pipeline();
        keys.slice(i, i + CHUNK).forEach((key) => pipe.del(key));
        await pipe.exec();
    }
}

async function main() {
    requireEnv();

    console.log(APPLY
        ? '▶ KV cleanup — APPLY mode (keys will be deleted)'
        : '▶ KV cleanup — DRY RUN (nothing is deleted; re-run with --apply)');

    let total = 0;

    for (const pattern of STALE_PATTERNS) {
        const keys = await scanKeys(pattern);
        total += keys.length;
        console.log(`\n${pattern.padEnd(20)} ${keys.length} key(s)`);
        keys.slice(0, 5).forEach((key) => console.log(`   ${key}`));
        if (keys.length > 5) console.log(`   … ${keys.length - 5} more`);

        if (APPLY && keys.length > 0) {
            await deleteKeys(keys);
            console.log('   ✔ deleted');
        }
    }

    // Expired challenges inside the active hash (expiry now lives in the value).
    const { listActiveChallenges } = await import('../api/_lib/kv.js');
    const active = await listActiveChallenges();
    console.log(`\nchallenges:active     ${active.length} still-valid challenge(s) kept`);

    if (RESET_BATTLE_COUNT) {
        // Opt-in only: this is a live analytics counter, not a stale key.
        console.log('\n⚠ global:battle_count reset requested');
        if (APPLY) {
            await kv.set('global:battle_count', 0);
            console.log('   ✔ reset to 0');
        }
    }

    console.log('\n=== PRESERVED (never touched) ===');
    for (const pattern of PRESERVED_PATTERNS) {
        const keys = await scanKeys(pattern);
        console.log(`${pattern.padEnd(22)} ${keys.length} key(s)`);
    }

    console.log(`\nDone. ${APPLY ? 'Deleted' : 'Would delete'} ${total} stale key(s).`);
    if (!APPLY) console.log('No changes were written. Re-run with --apply to commit them.');
}

main().catch((err) => {
    console.error('✖ Cleanup failed:', err);
    process.exit(1);
});
