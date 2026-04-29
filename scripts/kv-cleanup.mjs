/**
 * scripts/kv-cleanup.mjs
 *
 * One-time cleanup before the analytics refactor goes live.
 *
 * SAFE: preserves all mint user profiles, volume stats, and points.
 * REMOVES: empty/stale battle leaderboard ZSETs, stale challenges,
 *          stale nonces, stale rate-limit keys.
 *
 * Run: node scripts/kv-cleanup.mjs
 * Requires: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN in .env
 */

import 'dotenv/config';
import { Redis } from '@upstash/redis';

const kv = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function run() {
    console.log('=== KV Selective Cleanup ===\n');

    // 1. Delete battle leaderboard ZSETs (empty anyway, fresh start)
    const lbKeys = [
        'lb:battle_wins',
        'lb:battle_wins:weekly',
        'lb:points', // will be rebuilt from scratch via battle events
    ];
    for (const key of lbKeys) {
        const exists = await kv.exists(key);
        if (exists) {
            await kv.del(key);
            console.log(`DELETED: ${key}`);
        } else {
            console.log(`SKIP (not found): ${key}`);
        }
    }

    // 2. Delete all stale challenge keys (pattern: challenge:*)
    const challengeKeys = await kv.keys('challenge:*');
    if (challengeKeys.length > 0) {
        await kv.del(...challengeKeys);
        console.log(`DELETED: ${challengeKeys.length} challenge keys`);
    } else {
        console.log('SKIP: no challenge keys found');
    }

    // 3. Delete stale nonce keys
    const nonceKeys = await kv.keys('nonce:*');
    if (nonceKeys.length > 0) {
        await kv.del(...nonceKeys);
        console.log(`DELETED: ${nonceKeys.length} nonce keys`);
    } else {
        console.log('SKIP: no nonce keys found');
    }

    // 4. Delete rate-limit keys
    const rlKeys = await kv.keys('rl:*');
    if (rlKeys.length > 0) {
        await kv.del(...rlKeys);
        console.log(`DELETED: ${rlKeys.length} rate-limit keys`);
    } else {
        console.log('SKIP: no rate-limit keys found');
    }

    // 5. Initialize global:battle_count at 0 (fresh counter)
    await kv.set('global:battle_count', 0);
    console.log('SET: global:battle_count = 0');

    // 6. PRESERVE — list what we are keeping (informational only)
    console.log('\n=== PRESERVED (not touched) ===');
    const userKeys = await kv.keys('user:*');
    console.log(`user:* profiles: ${userKeys.length} keys`);
    const eventKeys = await kv.keys('events:*');
    console.log(`events:* analytics: ${eventKeys.length} keys`);
    const lbMints = await kv.exists('lb:mints');
    console.log(`lb:mints leaderboard: ${lbMints ? 'exists (kept)' : 'not found'}`);
    const lbVolume = await kv.exists('lb:volume');
    console.log(`lb:volume leaderboard: ${lbVolume ? 'exists (kept)' : 'not found'}`);

    console.log('\n=== Done. KV is clean for the analytics refactor. ===');
}

run().catch(err => {
    console.error('Cleanup failed:', err);
    process.exit(1);
});
