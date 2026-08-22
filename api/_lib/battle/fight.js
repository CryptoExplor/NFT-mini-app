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
    kv,
    getChallengeAtomic,
    deleteChallengeAtomic,
    saveBattleRecord,
} from '../kv.js';
import { processEvent } from '../events.js';
import { computeLoadoutSnapshot } from '../../../src/lib/battle/snapshot.js';
import {
    sanitizeFighterStats,
    sanitizeModifierStats,
    sanitizeTeamSnapshot
} from './sanitize.js';
import { reserveBattleCount } from './verifyClaim.js';
import { verifyFighterOwnership } from './ownership.js';

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

        // 2b. The defender fights with their own NFT, or not at all.
        // (The attacker was checked when the challenge was posted.)
        const defenderOwnership = await verifyFighterOwnership(kv, {
            wallet: auth.address,
            collectionSlug: defenderLoadout.fighter.collectionSlug
                || defenderLoadout.fighter.collectionId
                || defenderLoadout.fighter.collectionName,
            tokenId: defenderLoadout.fighter.tokenId ?? defenderLoadout.fighter.nftId
        });

        if (!defenderOwnership.owned) {
            return res.status(403).json({
                code: 'FIGHTER_NOT_OWNED',
                message: 'You do not own the NFT you are trying to fight with.',
                reason: defenderOwnership.reason
            });
        }

        // 3. Extract stats
        // NOTE: both sides are client-supplied, so both are clamped to the
        // balance envelope. Previously the defender could post arbitrary stats
        // (hp: 1e9) in the fight request and win every PvP match.
        const rawAttackerStats = challenge.fighterStats || challenge.loadout?.fighter?.stats || {};
        const rawDefenderStats = defenderLoadout.fighter.stats || {};

        // Use shared utility for deterministic verification (hash the stored,
        // untouched values — clamping happens after the anti-tamper check).
        const snapshotHash = computeLoadoutSnapshot(challenge.loadout, rawAttackerStats);

        if (snapshotHash !== challenge.snapshotHash) {
            return res.status(409).json({
                code: 'SNAPSHOT_MISMATCH',
                message: 'Challenge data no longer matches the stored snapshot',
            });
        }

        const attackerStats = sanitizeFighterStats(rawAttackerStats, {
            name: challenge.loadout?.fighter?.name
        });
        const defenderStats = sanitizeFighterStats(rawDefenderStats, {
            name: defenderLoadout.fighter?.name
        });
        const attackerItem = sanitizeModifierStats(challenge.loadout?.item?.stats);
        const attackerArena = sanitizeModifierStats(challenge.loadout?.arena?.stats);
        const defenderItem = sanitizeModifierStats(defenderLoadout.item?.stats);
        const attackerTeam = sanitizeTeamSnapshot(challenge.loadout?.teamSnapshot);
        const defenderTeam = sanitizeTeamSnapshot(defenderLoadout.teamSnapshot);

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
                playerItem: attackerItem,
                enemyItem: defenderItem,
                environment: attackerArena,
                playerTeam: attackerTeam,
                enemyTeam: defenderTeam,
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

        // 8. Save Verifiable Battle Record (Seed-First Schema)
        const attackerName = challenge.loadout?.fighter?.name || `Fighter ${attackerId}`;
        const defenderName = defenderLoadout.fighter.name || `Fighter ${defenderId}`;

        const battleRecord = {
            seed,
            players: {
                p1: {
                    id: challenge.player,
                    name: attackerName,
                    stats: attackerStats,
                    item: attackerItem,
                    arena: attackerArena,
                    team: attackerTeam
                },
                p2: {
                    id: auth.address,
                    name: defenderName,
                    stats: defenderStats,
                    item: defenderItem,
                    arena: null,
                    team: defenderTeam
                }
            },
            options: {
                isAiBattle: false
            },
            result: {
                winnerSide: battleResult.winnerSide || summary.winnerSide,
                winnerName: summary.winner,
                rounds: battleResult.totalRounds || summary.totalRounds
            },
            // CRITICAL: Persist logs so WATCH/Replay works from the history tab
            logs: battleResult.logs
        };


        const generatedBattleId = await saveBattleRecord(battleRecord).catch(err => {
            console.error('[Fight] KV Battle Record save failed:', err.message);
            return null;
        });

        // These results were produced by the server, so they are counted here
        // directly. Reserving the (battleId, wallet) pairs also stops the client
        // from re-claiming the same PvP battle through /api/track.
        if (generatedBattleId) {
            await Promise.allSettled([
                reserveBattleCount(kv, generatedBattleId, auth.address),
                reserveBattleCount(kv, generatedBattleId, challenge.player)
            ]);
        }

        // Analytics for both sides.
        //  - affectsGlobal   : only the defender event, so a match counts once in
        //                      battle_total / the live feed.
        //  - countsGlobalWin : BOTH events, so an attacker victory is still counted
        //                      in stats:global.battle_wins (the global win rate used
        //                      to only ever see defender wins).
        // Awaited (allSettled) — a serverless instance can be frozen the moment the
        // response is sent, which silently dropped these writes before.
        await Promise.allSettled([
            processEvent(kv, {
                type: 'battle_result_v2',
                wallet: auth.address,
                timestamp: Date.now(),
                metadata: {
                    won: battleResult.winnerSide === 'P2',
                    isAi: false,
                    rounds: battleResult.totalRounds || summary.totalRounds || 0,
                    opponent: attackerName,
                    battleId: generatedBattleId || null,
                    affectsGlobal: true,
                    countsGlobalWin: true,
                    ladderVerified: true
                }
            }).catch((err) => {
                console.error('[Fight] battle_result_v2 analytics failed:', err.message);
            }),

            processEvent(kv, {
                type: 'battle_result_v2',
                wallet: challenge.player,
                timestamp: Date.now(),
                metadata: {
                    won: battleResult.winnerSide === 'P1',
                    isAi: false,
                    rounds: battleResult.totalRounds || summary.totalRounds || 0,
                    opponent: defenderName,
                    battleId: generatedBattleId || null,
                    affectsGlobal: false,
                    countsGlobalWin: true,
                    ladderVerified: true
                }
            }).catch((err) => {
                console.error('[Fight] mirrored attacker battle_result_v2 analytics failed:', err.message);
            })
        ]);

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


export default withCors(handler);
