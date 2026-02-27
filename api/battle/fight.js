import { kv } from '@vercel/kv';
import { normalizeFighter } from '../../src/lib/battle/metadataNormalizer.js';
import { simulateBattle, summarizeReplay } from '../../src/lib/game/engine.js';
import { validateSnapshot, createSnapshotHash } from '../../src/lib/battle/snapshot.js';
import { setCors } from '../_lib/cors.js';
import crypto from 'crypto';

const CHALLENGES_LIST_KEY = 'battle_challenges_list:v2';
const MATCHES_KEY = 'battle_matches:v2';

export default async function handler(req, res) {
    setCors(req, res, {
        methods: 'POST,OPTIONS',
        headers: 'Content-Type, Authorization'
    });
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    return await resolveFight(req, res);
}

async function resolveFight(req, res) {
    const { challengeId, attackerCollectionId, attackerTokenId, rawMetadata, attackerAddress } = req.body;

    // Payload validation
    if (!challengeId || !attackerCollectionId || !attackerTokenId || !attackerAddress) {
        return res.status(400).json({ error: 'Missing required fields: challengeId, attackerCollectionId, attackerTokenId, attackerAddress' });
    }

    // Read all challenges from the list
    const raw = await kv.lrange(CHALLENGES_LIST_KEY, 0, 49) || [];
    const challenges = raw.map((item, idx) => {
        try {
            const parsed = typeof item === 'string' ? JSON.parse(item) : item;
            parsed._listIndex = idx;
            return parsed;
        }
        catch { return null; }
    }).filter(Boolean);

    const challenge = challenges.find(c => c.id === challengeId);

    if (!challenge || challenge.status !== 'OPEN') {
        return res.status(404).json({ error: 'Challenge not found or already closed.' });
    }

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

    // 4. Cryptographically secure seed
    const matchSeed = crypto.randomBytes(4).toString('hex');

    // Seeded PRNG from secure seed
    let a = parseInt(matchSeed, 16);
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
        winnerSide: fullLog.winnerSide,
        seed: matchSeed,
        timestamp: Date.now()
    };

    await kv.hset(MATCHES_KEY, { [matchId]: matchResult });

    // 6. Close Challenge — mark as completed by updating the list entry
    challenge.status = 'COMPLETED';
    delete challenge._listIndex;
    await kv.lset(CHALLENGES_LIST_KEY, challenges.indexOf(challenges.find(c => c.id === challengeId)), JSON.stringify(challenge));

    // 7. Update Global Leaderboard — use unified key matching events system
    const winAddress = fullLog.winnerSide === 'P1' ? attackerAddress : challenge.creator;

    try {
        const pipe = kv.pipeline();
        pipe.zincrby('leaderboard:battle_wins:all_time', 1, winAddress);
        pipe.hincrby(`user:${winAddress}:profile`, 'battle_wins', 1);
        await pipe.exec();
    } catch (e) {
        console.error('Failed to update leaderboard', e);
    }

    // 8. Return determinable result for client playback
    return res.status(200).json({
        success: true,
        matchId,
        seed: matchSeed,
        summary,
        winnerSide: fullLog.winnerSide,
        replayLogs: fullLog.logs
    });
}

