/**
 * Auth Nonce Endpoint
 * GET /api/auth/nonce?address=0x...
 *
 * Generates a one-time nonce for SIWE message signing.
 * Nonce expires after 5 minutes. One nonce per address at a time.
 */

import { kv } from '@vercel/kv';
import { withCors } from '../_lib/cors.js';

const NONCE_TTL_SECONDS = 300; // 5 minutes

function generateNonce() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
        nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
}

async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({
            code: 'METHOD_NOT_ALLOWED',
            message: 'Only GET requests accepted',
        });
    }

    const { address } = req.query;

    if (!address || typeof address !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return res.status(400).json({
            code: 'INVALID_ADDRESS',
            message: 'Valid Ethereum address required (0x... format)',
        });
    }

    const normalizedAddress = address.toLowerCase();
    const nonce = generateNonce();

    try {
        // Store nonce with TTL — auto-expires after 5 min
        await kv.set(`nonce:${normalizedAddress}`, nonce, { ex: NONCE_TTL_SECONDS });

        return res.status(200).json({
            nonce,
            expiresIn: NONCE_TTL_SECONDS,
        });
    } catch (error) {
        console.error('[Auth Nonce] KV write failed:', error.message);
        return res.status(500).json({
            code: 'INTERNAL_ERROR',
            message: 'Failed to generate nonce',
        });
    }
}

export default withCors(handler);
