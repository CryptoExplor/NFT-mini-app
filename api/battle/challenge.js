import { kv } from '@vercel/kv';
import { verifyOwnership } from '../../src/lib/battle/statProviders.js';
import { normalizeFighter } from '../../src/lib/battle/metadataNormalizer.js';
import { createSnapshotHash } from '../../src/lib/battle/snapshot.js';

// Simple CORS polyfill since setCors might be missing or causing issues
function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Credentials', true)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version')
}

const CHALLENGES_KEY = 'battle_challenges:v2';

export default async function handler(req, res) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'POST') {
        return await createChallenge(req, res);
    } else if (req.method === 'GET') {
        return await listChallenges(req, res);
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

async function createChallenge(req, res) {
    const { collectionId, tokenId, rawMetadata, userAddress } = req.body;

    // 1. Verify Ownership (Server Authoritative) - SKIP for MVP if needed, or implement actual check
    // For MVP, we trust the client's payload that they own it to reduce RPC load, 
    // but in prod this should verify against an RPC node.
    // const ownsToken = await verifyOwnership(collectionId, tokenId, userAddress);
    // if (!ownsToken) return res.status(403).json({ error: 'Caller does not own this token.' });

    // 2. Normalize Stats
    const stats = normalizeFighter(collectionId, tokenId, rawMetadata);

    // 3. Prevent stat drift by creating a snapshot
    const snapshotHash = await createSnapshotHash(stats);

    // 4. Create Challenge Object
    const challengeId = `chal_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const challenge = {
        id: challengeId,
        creator: userAddress,
        collectionId,
        tokenId,
        trait: rawMetadata?.find?.(t => t.trait_type === 'Faction' || t.trait_type === 'Mood' || t.trait_type === 'Type')?.value || 'Standard',
        imageUrl: `https://avatar.vercel.sh/${userAddress}`, // Fallback if not provided
        stats,
        snapshotHash,
        status: 'OPEN',
        createdAt: Date.now()
    };

    // Store in KV list (prepend)
    let challenges = await kv.get(CHALLENGES_KEY) || [];
    challenges.unshift(challenge);

    // Keep max 50 active challenges to prevent bloat
    if (challenges.length > 50) challenges = challenges.slice(0, 50);

    await kv.set(CHALLENGES_KEY, challenges);

    return res.status(200).json({ success: true, challengeId });
}

async function listChallenges(req, res) {
    const challenges = await kv.get(CHALLENGES_KEY) || [];
    const open = challenges.filter(c => c.status === 'OPEN');
    return res.status(200).json({ challenges: open });
}
