import { kv } from '@vercel/kv';
import { normalizeFighter, normalizeItemStats, normalizeArenaStats, applyLayer, clampStats } from '../../src/lib/battle/metadataNormalizer.js';
import { computeCompleteSnapshotHash } from '../../src/lib/battle/teamSnapshot.js';
import { setCors } from '../_lib/cors.js';
import { requireAuth } from '../_lib/authMiddleware.js';
import crypto from 'crypto';

const CHALLENGES_HASH_KEY = 'battle_challenges_data:v2';
const ACTIVE_CHALLENGES_SET_KEY = 'battle_challenges_active:v2';
const MAX_CHALLENGES = 50;

export default async function handler(req, res) {
    setCors(req, res, {
        methods: 'GET,POST,OPTIONS',
        headers: 'Content-Type, Authorization'
    });
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'POST') {
        return await createChallenge(req, res);
    } else if (req.method === 'GET') {
        return await listChallenges(req, res);
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

async function createChallenge(req, res) {
    const { loadout, userAddress } = req.body;

    // Payload validation
    if (!loadout || !loadout.fighter || !userAddress) {
        return res.status(400).json({ error: 'Missing required payload: loadout.fighter, userAddress' });
    }

    const { engineId: collectionId, collectionName, nftId, rawAttributes: rawMetadata } = loadout.fighter;

    // Auth Validation (SIWE)
    const auth = await requireAuth(req);
    if (!auth || !auth.authenticated || auth.wallet.toLowerCase() !== userAddress.toLowerCase()) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing wallet signature.' });
    }

    // 2. Normalize Stats Securely on the Backend
    let finalStats = normalizeFighter(collectionId, nftId, rawMetadata);

    if (loadout.item) {
        const itemStats = normalizeItemStats(loadout.item.engineId, loadout.item.nftId, loadout.item.rawAttributes);
        finalStats = applyLayer(finalStats, itemStats);
    }
    if (loadout.arena) {
        const arenaStats = normalizeArenaStats(loadout.arena.engineId, loadout.arena.nftId, loadout.arena.rawAttributes);
        finalStats = applyLayer(finalStats, arenaStats);
    }

    // Explicit clamp for safety
    finalStats = clampStats(finalStats);

    // 3. Prevent stat drift by creating a snapshot of the fully layered loadout stats + team
    const snapshotHash = await computeCompleteSnapshotHash(finalStats, loadout.teamSnapshot);

    // 4. Create Challenge Object with cryptographically secure ID
    const challengeId = `chal_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const challenge = {
        id: challengeId,
        creator: userAddress,
        player: userAddress, // ChallengeBoard looks for 'player'
        collectionId, // For indexing & display
        collectionName,
        nftId,
        trait: rawMetadata?.find?.(t => t.trait_type === 'Faction' || t.trait_type === 'Mood' || t.trait_type === 'Type')?.value || 'Standard',
        imageUrl: loadout.fighter.imageUrl || `https://avatar.vercel.sh/${userAddress}`,
        stats: finalStats,
        loadout: loadout, // Store full V2 shape
        snapshotHash,
        status: 'OPEN',
        createdAt: Date.now()
    };

    // Atomic: HSET for data, ZADD to keep track and limit size
    const pipe = kv.pipeline();
    pipe.hset(CHALLENGES_HASH_KEY, { [challengeId]: JSON.stringify(challenge) });
    // Use ZADD so we can easily trim the oldest ones if we exceed MAX_CHALLENGES
    pipe.zadd(ACTIVE_CHALLENGES_SET_KEY, { score: challenge.createdAt, member: challengeId });

    // Attempt to trim if exceeding MAX_CHALLENGES
    // This is optional but keeps the active list small. Old data in HASH can sit or be expired later.
    const activeCount = await kv.zcard(ACTIVE_CHALLENGES_SET_KEY);
    if (activeCount >= MAX_CHALLENGES) {
        // Get the oldest elements to remove
        const overLimit = activeCount - MAX_CHALLENGES + 1;
        const oldestIds = await kv.zrange(ACTIVE_CHALLENGES_SET_KEY, 0, overLimit - 1);
        if (oldestIds && oldestIds.length > 0) {
            pipe.zrem(ACTIVE_CHALLENGES_SET_KEY, ...oldestIds);
            pipe.hdel(CHALLENGES_HASH_KEY, ...oldestIds);
        }
    }

    await pipe.exec();

    return res.status(200).json({ success: true, challengeId });
}

async function listChallenges(req, res) {
    // Get all active challenge IDs, sorted by newest first
    const activeChallengeIds = await kv.zrange(ACTIVE_CHALLENGES_SET_KEY, 0, -1, { rev: true });

    if (!activeChallengeIds || activeChallengeIds.length === 0) {
        return res.status(200).json({ challenges: [] });
    }

    // Fetch the actual data from the hash
    const rawChallenges = await kv.hmget(CHALLENGES_HASH_KEY, ...activeChallengeIds);

    const challenges = rawChallenges.map(item => {
        try { return typeof item === 'string' ? JSON.parse(item) : item; }
        catch { return null; }
    }).filter(Boolean);

    const open = challenges.filter(c => c.status === 'OPEN');
    return res.status(200).json({ challenges: open });
}
