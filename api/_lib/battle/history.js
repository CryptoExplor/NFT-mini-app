/**
 * Battle History Endpoint
 * GET /api/battle/history?address=0x...
 *
 * Fetches the most recent verifiable battle schemas stored in KV.
 * Used to populate the player's match history.
 */

import { withCors } from '../_lib/cors.js';
import { getUserBattleHistory } from '../_lib/kv.js';

async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({
            code: 'METHOD_NOT_ALLOWED',
            message: 'Only GET requests accepted',
        });
    }

    const { address, limit = 50 } = req.query;

    if (!address || typeof address !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return res.status(400).json({
            code: 'INVALID_ADDRESS',
            message: 'Valid Ethereum address required (0x... format)',
        });
    }

    try {
        const history = await getUserBattleHistory(address.toLowerCase(), Math.min(100, parseInt(limit, 10) || 50));

        // Cache at edge for 30s as match history updates relatively frequently,
        // but not frequently enough to warrant zero caching.
        res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

        return res.status(200).json({
            address: address.toLowerCase(),
            history: history || [],
        });
    } catch (error) {
        console.error('[Battle History] GET failed:', error.message);
        return res.status(500).json({
            code: 'INTERNAL_ERROR',
            message: 'Failed to fetch battle history',
        });
    }
}

export default withCors(handler);
