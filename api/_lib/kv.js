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

// Named export for backward compatibility with existing API routes
export { redis as kv };

const CHALLENGE_HASH_KEY = 'challenges:active';
const CHALLENGE_TTL_SECONDS = 3600; // 1 hour

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
    const results = await redis.zrange(
        `leaderboard:battle_wins:${timeframe}`,
        0,
        limit - 1,
        { rev: true, withScores: true }
    );

    const entries = [];
    if (results && Array.isArray(results)) {
        for (const item of results) {
            const address = item?.member || item;
            const wins = item?.score !== undefined ? item.score : 0;
            
            if (address && typeof address === 'string') {
                entries.push({
                    address,
                    wins: Number(wins),
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

    const pipe = redis.pipeline();
    // Replay record (expires in 30 days)
    pipe.set(`battle:${battleId}`, serialized, { ex: 30 * 86400 });
    
    // User history lists
    const p1Address = String(record.players.p1.id).toLowerCase();
    const p1IsAi = p1Address.startsWith('ai:');
    
    if (!p1IsAi) {
        pipe.lpush(`history:user:${p1Address}`, serialized);
        pipe.ltrim(`history:user:${p1Address}`, 0, 49);
    }
    
    const p2Address = String(record.players.p2.id).toLowerCase();
    const p2IsAi = p2Address.startsWith('ai:');

    if (!p2IsAi && p1Address !== p2Address) {
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
