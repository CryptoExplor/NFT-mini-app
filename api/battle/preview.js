import { kv } from '@vercel/kv';
import { normalizeFighter } from '../../src/lib/battle/metadataNormalizer.js';
import { setCors } from '../_lib/cors.js';

const CHALLENGES_LIST_KEY = 'battle_challenges_list:v2';

export default async function handler(req, res) {
    setCors(req, res, {
        methods: 'GET,POST,OPTIONS',
        headers: 'Content-Type, Authorization'
    });
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'GET' && req.url.includes('/preview/')) {
        return await getMatchPreview(req, res);
    } else if (req.method === 'POST' && req.url.endsWith('/evaluate')) {
        return await evaluateMyFighter(req, res);
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

async function getMatchPreview(req, res) {
    const parts = req.url.split('/');
    const challengeId = parts[parts.length - 1]; // Basic router extraction

    const raw = await kv.lrange(CHALLENGES_LIST_KEY, 0, 49) || [];
    const challenges = raw.map(item => {
        try { return typeof item === 'string' ? JSON.parse(item) : item; }
        catch { return null; }
    }).filter(Boolean);
    const challenge = challenges.find(c => c.id === challengeId);

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
        snapshotHash: challenge.snapshotHash
    });
}

async function evaluateMyFighter(req, res) {
    const { collectionId, tokenId, rawMetadata } = req.body;

    try {
        const stats = normalizeFighter(collectionId, tokenId, rawMetadata);
        return res.status(200).json({ stats });
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
}

