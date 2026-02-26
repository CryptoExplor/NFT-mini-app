import { verifyOwnership } from '../../src/lib/battle/statProviders.js';
import { normalizeFighter } from '../../src/lib/battle/metadataNormalizer.js';
import { createSnapshotHash } from '../../src/lib/battle/snapshot.js';

/**
 * MOCK DB/KV STORE FOR MVP
 * In production this would be Redis/Upstash
 */
const KV = {
    challenges: new Map(),
    matches: new Map()
};

/**
 * POST /api/battle/challenge
 * Creates a new open challenge on the board.
 */
export async function createChallenge(req, res) {
    const { collectionId, tokenId, rawMetadata, userAddress } = req.body;

    // 1. Verify Ownership (Server Authoritative)
    const ownsToken = await verifyOwnership(collectionId, tokenId, userAddress);
    if (!ownsToken) {
        return res.status(403).json({ error: 'Caller does not own this token.' });
    }

    // 2. Normalize Stats
    const stats = normalizeFighter(collectionId, tokenId, rawMetadata);

    // 3. Prevent stat drift by creating a snapshot
    const snapshotHash = createSnapshotHash(stats);

    // 4. Create Challenge Object
    const challengeId = `chal_${Date.now()}`;
    const challenge = {
        id: challengeId,
        creator: userAddress,
        collectionId,
        tokenId,
        stats,
        snapshotHash,
        status: 'OPEN',
        createdAt: Date.now()
    };

    KV.challenges.set(challengeId, challenge);

    return res.status(200).json({ success: true, challengeId });
}

/**
 * GET /api/battle/challenge
 * Lists open challenges.
 */
export async function listChallenges(req, res) {
    const open = Array.from(KV.challenges.values()).filter(c => c.status === 'OPEN');
    return res.status(200).json({ challenges: open });
}
