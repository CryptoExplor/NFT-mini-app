import { verifyOwnership } from '../../src/lib/battle/statProviders.js';
import { normalizeFighter } from '../../src/lib/battle/metadataNormalizer.js';
import { simulateBattle, summarizeReplay } from '../../src/lib/game/engine.js';
import { validateSnapshot, createSnapshotHash } from '../../src/lib/battle/snapshot.js';

// Note: Using the same mock KV logic assumed across files 
// (In Next/Express this would require shared state/redis mapping)
const KV = {
    challenges: new Map(), // Pretend this is injected/shared with challenge.js
    matches: new Map()
};

/**
 * POST /api/battle/fight
 * User commits to fighting an open challenge.
 */
export async function resolveFight(req, res) {
    const { challengeId, attackerCollectionId, attackerTokenId, rawMetadata, attackerAddress } = req.body;

    const challenge = KV.challenges.get(challengeId);
    if (!challenge || challenge.status !== 'OPEN') {
        return res.status(404).json({ error: 'Challenge not found or already closed.' });
    }

    // 1. Verify attacker ownership
    const ownsToken = await verifyOwnership(attackerCollectionId, attackerTokenId, attackerAddress);
    if (!ownsToken) {
        return res.status(403).json({ error: 'Caller does not own the attacking token.' });
    }

    // 2. Prevent attacking yourself 
    if (challenge.creator.toLowerCase() === attackerAddress.toLowerCase()) {
        return res.status(400).json({ error: 'Cannot fight your own challenge.' });
    }

    // 3. Normalize attacker stats & take attacker snapshot
    const attackerStats = normalizeFighter(attackerCollectionId, attackerTokenId, rawMetadata);

    // 4. Verify Defender Snapshot hasn't drifted since challenge was created
    // Wait, since defender is stored in KV, we just use the stored stats directly right now
    // But in a real DB we would re-fetch and validate against the stored hash.
    const isDefenderValid = validateSnapshot(challenge.stats, challenge.snapshotHash);
    if (!isDefenderValid) {
        return res.status(409).json({ error: 'Defender stats have drifted. Challenge is voided.' });
    }

    // 5. Seeded Battle Simulation
    // In production we would use a robust PRNG like 'seedrandom'
    // For MVP scaffold we will inject Math.random mapped to a dummy seed structure
    const matchSeed = Math.random().toString(36).substring(7); // Server-side deterministic seed

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

    // 6. Record Match
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

    KV.matches.set(matchId, matchResult);

    // 7. Close Challenge
    challenge.status = 'COMPLETED';
    KV.challenges.set(challengeId, challenge);

    // 8. Return determinable result for client playback
    return res.status(200).json({
        success: true,
        matchId,
        seed: matchSeed,
        summary,
        replayLogs: fullLog.logs // Client uses this to animate the fight visually
    });
}
