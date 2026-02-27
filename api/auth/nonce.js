import { kv } from '@vercel/kv';
import crypto from 'crypto';
import { setCors } from '../_lib/cors.js';

/**
 * GET /api/auth/nonce?wallet=0x...
 * 
 * Generates a random nonce for EIP-4361 Sign-In.
 * Stores it in Redis with a 5-minute TTL.
 */
export default async function handler(req, res) {
    setCors(req, res, {
        methods: 'GET,OPTIONS',
        headers: 'Content-Type'
    });
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { wallet } = req.query;

    if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
    }

    try {
        // Generate cryptographically secure nonce
        const nonce = crypto.randomBytes(16).toString('hex');

        // Store with 5-minute TTL (one-time use)
        await kv.set(`auth:nonce:${wallet.toLowerCase()}`, nonce, { ex: 300 });

        return res.status(200).json({
            nonce,
            expiresIn: 300,
            issuedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Nonce generation error:', error);
        return res.status(500).json({ error: 'Failed to generate nonce' });
    }
}
