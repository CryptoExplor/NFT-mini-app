/**
 * Battle Fight Endpoint
 * POST /api/battle/fight — Resolve a PvP battle (JWT required)
 *
 * Flow:
 *   1. Load challenge from KV
 *   2. Validate both loadouts
 *   3. Recompute snapshot hashes (anti-tamper)
 *   4. Generate deterministic seed
 *   5. Simulate server-side via engine.js
 *   6. Return result + delete challenge (consumed)
 *   7. Update leaderboard
 *
 * Body: { challengeId: string, defenderLoadout: BattleLoadoutV1 }
 * Returns: { winner, logs, seed, summary }
 */

import { withCors } from '../cors.js';
import { verifyAuth } from '../authMiddleware.js';
import {
    getChallengeAtomic,
    deleteChallengeAtomic,
    incrementBattleWins,
    saveBattleRecord,
} from '../kv.js';

async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({
            code: 'METHOD_NOT_ALLOWED',
            message: 'Only POST requests accepted',
        });
    }

    // 1. Authenticate
    const auth = await verifyAuth(req);
    if (!auth.valid) {
        return res.status(401).json({
            code: 'UNAUTHORIZED',
            message: auth.error || 'Authentication required',
        });
    }

    const { challengeId, defenderLoadout } = req.body || {};

    if (!challengeId) {
        return res.status(400).json({
            code: 'MISSING_CHALLENGE_ID',
            message: 'challengeId is required',
        });
    }

    if (!defenderLoadout?.fighter) {
        return res.status(400).json({
            code: 'INVALID_LOADOUT',
            message: 'Defender loadout with fighter is required',
        });
    }

    try {
        // 2. Load challenge
        const challenge = await getChallengeAtomic(challengeId);

        if (!challenge) {
            return res.status(404).json({
                code: 'CHALLENGE_NOT_FOUND',
                message: 'Challenge not found or expired',
            });
        }

        // Prevent self-challenge
        if (challenge.player === auth.address) {
            return res.status(403).json({
                code: 'SELF_CHALLENGE',
                message: 'Cannot fight your own challenge',
            });
        }

        // 3. Extract stats
        const attackerStats = challenge.fighterStats || challenge.loadout?.fighter?.stats || {};
        const defenderStats = defenderLoadout.fighter.stats || {};

        const snapshotData = JSON.stringify(challenge.loadout) + JSON.stringify(attackerStats);
        const snapshotHash = await computeHash(snapshotData);

        if (snapshotHash !== challenge.snapshotHash) {
            return res.status(409).json({
                code: 'SNAPSHOT_MISMATCH',
                message: 'Challenge data no longer matches the stored snapshot',
            });
        }

        // 4. Generate deterministic seed
        const attackerId = `${challenge.loadout?.fighter?.collectionSlug || 'unknown'}_${challenge.loadout?.fighter?.tokenId || '0'}`;
        const defenderId = `${defenderLoadout.fighter.collectionSlug || defenderLoadout.fighter.collectionName || 'unknown'}_${defenderLoadout.fighter.tokenId || defenderLoadout.fighter.nftId || '0'}`;
        const seed = `battle:${challengeId}:${[attackerId, defenderId].sort().join(':')}`;

        // 5. Simulate battle server-side
        // Dynamic import to keep bundle lean (engine is heavy)
        const { simulateBattle, summarizeReplay } = await import('../../../src/lib/game/engine.js');
        const { createPRNG } = await import('../../../src/lib/battle/prng.js');

        const prng = createPRNG(seed);

        const battleResult = simulateBattle(
            { name: `Challenger ${attackerId}`, ...attackerStats },
            { name: `Defender ${defenderId}`, ...defenderStats },
            prng,
            {
                playerItem: challenge.loadout?.item?.stats || null,
                enemyItem: defenderLoadout.item?.stats || null,
                environment: challenge.loadout?.arena?.stats || null,
                playerTeam: challenge.loadout?.teamSnapshot || [],
                enemyTeam: defenderLoadout.teamSnapshot || [],
                isAiBattle: false,
            }
        );

        const summary = summarizeReplay(battleResult);

        // 6. Determine winner address
        // P1 = attacker (challenge poster), P2 = defender (current user)
        const winnerAddress = battleResult.winnerSide === 'P1'
            ? challenge.player
            : auth.address;

        // 7. Delete consumed challenge
        await deleteChallengeAtomic(challengeId);

        // 8. Update leaderboard
        await incrementBattleWins(winnerAddress).catch(err => {
            console.error('[Fight] Leaderboard update failed:', err.message);
        });

        // 9. Save Verifiable Battle Record (Seed-First Schema)
        const battleRecord = {
            seed,
            players: {
                p1: {
                    id: challenge.player,
                    name: `Challenger ${attackerId}`,
                    stats: attackerStats,
                    item: challenge.loadout?.item?.stats || null,
                    arena: challenge.loadout?.arena?.stats || null,
                    team: challenge.loadout?.teamSnapshot || []
                },
                p2: {
                    id: auth.address,
                    name: `Defender ${defenderId}`,
                    stats: defenderStats,
                    item: defenderLoadout.item?.stats || null,
                    arena: null, 
                    team: defenderLoadout.teamSnapshot || []
                }
            },
            options: {
                isAiBattle: false
            },
            result: {
                winnerSide: battleResult.winnerSide || summary.winnerSide,
                winnerName: summary.winner,
                rounds: battleResult.totalRounds || summary.totalRounds
            }
        };

        const generatedBattleId = await saveBattleRecord(battleRecord).catch(err => {
            console.error('[Fight] KV Battle Record save failed:', err.message);
            return null;
        });

        return res.status(200).json({
            battleId: generatedBattleId,
            winner: summary.winner,
            winnerAddress,
            attackerAddress: challenge.player,
            defenderAddress: auth.address,
            totalRounds: battleResult.totalRounds || summary.totalRounds,
            seed,
            summary: {
                winner: summary.winner,
                winnerSide: battleResult.winnerSide,
                totalRounds: summary.totalRounds,
                totalDamageP1: summary.totalDamageP1 || 0,
                totalDamageP2: summary.totalDamageP2 || 0,
                critsLanded: (battleResult.logs || []).filter(l => l.isCrit).length,
                dodgesTriggered: (battleResult.logs || []).filter(l => l.isDodge).length,
            },
            // Replay data (logs can be large — consider pagination for prod)
            logs: battleResult.logs,
        });

    } catch (error) {
        console.error('[Battle Fight] Error:', error.message, error.stack);
        return res.status(500).json({
            code: 'INTERNAL_ERROR',
            message: 'Battle simulation failed',
        });
    }
}

async function computeHash(data) {
    try {
        const { createHash } = await import('crypto');
        return createHash('sha256').update(data).digest('hex');
    } catch {
        const encoder = new TextEncoder();
        const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
        return Array.from(new Uint8Array(buffer))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
    }
}

export default withCors(handler);
