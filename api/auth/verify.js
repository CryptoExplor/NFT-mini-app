import { kv } from '@vercel/kv';
import { SiweMessage } from 'siwe';
import { SignJWT } from 'jose';

function cors(res) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * POST /api/auth/verify
 * Body: { message: string, signature: string }
 * 
 * Verifies EIP-4361 SIWE signature, validates nonce, issues JWT.
 */
export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { message, signature } = req.body;

    if (!message || !signature) {
        return res.status(400).json({ error: 'Missing message or signature' });
    }

    try {
        // Parse the SIWE message
        const siweMessage = new SiweMessage(message);

        // Verify the signature
        const { data: fields } = await siweMessage.verify({ signature });

        const wallet = fields.address.toLowerCase();

        // Check nonce matches what we stored
        const storedNonce = await kv.get(`auth:nonce:${wallet}`);
        if (!storedNonce || storedNonce !== fields.nonce) {
            return res.status(401).json({ error: 'Invalid or expired nonce' });
        }

        // Delete nonce (one-time use)
        await kv.del(`auth:nonce:${wallet}`);

        // Check if wallet is admin
        const adminList = (process.env.ADMIN_WALLETS || '')
            .split(',')
            .map(w => w.trim().toLowerCase())
            .filter(Boolean);
        const isAdmin = adminList.includes(wallet);

        // Issue JWT (30 min expiry)
        const secret = new TextEncoder().encode(process.env.JWT_SECRET);
        const token = await new SignJWT({
            wallet,
            isAdmin,
            iat: Math.floor(Date.now() / 1000)
        })
            .setProtectedHeader({ alg: 'HS256' })
            .setExpirationTime('30m')
            .setIssuedAt()
            .setSubject(wallet)
            .sign(secret);

        return res.status(200).json({
            token,
            wallet,
            isAdmin,
            expiresIn: 1800 // 30 min in seconds
        });

    } catch (error) {
        console.error('SIWE verification error:', error);
        return res.status(401).json({ error: 'Signature verification failed' });
    }
}
