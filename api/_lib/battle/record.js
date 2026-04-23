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
import { saveBattleRecord, incrementBattleWins } from '../kv.js';

async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Only POST accepted' });
    }

    const auth = await verifyAuth(req);
    if (!auth.valid) {
        return res.status(401).json({ code: 'UNAUTHORIZED', message: auth.error || 'Auth required' });
    }

    const { seed, p1, p2, options, result, extras, logs } = req.body || {};

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
        const battleRecord = {
            seed,
            players: {
                p1: {
                    id: auth.address,
                    name: p1.name,
                    stats: p1.stats || {},
                    item: p1.item || null,
                    arena: p1.arena || null,
                    team: p1.team || [],
                },
                p2: {
                    // AI opponent has no wallet address — use a sentinel
                    id: `ai:${p2.name}`,
                    name: p2.name,
                    stats: p2.stats || {},
                    item: null,
                    arena: null,
                    team: [],
                },
            },
            options: { isAiBattle: true },
            result: {
                winnerSide: result.winnerSide,
                winnerName: result.winnerName || (result.winnerSide === 'P1' ? p1.name : p2.name),
                rounds: result.rounds || 0,
            },
            // Pre-computed stats (crits, dmg) captured at play-time — used by leaderboard
            // so it doesn't need to re-simulate AI battles with the wrong engine
            ...(extras ? { extras } : {}),
            // Replay data
            logs: logs || []
        };

        const battleId = await saveBattleRecord(battleRecord);

        // Update leaderboard if player won
        if (result.winnerSide === 'P1') {
            await incrementBattleWins(auth.address).catch(err =>
                console.error('[Record] Leaderboard update failed:', err.message)
            );
        }

        return res.status(200).json({ battleId, recorded: true });
    } catch (err) {
        console.error('[Battle Record] Error:', err.message);
        return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to record battle' });
    }
}

export default withCors(handler);
