/**
 * Auth Verify Endpoint
 * POST /api/auth/verify
 *
 * Verifies a SIWE signed message, consumes the nonce (one-time use),
 * and issues a JWT for authenticated API calls.
 *
 * Body: { message: string, signature: string }
 * Returns: { token: string, address: string, expiresIn: number }
 */

import { kv } from '../kv.js';
import { withCors } from '../cors.js';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { SignJWT } from 'jose';
import { SiweMessage } from 'siwe';

const JWT_SECRET_RAW = process.env.JWT_SECRET;
if (!JWT_SECRET_RAW) {
    console.error('[Auth Verify] CRITICAL: JWT_SECRET is not set. Token issuance will fail.');
}
const JWT_SECRET = JWT_SECRET_RAW ? new TextEncoder().encode(JWT_SECRET_RAW) : null;
const JWT_EXPIRY_SECONDS = 3600; // 1 hour

/**
 * Parse SIWE message using the official siwe package.
 * Falls back to manual parsing if the package fails.
 */
function parseSiweMessage(message) {
    try {
        const siwe = new SiweMessage(message);
        return {
            domain: siwe.domain,
            address: siwe.address?.toLowerCase(),
            nonce: siwe.nonce,
            chainId: siwe.chainId,
            uri: siwe.uri,
            issuedAt: siwe.issuedAt,
            expirationTime: siwe.expirationTime,
        };
    } catch {
        // Fallback: manual line parsing if siwe package can't parse
        const lines = message.split('\n');
        const result = {};
        for (const line of lines) {
            if (line.startsWith('Nonce: ')) result.nonce = line.slice(7).trim();
            if (line.startsWith('Chain ID: ')) result.chainId = parseInt(line.slice(10).trim(), 10);
        }
        const addressLine = lines.find(l => /^0x[a-fA-F0-9]{40}$/.test(l.trim()));
        if (addressLine) result.address = addressLine.trim().toLowerCase();
        return result;
    }
}

const client = createPublicClient({
    chain: base,
    transport: http(),
});

async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({
            code: 'METHOD_NOT_ALLOWED',
            message: 'Only POST requests accepted',
        });
    }

    if (!JWT_SECRET) {
        return res.status(500).json({
            code: 'SERVER_MISCONFIGURED',
            message: 'Authentication is temporarily unavailable',
        });
    }

    const { message, signature } = req.body || {};

    if (!message || !signature) {
        return res.status(400).json({
            code: 'MISSING_FIELDS',
            message: 'Both message and signature are required',
        });
    }

    try {
        // 1. Parse the SIWE message
        const parsed = parseSiweMessage(message);

        if (!parsed.address || !parsed.nonce) {
            return res.status(400).json({
                code: 'INVALID_MESSAGE',
                message: 'Could not parse SIWE message (missing address or nonce)',
            });
        }

        const requestHost = req.headers['x-forwarded-host'] || req.headers.host || null;
        const inferredProto = requestHost && /^localhost[:]|^127\.0\.0\.1[:]/.test(requestHost) ? 'http' : 'https';
        const requestProto = req.headers['x-forwarded-proto'] || inferredProto;
        const requestOrigin = req.headers.origin || (requestHost ? `${requestProto}://${requestHost}` : null);

        if (parsed.domain && requestHost && parsed.domain !== requestHost) {
            return res.status(401).json({
                code: 'INVALID_DOMAIN',
                message: 'SIWE domain does not match this host',
            });
        }

        if (parsed.uri && requestOrigin && parsed.uri !== requestOrigin) {
            return res.status(401).json({
                code: 'INVALID_URI',
                message: 'SIWE URI does not match this origin',
            });
        }

        if (parsed.expirationTime && Date.parse(parsed.expirationTime) <= Date.now()) {
            return res.status(401).json({
                code: 'MESSAGE_EXPIRED',
                message: 'SIWE message has expired',
            });
        }

        // 2. Check nonce exists and matches
        const storedNonce = await kv.get(`nonce:${parsed.address}`);

        if (!storedNonce) {
            return res.status(401).json({
                code: 'NONCE_EXPIRED',
                message: 'Nonce expired or not found. Request a new one.',
            });
        }

        if (storedNonce !== parsed.nonce) {
            return res.status(401).json({
                code: 'NONCE_MISMATCH',
                message: 'Nonce does not match. Possible replay attack.',
            });
        }

        // 3. Verify signature on-chain
        const isValid = await client.verifyMessage({
            address: parsed.address,
            message,
            signature,
        });

        if (!isValid) {
            return res.status(401).json({
                code: 'INVALID_SIGNATURE',
                message: 'Signature verification failed',
            });
        }

        // 4. Consume nonce (one-time use — prevents replay)
        await kv.del(`nonce:${parsed.address}`);

        // 5. Issue JWT
        const token = await new SignJWT({
            address: parsed.address,
            chainId: parsed.chainId || 8453,
        })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime(`${JWT_EXPIRY_SECONDS}s`)
            .setSubject(parsed.address)
            .sign(JWT_SECRET);

        return res.status(200).json({
            token,
            address: parsed.address,
            expiresIn: JWT_EXPIRY_SECONDS,
        });
    } catch (error) {
        console.error('[Auth Verify] Error:', error.message);
        return res.status(500).json({
            code: 'INTERNAL_ERROR',
            message: 'Authentication failed',
        });
    }
}

export default withCors(handler);
