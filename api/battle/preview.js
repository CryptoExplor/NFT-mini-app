import { kv } from '@vercel/kv';
import { normalizeFighter } from '../../src/lib/battle/metadataNormalizer.js';
import { setCors } from '../_lib/cors.js';

const CHALLENGES_HASH_KEY = 'battle_challenges_data:v2';

export default async function handler(req, res) {
    setCors(req, res, {
        methods: 'GET,POST,OPTIONS',
        headers: 'Content-Type, Authorization'
    });
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'GET' && req.url.includes('/preview/')) {
        return await getMatchPreview(req, res);
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

async function getMatchPreview(req, res) {
    const parts = req.url.split('/');
    const challengeId = parts[parts.length - 1]; // Basic router extraction

    if (!challengeId) return res.status(400).json({ error: 'Missing challenge ID' });

    const raw = await kv.hget(CHALLENGES_HASH_KEY, challengeId);
    let challenge = null;

    try {
        challenge = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
        challenge = null;
    }

    if (!challenge || challenge.status !== 'OPEN') {
        return res.status(404).json({ error: 'Challenge not available.' });
    }

    // For MVP, we pass the static snapshot payload back for the UI.
    return res.status(200).json({
        challengeId: challenge.id,
        defender: challenge.creator,
        collectionId: challenge.collectionId,
        collectionName: challenge.collectionName,
        nftId: challenge.nftId,
        stats: challenge.stats,
        loadout: challenge.loadout,
        snapshotHash: challenge.snapshotHash
    });
}

