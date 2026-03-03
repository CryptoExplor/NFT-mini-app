import { kv } from '@vercel/kv';
import { normalizeFighter, normalizeItemStats, normalizeArenaStats, applyLayer, clampStats } from '../../src/lib/battle/metadataNormalizer.js';
import { simulateBattle, summarizeReplay } from '../../src/lib/game/engine.js';
import { computeCompleteSnapshotHash } from '../../src/lib/battle/teamSnapshot.js';
import { setCors } from '../_lib/cors.js';
import { requireAuth } from '../_lib/authMiddleware.js';
import crypto from 'crypto';

const CHALLENGES_HASH_KEY = 'battle_challenges_data:v2';
const ACTIVE_CHALLENGES_SET_KEY = 'battle_challenges_active:v2';
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
    const { challengeId, attackerAddress, loadout } = req.body;

    // Payload validation
    if (!challengeId || !attackerAddress || !loadout || !loadout.fighter) {
        return res.status(400).json({ error: 'Missing required payload: challengeId, attackerAddress, loadout.fighter' });
    }

    const { engineId: attackerCollectionId, nftId: attackerTokenId, rawAttributes: rawMetadata } = loadout.fighter;

    // Auth Validation (SIWE)
    const auth = await requireAuth(req);
    if (!auth || !auth.authenticated || auth.wallet.toLowerCase() !== attackerAddress.toLowerCase()) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing wallet signature.' });
    }

    // 1. Atomically fetch the specific challenge from the Hash storage
    const storedChallengeRaw = await kv.hget(CHALLENGES_HASH_KEY, challengeId);

    if (!storedChallengeRaw) {
        return res.status(404).json({ error: 'Challenge not found.' });
    }

    let challenge;
    try {
        challenge = typeof storedChallengeRaw === 'string' ? JSON.parse(storedChallengeRaw) : storedChallengeRaw;
    } catch {
        return res.status(500).json({ error: 'Corrupted challenge data.' });
    }

    if (challenge.status !== 'OPEN') {
        return res.status(404).json({ error: 'Challenge already closed or completed.' });
    }

    // 2. Prevent attacking yourself 
    if (challenge.creator.toLowerCase() === attackerAddress.toLowerCase()) {
        return res.status(400).json({ error: 'Cannot fight your own challenge.' });
    }

    // 3. Normalize attacker stats Securely on the Backend
    let attackerStats = normalizeFighter(attackerCollectionId, attackerTokenId, rawMetadata);

    if (loadout.item) {
        const itemStats = normalizeItemStats(loadout.item.engineId, loadout.item.nftId, loadout.item.rawAttributes);
        attackerStats = applyLayer(attackerStats, itemStats);
    }
    if (loadout.arena) {
        const arenaStats = normalizeArenaStats(loadout.arena.engineId, loadout.arena.nftId, loadout.arena.rawAttributes);
        attackerStats = applyLayer(attackerStats, arenaStats);
    }
    attackerStats = clampStats(attackerStats);

    // 4. Verify Defender Snapshot hasn't drifted
    const computedHash = await computeCompleteSnapshotHash(challenge.stats, challenge.loadout?.teamSnapshot);
    if (computedHash !== challenge.snapshotHash) {
        return res.status(409).json({ error: 'Defender stats have drifted. Challenge is voided.' });
    }

    // 5. Cryptographically secure seed
    const matchSeed = crypto.randomBytes(4).toString('hex');

    // Seeded PRNG from secure seed
    let a = parseInt(matchSeed, 16);
    const prng = () => {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };

    const fullLog = simulateBattle(attackerStats, challenge.stats, prng, {
        playerTeam: loadout.teamSnapshot || [],
        enemyTeam: challenge.loadout?.teamSnapshot || []
    });
    const summary = summarizeReplay(fullLog);

    // 6. Record Match
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

    // 7. Atomic state updates via Pipeline
    challenge.status = 'COMPLETED';

    const pipe = kv.pipeline();
    // Record match
    pipe.hset(MATCHES_KEY, { [matchId]: matchResult });
    // Update challenge to COMPLETED in the data hash
    pipe.hset(CHALLENGES_HASH_KEY, { [challengeId]: JSON.stringify(challenge) });
    // Remove from the 'active' sorting set
    pipe.zrem(ACTIVE_CHALLENGES_SET_KEY, challengeId);
    await pipe.exec();

    // 8. Update Global Leaderboard — use unified key matching events system
    const winAddress = fullLog.winnerSide === 'P1' ? attackerAddress : challenge.creator;

    try {
        const boardPipe = kv.pipeline();
        boardPipe.zincrby('leaderboard:battle_wins:all_time', 1, winAddress);
        boardPipe.hincrby(`user:${winAddress}:profile`, 'battle_wins', 1);
        await boardPipe.exec();
    } catch (e) {
        console.error('Failed to update leaderboard', e);
    }

    // 9. Return determinable result for client playback
    return res.status(200).json({
        success: true,
        matchId,
        seed: matchSeed,
        summary,
        winnerSide: fullLog.winnerSide,
        replayLogs: fullLog.logs
    });
}

