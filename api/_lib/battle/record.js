/**
 * Battle Record Endpoint
 * POST /api/battle?action=record — Save an AI battle result server-side (JWT required)
 *
 * AI battles are resolved locally (no server round-trip during play).
 * This endpoint persists the result so it appears in the verifiable history.
 *
 * Body: {
 *   seed: string,          — deterministic seed used for the local simulation
 *   p1: { name, stats, item?, arena?, team? },
 *   p2: { name, stats },
 *   options: { isAiBattle: true },
 *   result: { winnerSide, winnerName, rounds }
 * }
 */

import { withCors } from '../cors.js';
import { verifyAuth } from '../authMiddleware.js';
import { saveBattleRecord, kv } from '../kv.js';
import { checkRateLimit, RateLimitError } from '../events.js';
import { verifyFighterOwnership } from './ownership.js';
import {
    sanitizeFighterStats,
    sanitizeModifierStats,
    sanitizeTeamSnapshot,
    sanitizeAiWinRate,
    sanitizeLogs
} from './sanitize.js';

async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Only POST accepted' });
    }

    const auth = await verifyAuth(req);
    if (!auth.valid) {
        return res.status(401).json({ code: 'UNAUTHORIZED', message: auth.error || 'Auth required' });
    }

    const { seed, p1, p2, options, result, extras, aiWinRate } = req.body || {};

    if (typeof seed !== 'string' || seed.length === 0 || seed.length > 256) {
        return res.status(400).json({
            code: 'INVALID_SEED',
            message: 'seed must be a string of at most 256 characters',
        });
    }

    if (!seed || !p1?.name || !p2?.name || !result?.winnerSide) {
        return res.status(400).json({
            code: 'INVALID_PAYLOAD',
            message: 'Required: seed, p1.name, p2.name, result.winnerSide',
        });
    }

    // Only AI battles go through this endpoint — reject PvP to avoid double-recording
    if (!options?.isAiBattle) {
        return res.status(400).json({
            code: 'PVP_NOT_ALLOWED',
            message: 'This endpoint is for AI battles only. PvP is recorded by the fight handler.',
        });
    }

    try {
        // Throttle: bounds how fast a wallet can manufacture AI battles.
        await checkRateLimit(kv, auth.address, 'battle_record', 40, 3600);

        // The recorded fighter must belong to the caller.
        const ownership = await verifyFighterOwnership(kv, {
            wallet: auth.address,
            collectionSlug: p1.collectionSlug || p1.collectionId || p1.stats?.source,
            tokenId: p1.tokenId ?? p1.nftId ?? p1.stats?.tokenId
        });

        if (!ownership.owned) {
            return res.status(403).json({
                code: 'FIGHTER_NOT_OWNED',
                message: 'You do not own the NFT used in this battle.',
                reason: ownership.reason
            });
        }

        // ── Sanitise every client-supplied value ──
        // Stats are clamped to the balance envelope, so a tampered payload can
        // never exceed a legitimately obtainable fighter.
        const p1Stats = sanitizeFighterStats(p1.stats, { name: p1.name });
        const p2Stats = sanitizeFighterStats(p2.stats, { name: p2.name });
        const p1Item = sanitizeModifierStats(p1.item);
        const p1Arena = sanitizeModifierStats(p1.arena);
        const p1Team = sanitizeTeamSnapshot(p1.team);
        const winRate = sanitizeAiWinRate(aiWinRate);

        // ── Re-simulate the battle server-side (deterministic from the seed) ──
        // The client no longer decides who won: the engine does, from the same
        // inputs. A forged `result.winnerSide` is rejected outright.
        const { simulateBattleV2 } = await import('../../../src/lib/battle/engineV2.js');
        const { summarizeReplay } = await import('../../../src/lib/game/engine.js');

        const simulated = simulateBattleV2(p1Stats, p2Stats, {
            seed,
            isAiBattle: true,
            aiWinRate: winRate,
            playerItem: p1Item,
            environment: p1Arena,
            playerTeam: p1Team
        });
        const summary = summarizeReplay(simulated);
        const verifiedWinnerSide = summary.winnerSide || simulated.winnerSide || null;

        if (verifiedWinnerSide && verifiedWinnerSide !== result.winnerSide) {
            return res.status(422).json({
                code: 'RESULT_MISMATCH',
                message: 'Reported result does not match the deterministic simulation.',
            });
        }

        const battleRecord = {
            seed,
            players: {
                p1: {
                    id: auth.address,
                    name: p1Stats.name,
                    stats: p1Stats,
                    item: p1Item,
                    arena: p1Arena,
                    team: p1Team,
                },
                p2: {
                    // AI opponent has no wallet address — use a sentinel
                    id: `ai:${p2Stats.name}`,
                    name: p2Stats.name,
                    stats: p2Stats,
                    item: null,
                    arena: null,
                    team: [],
                },
            },
            options: { isAiBattle: true, aiWinRate: winRate },
            result: {
                winnerSide: verifiedWinnerSide || result.winnerSide,
                winnerName: verifiedWinnerSide === 'P1' ? p1Stats.name : p2Stats.name,
                rounds: Math.max(0, Math.min(Number(simulated.totalRounds) || 0, 200)),
            },
            ...(extras ? { extras } : {}),
            // Server-generated logs: bounded in size and guaranteed to match the
            // stored result (client logs were unbounded and unverifiable).
            logs: sanitizeLogs(simulated.logs)
        };

        const battleId = await saveBattleRecord(battleRecord);

        // NOTE: the arena ladder (leaderboard:battle_wins:*) is intentionally NOT
        // written here any more. The client also emits `battle_result_v2` for the
        // same AI battle, which is the single canonical writer for wins/points.
        // Writing in both places double counted every AI victory on the ladder
        // while user:<w>:profile.battle_wins was only counted once.

        return res.status(200).json({ battleId, recorded: true, verified: true });
    } catch (err) {
        if (err instanceof RateLimitError || err?.code === 'RATE_LIMITED') {
            res.setHeader('Retry-After', String(err.retryAfter || 3600));
            return res.status(429).json({ code: 'RATE_LIMITED', message: 'Too many battle records' });
        }
        console.error('[Battle Record] Error:', err.message);
        return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to record battle' });
    }
}

export default withCors(handler);
