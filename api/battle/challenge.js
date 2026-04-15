/**
 * Battle Challenge Endpoint
 * POST /api/battle/challenge — Create a new challenge (JWT required)
 * GET  /api/battle/challenge — List active challenges (public)
 *
 * Challenge schema (BattleLoadoutV1):
 *   { fighter, item?, arena?, teamSnapshot, schemaVersion }
 */

import { withCors } from '../_lib/cors.js';
import { verifyAuth } from '../_lib/authMiddleware.js';
import {
    setChallengeAtomic,
    listActiveChallenges,
} from '../_lib/kv.js';

function generateChallengeId() {
    return `ch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function validateLoadout(loadout) {
    const errors = [];

    if (!loadout) {
        errors.push('Loadout is required');
        return errors;
    }

    if (!loadout.fighter) {
        errors.push('Fighter slot is required');
    } else {
        if (!loadout.fighter.collectionSlug && !loadout.fighter.collectionId && !loadout.fighter.collectionName) {
            errors.push('Fighter must have a collection identifier');
        }
        if (!loadout.fighter.tokenId && !loadout.fighter.nftId) {
            errors.push('Fighter must have a tokenId');
        }
    }

    if (loadout.schemaVersion !== 'battle-loadout-v1') {
        errors.push('Invalid schema version (expected battle-loadout-v1)');
    }

    return errors;
}

async function handler(req, res) {
    // ── GET: List active challenges (public) ──
    if (req.method === 'GET') {
        try {
            const challenges = await listActiveChallenges();

            return res.status(200).json({
                challenges,
                count: challenges.length,
            });
        } catch (error) {
            console.error('[Battle Challenge] List error:', error.message);
            return res.status(500).json({
                code: 'INTERNAL_ERROR',
                message: 'Failed to fetch challenges',
            });
        }
    }

    // ── POST: Create challenge (authenticated) ──
    if (req.method === 'POST') {
        // Verify JWT
        const auth = await verifyAuth(req);
        if (!auth.valid) {
            return res.status(401).json({
                code: 'UNAUTHORIZED',
                message: auth.error || 'Authentication required',
            });
        }

        const { loadout, fighterStats } = req.body || {};

        // Validate loadout
        const errors = validateLoadout(loadout);
        if (errors.length > 0) {
            return res.status(400).json({
                code: 'INVALID_LOADOUT',
                message: 'Loadout validation failed',
                details: errors,
            });
        }

        try {
            const challengeId = generateChallengeId();

            // Compute snapshot hash for anti-tamper verification
            const snapshotData = JSON.stringify(loadout) + JSON.stringify(fighterStats || {});
            const snapshotHash = await computeHash(snapshotData);

            const challengeRecord = {
                id: challengeId,
                player: auth.address,
                loadout,
                fighterStats: fighterStats || loadout.fighter?.stats || {},
                snapshotHash,
                timestamp: Date.now(),
                isAi: false,
                schemaVersion: 'battle-loadout-v1',
            };

            await setChallengeAtomic(challengeId, challengeRecord);

            return res.status(201).json({
                challengeId,
                snapshotHash,
                message: 'Challenge posted',
            });
        } catch (error) {
            console.error('[Battle Challenge] Create error:', error.message);
            return res.status(500).json({
                code: 'INTERNAL_ERROR',
                message: 'Failed to create challenge',
            });
        }
    }

    return res.status(405).json({
        code: 'METHOD_NOT_ALLOWED',
        message: 'Only GET and POST are accepted',
    });
}

/**
 * Simple hash function for snapshot integrity.
 * Uses Web Crypto API available in Vercel Edge/Node.
 */
async function computeHash(data) {
    // Node.js crypto fallback
    try {
        const { createHash } = await import('crypto');
        return createHash('sha256').update(data).digest('hex');
    } catch {
        // Browser/edge fallback
        const encoder = new TextEncoder();
        const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
        return Array.from(new Uint8Array(buffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }
}

export default withCors(handler);
