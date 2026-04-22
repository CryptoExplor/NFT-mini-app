import { Redis } from '@upstash/redis';

/**
 * Initialize Redis client.
 * Supports standard Upstash env vars and legacy Vercel KV vars for zero-downtime migration.
 */
const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
    ? Redis.fromEnv()
    : new Redis({
        url: process.env.KV_REST_API_URL || '',
        token: process.env.KV_REST_API_TOKEN || '',
    });

// Named export for backward compatibility with @vercel/kv style imports
export { redis as kv };

const CHALLENGE_HASH_KEY = 'challenges:active';
const CHALLENGE_TTL_SECONDS = 86400; // 24 hours

/**
 * Store a challenge atomically.
 * @param {string} id - Challenge ID
 * @param {Object} data - Challenge data
 */
export async function setChallengeAtomic(id, data) {
    if (!id || typeof id !== 'string') {
        throw new Error('Challenge ID must be a non-empty string');
    }

    const serialized = JSON.stringify({
        ...data,
        _storedAt: Date.now(),
    });

    // Upstash hset signature: hset(key, { field: value })
    await redis.hset(CHALLENGE_HASH_KEY, { [id]: serialized });

    // Set per-challenge expiry key for TTL tracking
    await redis.set(`challenge:ttl:${id}`, '1', { ex: CHALLENGE_TTL_SECONDS });
}

/**
 * Get a single challenge by ID.
 * @param {string} id - Challenge ID
 */
export async function getChallengeAtomic(id) {
    const raw = await redis.hget(CHALLENGE_HASH_KEY, id);
    if (!raw) return null;

    try {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
        console.error(`[KV] Failed to parse challenge ${id}`);
        return null;
    }
}

/**
 * Delete a challenge atomically.
 * @param {string} id - Challenge ID
 */
export async function deleteChallengeAtomic(id) {
    await redis.hdel(CHALLENGE_HASH_KEY, id);
    await redis.del(`challenge:ttl:${id}`);
}

/**
 * List all active challenges.
 */
export async function listActiveChallenges() {
    const all = await redis.hgetall(CHALLENGE_HASH_KEY);
    if (!all) return [];

    const challenges = [];
    const expiredIds = [];

    for (const [id, raw] of Object.entries(all)) {
        const ttlExists = await redis.exists(`challenge:ttl:${id}`);

        if (!ttlExists) {
            expiredIds.push(id);
            continue;
        }

        try {
            const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
            challenges.push({ id, ...data });
        } catch {
            expiredIds.push(id);
        }
    }

    if (expiredIds.length > 0) {
        // Non-blocking cleanup
        Promise.all(expiredIds.map(id => redis.hdel(CHALLENGE_HASH_KEY, id))).catch(() => { });
    }

    return challenges;
}

/**
 * Update battle leaderboard.
 */
export async function incrementBattleWins(winnerAddress, timeframe = 'all_time') {
    await redis.zincrby(`leaderboard:battle_wins:${timeframe}`, 1, winnerAddress);
}

/**
 * Get battle leaderboard.
 */
export async function getBattleLeaderboard(timeframe = 'all_time', limit = 50) {
    // Upstash zrange signature: zrange(key, start, stop, { rev: true, withScores: true })
    const results = await redis.zrange(
        `leaderboard:battle_wins:${timeframe}`,
        0,
        limit - 1,
        { rev: true, withScores: true }
    );

    const entries = [];
    // Upstash returns [ { member: '...', score: 10 }, ... ] when withScores is true
    if (results && results.length > 0) {
        for (let i = 0; i < results.length; i += 2) {
            // Standard Redis behavior for zrange withScores (some clients return flat array, others objects)
            // We handle both for robustness
            const member = results[i]?.member || results[i];
            const score = results[i]?.score || results[i + 1];
            
            if (member !== undefined && score !== undefined) {
                entries.push({
                    address: member,
                    wins: Number(score),
                });
            }
        }
    }

    return entries;
}

/**
 * Save a verifiable, seed-first battle record.
 */
export async function saveBattleRecord(record) {
    if (!record.seed || !record.players || !record.result) {
        throw new Error('[KV] Invalid minimal battle schema');
    }

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

    // Save using pipeline
    const pipe = redis.pipeline();
    
    pipe.set(`battle:${battleId}`, serialized, { ex: 30 * 86400 });
    
    const p1Address = String(record.players.p1.id).toLowerCase();
    pipe.lpush(`history:user:${p1Address}`, serialized);
    pipe.ltrim(`history:user:${p1Address}`, 0, 49);
    
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
 */
export async function getUserBattleHistory(address, limit = 50) {
    const raw = await redis.lrange(`history:user:${String(address).toLowerCase()}`, 0, limit - 1);
    if (!raw) return [];
    return raw.map(r => (typeof r === 'string' ? JSON.parse(r) : r));
}

/**
 * Fetch a specific verifiable battle record by its SHA256 ID.
 */
export async function getBattleRecord(battleId) {
    const raw = await redis.get(`battle:${battleId}`);
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

