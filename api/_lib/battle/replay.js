/**
 * Battle Replay Endpoint
 * GET /api/battle/replay?id=...
 *
 * Fetches a single battle schema by its ID.
 * Returns the exact initial conditions and seed required to reconstruct
 * the combat logs client-side in a deterministic, verifiable manner.
 */

import { withCors } from '../_lib/cors.js';
import { getBattleRecord } from '../_lib/kv.js';

async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({
            code: 'METHOD_NOT_ALLOWED',
            message: 'Only GET requests accepted',
        });
    }

    const { id } = req.query;

    if (!id || typeof id !== 'string') {
        return res.status(400).json({
            code: 'MISSING_BATTLE_ID',
            message: 'A valid battle id is required',
        });
    }

    try {
        const record = await getBattleRecord(id);

        if (!record) {
            return res.status(404).json({
                code: 'BATTLE_NOT_FOUND',
                message: 'Battle record not found or has expired (replays are kept for 30 days).',
            });
        }

        // Cache globally for 1 day, since replays are immutable verifiable records
        res.setHeader('Cache-Control', 'public, s-maxage=86400');

        return res.status(200).json({
            record,
        });
    } catch (error) {
        console.error('[Battle Replay] GET failed:', error.message);
        return res.status(500).json({
            code: 'INTERNAL_ERROR',
            message: 'Failed to fetch battle record',
        });
    }
}

export default withCors(handler);
