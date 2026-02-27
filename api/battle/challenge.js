import { kv } from '@vercel/kv';
import { normalizeFighter } from '../../src/lib/battle/metadataNormalizer.js';
import { createSnapshotHash } from '../../src/lib/battle/snapshot.js';
import { setCors } from '../_lib/cors.js';
import crypto from 'crypto';

const CHALLENGES_LIST_KEY = 'battle_challenges_list:v2';
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
    const { collectionId, collectionName, nftId, rawMetadata, userAddress } = req.body;

    // Payload validation
    if (!collectionId || !nftId || !userAddress) {
        return res.status(400).json({ error: 'Missing required fields: collectionId, nftId, userAddress' });
    }

    // 2. Normalize Stats
    const stats = normalizeFighter(collectionId, nftId, rawMetadata);

    // 3. Prevent stat drift by creating a snapshot
    const snapshotHash = await createSnapshotHash(stats);

    // 4. Create Challenge Object with cryptographically secure ID
    const challengeId = `chal_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const challenge = {
        id: challengeId,
        creator: userAddress,
        player: userAddress, // ChallengeBoard looks for 'player'
        collectionId,
        collectionName,
        nftId,
        trait: rawMetadata?.find?.(t => t.trait_type === 'Faction' || t.trait_type === 'Mood' || t.trait_type === 'Type')?.value || 'Standard',
        imageUrl: `https://avatar.vercel.sh/${userAddress}`, // Fallback if not provided
        stats,
        snapshotHash,
        status: 'OPEN',
        createdAt: Date.now()
    };

    // Atomic: LPUSH + LTRIM avoids the get→modify→set race condition
    const pipe = kv.pipeline();
    pipe.lpush(CHALLENGES_LIST_KEY, JSON.stringify(challenge));
    pipe.ltrim(CHALLENGES_LIST_KEY, 0, MAX_CHALLENGES - 1);
    await pipe.exec();

    return res.status(200).json({ success: true, challengeId });
}

async function listChallenges(req, res) {
    const raw = await kv.lrange(CHALLENGES_LIST_KEY, 0, MAX_CHALLENGES - 1) || [];
    const challenges = raw.map(item => {
        try { return typeof item === 'string' ? JSON.parse(item) : item; }
        catch { return null; }
    }).filter(Boolean);
    const open = challenges.filter(c => c.status === 'OPEN');
    return res.status(200).json({ challenges: open });
}
