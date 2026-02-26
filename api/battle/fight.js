import { kv } from '@vercel/kv';
import { verifyOwnership } from '../../src/lib/battle/statProviders.js';
import { normalizeFighter } from '../../src/lib/battle/metadataNormalizer.js';
import { simulateBattle, summarizeReplay } from '../../src/lib/game/engine.js';
import { validateSnapshot, createSnapshotHash } from '../../src/lib/battle/snapshot.js';

// Simple CORS polyfill
function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Credentials', true)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version')
}

const CHALLENGES_KEY = 'battle_challenges:v2';
const MATCHES_KEY = 'battle_matches:v2';

export default async function handler(req, res) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    return await resolveFight(req, res);
}

async function resolveFight(req, res) {
    const { challengeId, attackerCollectionId, attackerTokenId, rawMetadata, attackerAddress } = req.body;

    let challenges = await kv.get(CHALLENGES_KEY) || [];
    const challengeIndex = challenges.findIndex(c => c.id === challengeId);

    if (challengeIndex === -1 || challenges[challengeIndex].status !== 'OPEN') {
        return res.status(404).json({ error: 'Challenge not found or already closed.' });
    }

    const challenge = challenges[challengeIndex];

    // 1. Prevent attacking yourself 
    if (challenge.creator.toLowerCase() === attackerAddress.toLowerCase()) {
        return res.status(400).json({ error: 'Cannot fight your own challenge.' });
    }

    // 2. Normalize attacker stats 
    const attackerStats = normalizeFighter(attackerCollectionId, attackerTokenId, rawMetadata);

    // 3. Verify Defender Snapshot hasn't drifted
    const isDefenderValid = await validateSnapshot(challenge.stats, challenge.snapshotHash);
    if (!isDefenderValid) {
        return res.status(409).json({ error: 'Defender stats have drifted. Challenge is voided.' });
    }

    // 4. Seeded Battle Simulation
    const matchSeed = Math.random().toString(36).substring(7);

    // Polyfill a simple seeded random for MVP scope
    let a = parseInt(matchSeed, 36);
    const prng = () => {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };

    const fullLog = simulateBattle(attackerStats, challenge.stats, prng);
    const summary = summarizeReplay(fullLog);

    // 5. Record Match
    const matchId = `match_${Date.now()}`;
    const matchResult = {
        id: matchId,
        challengeId,
        attacker: attackerAddress,
        defender: challenge.creator,
        winner: summary.winner,
        seed: matchSeed,
        timestamp: Date.now()
    };

    await kv.hset(MATCHES_KEY, { [matchId]: matchResult });

    // 6. Close Challenge
    challenges[challengeIndex].status = 'COMPLETED';
    await kv.set(CHALLENGES_KEY, challenges);

    // 7. Update Global Leaderboard if base engine events existed
    const winAddress = summary.winner === 1 ? attackerAddress : challenge.creator;
    const loseAddress = summary.winner === 1 ? challenge.creator : attackerAddress;

    try {
        await kv.zincrby('global_leaderboard', 10, winAddress);
        // Optional: decrement loser
    } catch (e) {
        console.error('Failed to update leaderboard', e);
    }

    // 8. Return determinable result for client playback
    return res.status(200).json({
        success: true,
        matchId,
        seed: matchSeed,
        summary,
        replayLogs: fullLog.logs // Client uses this to animate the fight visually
    });
}
