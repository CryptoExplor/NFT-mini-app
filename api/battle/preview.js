import { kv } from '@vercel/kv';
import { normalizeFighter } from '../../src/lib/battle/metadataNormalizer.js';

// Simple CORS polyfill
function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Credentials', true)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version')
}

const CHALLENGES_KEY = 'battle_challenges:v2';

export default async function handler(req, res) {
    setCors(req, res, { methods: 'GET,POST,OPTIONS' });
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

    const challenges = await kv.get(CHALLENGES_KEY) || [];
    const challenge = challenges.find(c => c.id === challengeId);

    if (!challenge || challenge.status !== 'OPEN') {
        return res.status(404).json({ error: 'Challenge not available.' });
    }

    // For MVP, we pass the static snapshot payload back for the UI.
    return res.status(200).json({
        challengeId: challenge.id,
        defender: challenge.creator,
        collectionId: challenge.collectionId,
        tokenId: challenge.tokenId,
        stats: challenge.stats, // Needed for MatchPreview UI
        snapshotHash: challenge.snapshotHash // Passed back in /fight payload
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
