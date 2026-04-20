/**
 * KV Atomic Operations Helper
 *
 * Wraps @vercel/kv with atomic hash-based operations for challenges.
 * Prevents race conditions from monolithic array get/set patterns.
 *
 * Architecture:
 *   - Challenges stored as hash fields: kv.hset('challenges', challengeId, data)
 *   - Each challenge is independently readable, writable, deletable
 *   - No full-array read-modify-write cycles
 *
 * Usage:
 *   import { setChallengeAtomic, getChallengeAtomic } from './_lib/kv.js';
 */

import { kv } from '@vercel/kv';

const CHALLENGE_HASH_KEY = 'challenges:active';
const CHALLENGE_TTL_SECONDS = 86400; // 24 hours

/**
 * Store a challenge atomically.
 * No race condition — each challenge is an independent hash field.
 *
 * @param {string} id - Challenge ID
 * @param {Object} data - Challenge data (BattleLoadoutV1 + metadata)
 * @returns {Promise<void>}
 */
export async function setChallengeAtomic(id, data) {
    if (!id || typeof id !== 'string') {
        throw new Error('Challenge ID must be a non-empty string');
    }

    const serialized = JSON.stringify({
        ...data,
        _storedAt: Date.now(),
    });

    await kv.hset(CHALLENGE_HASH_KEY, { [id]: serialized });

    // Set per-challenge expiry key for TTL tracking
    // (Redis hashes don't support per-field TTL, so we use a separate key)
    await kv.set(`challenge:ttl:${id}`, '1', { ex: CHALLENGE_TTL_SECONDS });
}

/**
 * Get a single challenge by ID.
 *
 * @param {string} id - Challenge ID
 * @returns {Promise<Object|null>} Parsed challenge data or null
 */
export async function getChallengeAtomic(id) {
    const raw = await kv.hget(CHALLENGE_HASH_KEY, id);
    if (!raw) return null;

    try {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
        console.error(`[KV] Failed to parse challenge ${id}`);
        return null;
    }
}

/**
 * Delete a challenge atomically (consumed after fight).
 *
 * @param {string} id - Challenge ID
 * @returns {Promise<void>}
 */
export async function deleteChallengeAtomic(id) {
    await kv.hdel(CHALLENGE_HASH_KEY, id);
    await kv.del(`challenge:ttl:${id}`);
}

/**
 * List all active challenges.
 * Filters out expired challenges whose TTL keys have been evicted.
 *
 * @returns {Promise<Object[]>} Array of active challenge objects
 */
export async function listActiveChallenges() {
    const all = await kv.hgetall(CHALLENGE_HASH_KEY);
    if (!all) return [];

    const challenges = [];
    const expiredIds = [];

    for (const [id, raw] of Object.entries(all)) {
        // Check if TTL key still exists (challenge not expired)
        const ttlExists = await kv.exists(`challenge:ttl:${id}`);

        if (!ttlExists) {
            // TTL expired — mark for cleanup
            expiredIds.push(id);
            continue;
        }

        try {
            const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
            challenges.push({ id, ...data });
        } catch {
            expiredIds.push(id); // Corrupted data — clean up
        }
    }

    // Async cleanup of expired challenges (non-blocking)
    if (expiredIds.length > 0) {
        Promise.all(expiredIds.map(id => kv.hdel(CHALLENGE_HASH_KEY, id))).catch(() => { });
    }

    return challenges;
}

/**
 * Update battle leaderboard atomically.
 * Uses sorted set for O(log N) rank lookups.
 *
 * @param {string} winnerAddress - Winner's wallet address
 * @param {string} [timeframe='all_time'] - Leaderboard timeframe
 * @returns {Promise<void>}
 */
export async function incrementBattleWins(winnerAddress, timeframe = 'all_time') {
    await kv.zincrby(`leaderboard:battle_wins:${timeframe}`, 1, winnerAddress);
}

/**
 * Get battle leaderboard.
 *
 * @param {string} [timeframe='all_time'] - Leaderboard timeframe
 * @param {number} [limit=50] - Max entries to return
 * @returns {Promise<Array<{address: string, wins: number}>>}
 */
export async function getBattleLeaderboard(timeframe = 'all_time', limit = 50) {
    const results = await kv.zrange(
        `leaderboard:battle_wins:${timeframe}`,
        0,
        limit - 1,
        { rev: true, withScores: true }
    );

    // Results come as [member, score, member, score, ...]
    const entries = [];
    for (let i = 0; i < results.length; i += 2) {
        entries.push({
            address: results[i],
            wins: Number(results[i + 1]),
        });
    }

    return entries;
}

/**
 * Save a verifiable, seed-first battle record.
 * 
 * @param {Object} record - The Battle Record Schema (without ID)
 * @returns {Promise<string>} The generated battleId (sha256 hash)
 */
export async function saveBattleRecord(record) {
    if (!record.seed || !record.players || !record.result) {
        throw new Error('[KV] Invalid minimal battle schema');
    }

    // 1. Generate Verifiable Battle ID
    const payloadToHash = record.seed + JSON.stringify(record.players) + JSON.stringify(record.options || {});
    let battleId;
    try {
        const { createHash } = await import('crypto');
        battleId = createHash('sha256').update(payloadToHash).digest('hex');
    } catch {
        const encoder = new TextEncoder();
        const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(payloadToHash));
        battleId = Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    const fullRecord = {
        battleId,
        ...record,
        createdAt: Date.now()
    };

    const serialized = JSON.stringify(fullRecord);

    // 2. Perform Atomic Multi-Write
    const pipe = kv.pipeline();
    
    // Save master record (accessible by spectator mode)
    pipe.set(`battle:${battleId}`, serialized, { ex: 30 * 86400 }); // Keep replay for 30 days
    
    // Append to P1 history
    const p1Address = String(record.players.p1.id).toLowerCase();
    pipe.lpush(`history:user:${p1Address}`, serialized);
    pipe.ltrim(`history:user:${p1Address}`, 0, 49); // Keep latest 50
    
    // Append to P2 history (if different from P1)
    const p2Address = String(record.players.p2.id).toLowerCase();
    if (p1Address !== p2Address) {
        pipe.lpush(`history:user:${p2Address}`, serialized);
        pipe.ltrim(`history:user:${p2Address}`, 0, 49);
    }
    
    await pipe.exec();
    
    return battleId;
}

/**
 * Fetch a user's recent verifiable battle history.
 * 
 * @param {string} address - Wallet address
 * @param {number} [limit=50] - Number of records
 * @returns {Promise<Object[]>}
 */
export async function getUserBattleHistory(address, limit = 50) {
    const raw = await kv.lrange(`history:user:${String(address).toLowerCase()}`, 0, limit - 1);
    return raw.map(r => (typeof r === 'string' ? JSON.parse(r) : r));
}

/**
 * Fetch a specific verifiable battle record by its SHA256 ID.
 * 
 * @param {string} battleId 
 * @returns {Promise<Object|null>}
 */
export async function getBattleRecord(battleId) {
    const raw = await kv.get(`battle:${battleId}`);
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

