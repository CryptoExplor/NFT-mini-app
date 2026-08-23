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

    const storedAt = Date.now();
    const serialized = JSON.stringify({
        ...data,
        _storedAt: storedAt,
        // Expiry travels INSIDE the value. The previous design wrote a separate
        // `challenge:ttl:<id>` key and listActiveChallenges() then issued one
        // EXISTS per challenge — O(n) KV commands on every list (and the list
        // runs on every challenge POST).
        expiresAt: Number(data?.expiresAt) || (storedAt + CHALLENGE_TTL_SECONDS * 1000),
    });

    // Upstash hset signature: hset(key, { field: value })
    await redis.hset(CHALLENGE_HASH_KEY, { [id]: serialized });
}

/**
 * Get a single challenge by ID.
 * @param {string} id - Challenge ID
 */
export async function getChallengeAtomic(id) {
    const raw = await redis.hget(CHALLENGE_HASH_KEY, id);
    if (!raw) return null;

    let data;
    try {
        data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
        console.error(`[KV] Failed to parse challenge ${id}`);
        return null;
    }

    if (isExpiredChallenge(data)) {
        // Lazy cleanup — an expired challenge must never be fightable.
        redis.hdel(CHALLENGE_HASH_KEY, id).catch(() => { });
        return null;
    }

    return data;
}

/**
 * A challenge is expired when its own `expiresAt` has passed. Records written
 * before this change have no `expiresAt`, so fall back to `_storedAt` + TTL
 * (and finally to the legacy `challenge:ttl:<id>` marker being gone).
 */
function isExpiredChallenge(data) {
    if (!data || typeof data !== 'object') return true;

    const explicit = Number(data.expiresAt);
    if (Number.isFinite(explicit) && explicit > 0) return Date.now() > explicit;

    const storedAt = Number(data._storedAt);
    if (Number.isFinite(storedAt) && storedAt > 0) {
        return Date.now() > storedAt + CHALLENGE_TTL_SECONDS * 1000;
    }

    // No timing information at all: treat as expired so it cannot linger forever.
    return true;
}

/**
 * Delete a challenge atomically.
 * @param {string} id - Challenge ID
 */
export async function deleteChallengeAtomic(id) {
    const pipe = redis.pipeline();
    pipe.hdel(CHALLENGE_HASH_KEY, id);
    // Legacy marker from the pre-inline-expiry layout; harmless once gone.
    pipe.del(`challenge:ttl:${id}`);
    await pipe.exec();
}

/**
 * List all active challenges.
 */
export async function listActiveChallenges() {
    const all = await redis.hgetall(CHALLENGE_HASH_KEY);
    if (!all) return [];

    const challenges = [];
    const expiredIds = [];

    // Single HGETALL, zero per-item round trips: expiry is read from the value.
    for (const [id, raw] of Object.entries(all)) {
        let data;
        try {
            data = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch {
            expiredIds.push(id);
            continue;
        }

        if (isExpiredChallenge(data)) {
            expiredIds.push(id);
            continue;
        }

        challenges.push({ id, ...data });
    }

    if (expiredIds.length > 0) {
        // Non-blocking cleanup, batched into a single pipeline.
        const pipe = redis.pipeline();
        expiredIds.forEach((id) => pipe.hdel(CHALLENGE_HASH_KEY, id));
        pipe.exec().catch(() => { });
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
    if (!Array.isArray(results)) return entries;

    // Upstash returns a FLAT array for `withScores` ([member, score, ...]).
    // Older/other clients return [{ member, score }]. Support both so the
    // helper keeps working against existing data either way.
    const isObjectShape = results.some(item => item && typeof item === 'object' && 'member' in item);

    if (isObjectShape) {
        for (const item of results) {
            const address = item?.member;
            if (address && typeof address === 'string') {
                entries.push({ address, wins: Number(item?.score) || 0 });
            }
        }
        return entries;
    }

    for (let i = 0; i < results.length; i += 2) {
        const address = results[i];
        if (address && typeof address === 'string') {
            entries.push({ address, wins: Number(results[i + 1]) || 0 });
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
    if (!raw || !Array.isArray(raw)) return [];

    const items = [];
    const missingHashes = [];

    for (const r of raw) {
        if (!r) continue;
        if (typeof r === 'object') {
            items.push(r);
            continue;
        }
        if (typeof r === 'string') {
            try {
                const parsed = JSON.parse(r);
                if (parsed && typeof parsed === 'object') {
                    items.push(parsed);
                    continue;
                }
            } catch {
                // Not valid JSON — check if it is a 64-char battleId hash
            }

            const trimmed = r.trim();
            if (/^[a-f0-9]{64}$/i.test(trimmed)) {
                missingHashes.push(trimmed);
            }
        }
    }

    if (missingHashes.length > 0) {
        try {
            const pipe = redis.pipeline();
            missingHashes.forEach(h => pipe.get(`battle:${h}`));
            const records = await pipe.exec();
            for (let i = 0; i < records.length; i++) {
                const rec = records[i];
                if (!rec) continue;
                try {
                    const parsed = typeof rec === 'string' ? JSON.parse(rec) : rec;
                    if (parsed && typeof parsed === 'object') {
                        items.push({ battleId: missingHashes[i], ...parsed });
                    }
                } catch { }
            }
        } catch (err) {
            console.warn('[KV] Failed to fetch missing battle hashes:', err?.message);
        }
    }

    return items;
}

/**
 * Fetch a specific verifiable battle record by its SHA256 ID.
 */
export async function getBattleRecord(battleId) {
    const raw = await redis.get(`battle:${battleId}`);
    if (!raw) return null;
    try {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
        return null;
    }
}

