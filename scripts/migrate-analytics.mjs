#!/usr/bin/env node
/**
 * Analytics data migration / reconciliation
 * ─────────────────────────────────────────
 * Repairs counters that the pre-fix write paths corrupted. Nothing is deleted:
 * every historical row is preserved and corrected in place, so all existing
 * data keeps rendering in the dashboard.
 *
 * What it fixes
 *  1. leaderboard:battle_wins:all_time
 *     AI victories were written twice (POST /api/battle?action=record AND the
 *     client's battle_result_v2 event) while user:<w>:profile.battle_wins was
 *     written once. The ladder is rebuilt from the profiles, which are the
 *     single-counted source of truth.
 *  2. stats:global.battle_wins
 *     PvP attacker victories were never counted globally (the counter sat
 *     inside the `affectsGlobal` branch, and only the defender event carries
 *     it), so the global win rate was biased downward. Recomputed as the sum of
 *     all profile battle_wins.
 *  3. leaderboard:battle_wins:week:<ISO week>  (--weekly)
 *     Optional: clamps weekly rows to at most the wallet's all-time wins.
 *  4. user:*:first_connect  (--cleanup)
 *     Optional: these keys are never read and were written without a TTL.
 *     Gives them a 1 year expiry instead of deleting them.
 *
 * Usage
 *   node scripts/migrate-analytics.mjs                # dry run (default)
 *   node scripts/migrate-analytics.mjs --apply        # write changes
 *   node scripts/migrate-analytics.mjs --apply --weekly --cleanup
 *
 * Requires UPSTASH_REDIS_REST_URL/TOKEN (or KV_REST_API_URL/TOKEN) in the env.
 */

import { kv } from '../api/_lib/kv.js';
import { getWeekNumber } from '../api/_lib/events.js';

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const DO_WEEKLY = args.has('--weekly');
const DO_CLEANUP = args.has('--cleanup');
const CHUNK = 100;

const LADDER_KEY = 'leaderboard:battle_wins:all_time';

function log(...parts) {
    console.log(...parts);
}

function requireEnv() {
    const hasUpstash = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;
    const hasLegacy = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;
    if (!hasUpstash && !hasLegacy) {
        console.error('✖ Missing KV credentials. Set UPSTASH_REDIS_REST_URL/TOKEN or KV_REST_API_URL/TOKEN.');
        process.exit(1);
    }
}

/** zrange withScores returns a flat [member, score, ...] array on Upstash. */
function toScoreMap(raw) {
    const map = new Map();
    if (!Array.isArray(raw)) return map;
    for (let i = 0; i < raw.length; i += 2) {
        const member = String(raw[i] || '').toLowerCase();
        if (member) map.set(member, parseFloat(raw[i + 1]) || 0);
    }
    return map;
}

async function fetchProfiles(wallets) {
    const profiles = [];
    for (let i = 0; i < wallets.length; i += CHUNK) {
        const slice = wallets.slice(i, i + CHUNK);
        const pipe = kv.pipeline();
        slice.forEach((w) => pipe.hgetall(`user:${w}:profile`));
        profiles.push(...(await pipe.exec()));
    }
    return profiles;
}

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

async function reconcileLadder() {
    log('\n── 1. Arena ladder vs profiles ─────────────────────────────');

    const ladder = toScoreMap(await kv.zrange(LADDER_KEY, 0, -1, { rev: true, withScores: true }));

    // Include wallets that have a profile with wins but somehow fell out of the
    // ladder, so nobody disappears from the board after the migration.
    const profileKeys = await scanKeys('user:*:profile');
    const profileWallets = profileKeys
        .map((key) => key.split(':')[1]?.toLowerCase())
        .filter(Boolean);

    const wallets = [...new Set([...ladder.keys(), ...profileWallets])];
    log(`   ladder members: ${ladder.size}, profiles found: ${profileWallets.length}, union: ${wallets.length}`);

    const profiles = await fetchProfiles(wallets);

    const changes = [];
    let globalWins = 0;

    for (let i = 0; i < wallets.length; i++) {
        const wallet = wallets[i];
        const profileWins = parseInt(profiles[i]?.battle_wins, 10) || 0;
        globalWins += profileWins;

        const current = ladder.get(wallet);
        // Skip wallets that were never on the ladder and have no wins.
        if (current === undefined && profileWins === 0) continue;
        if ((current || 0) === profileWins) continue;

        changes.push({ wallet, from: current ?? null, to: profileWins });
    }

    const doubled = changes.filter((c) => c.from != null && c.to > 0 && c.from === c.to * 2).length;
    log(`   mismatched rows : ${changes.length}`);
    log(`   exactly 2x      : ${doubled}  (signature of the double-count bug)`);
    log(`   Σ profile wins  : ${globalWins}`);

    for (const change of changes.slice(0, 15)) {
        log(`     ${change.wallet}  ${change.from ?? '(absent)'} → ${change.to}`);
    }
    if (changes.length > 15) log(`     … ${changes.length - 15} more`);

    if (!APPLY) return { changes, globalWins };

    for (let i = 0; i < changes.length; i += CHUNK) {
        const pipe = kv.pipeline();
        for (const change of changes.slice(i, i + CHUNK)) {
            pipe.zadd(LADDER_KEY, { score: change.to, member: change.wallet });
        }
        await pipe.exec();
    }
    log(`   ✔ ladder rewritten (${changes.length} rows)`);

    return { changes, globalWins };
}

async function reconcileGlobalWins(globalWins) {
    log('\n── 2. stats:global.battle_wins ─────────────────────────────');

    const stats = (await kv.hgetall('stats:global')) || {};
    const current = parseInt(stats.battle_wins, 10) || 0;
    const battleTotal = parseInt(stats.battle_total, 10) || 0;

    log(`   current: ${current}  →  recomputed: ${globalWins}  (battle_total: ${battleTotal})`);

    if (globalWins > battleTotal) {
        log('   ⚠ recomputed wins exceed battle_total; battle_total will be raised to match.');
    }

    if (!APPLY) return;

    const update = { battle_wins: globalWins };
    if (globalWins > battleTotal) update.battle_total = globalWins;
    await kv.hset('stats:global', update);
    log('   ✔ global battle counters updated');
}

async function reconcileWeekly() {
    log('\n── 3. Weekly arena boards ──────────────────────────────────');

    const keys = await scanKeys('leaderboard:battle_wins:week:*');
    if (keys.length === 0) {
        log('   no weekly boards found');
        return;
    }

    const allTime = toScoreMap(await kv.zrange(LADDER_KEY, 0, -1, { rev: true, withScores: true }));
    const currentWeekKey = `leaderboard:battle_wins:week:${getWeekNumber(new Date())}`;
    let clamped = 0;

    for (const key of keys) {
        const week = toScoreMap(await kv.zrange(key, 0, -1, { rev: true, withScores: true }));
        const fixes = [];

        for (const [wallet, score] of week) {
            const cap = allTime.get(wallet) ?? 0;
            if (score > cap) fixes.push({ wallet, from: score, to: cap });
        }

        if (fixes.length === 0) continue;
        clamped += fixes.length;
        log(`   ${key}${key === currentWeekKey ? ' (current)' : ''}: ${fixes.length} rows above all-time`);

        if (!APPLY) continue;
        const pipe = kv.pipeline();
        fixes.forEach((f) => pipe.zadd(key, { score: f.to, member: f.wallet }));
        await pipe.exec();
    }

    log(clamped === 0 ? '   nothing to clamp' : `   ${APPLY ? '✔ clamped' : 'would clamp'} ${clamped} rows`);
}

async function cleanupFirstConnect() {
    log('\n── 4. user:*:first_connect TTL ─────────────────────────────');

    const keys = await scanKeys('user:*:first_connect');
    log(`   keys without expiry policy: ${keys.length}`);
    if (keys.length === 0 || !APPLY) return;

    for (let i = 0; i < keys.length; i += CHUNK) {
        const pipe = kv.pipeline();
        keys.slice(i, i + CHUNK).forEach((key) => pipe.expire(key, 60 * 60 * 24 * 365));
        await pipe.exec();
    }
    log('   ✔ 1 year TTL applied (data kept, growth bounded)');
}

async function main() {
    requireEnv();

    log(APPLY
        ? '▶ Analytics migration — APPLY mode (data will be written)'
        : '▶ Analytics migration — DRY RUN (no writes; re-run with --apply)');

    const { globalWins } = await reconcileLadder();
    await reconcileGlobalWins(globalWins);
    if (DO_WEEKLY) await reconcileWeekly();
    if (DO_CLEANUP) await cleanupFirstConnect();

    log('\nDone.');
    if (!APPLY) log('No changes were written. Re-run with --apply to commit them.');
}

main().catch((err) => {
    console.error('✖ Migration failed:', err);
    process.exit(1);
});
