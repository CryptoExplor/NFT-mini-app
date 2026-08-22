import { kv } from './_lib/kv.js';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { setCors } from './_lib/cors.js';
import { verifyAuth } from './_lib/authMiddleware.js';
import {
    VALID_EVENTS,
    processEvent,
    checkRateLimit,
    cleanupExpiredKeys,
    RateLimitError
} from './_lib/events.js';

// Events that grant points / mutate a wallet's record always need a JWT.
const AUTH_REQUIRED_EVENTS = new Set([
    'battle_result_v2',
    'battle_won',
    'mint_success',
    'social_share'
]);

// Events from the above list that MAY be accepted unauthenticated when they
// carry no wallet (guest play). They only move anonymous global counters —
// never points, profiles or leaderboards — and are rate limited by IP.
const GUEST_ALLOWED_EVENTS = new Set(['battle_result_v2']);

// Client-supplied economics are untrusted: clamp them so a caller cannot
// inflate volume / gas / points with an arbitrary number.
const MAX_PRICE_ETH = 100;
const MAX_GAS_ETH = 10;

function sanitizeAmount(value, max) {
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (!Number.isFinite(num) || num <= 0) return 0;
    return Math.min(num, max);
}

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
        return forwarded.split(',')[0].trim();
    }
    if (Array.isArray(forwarded) && forwarded.length > 0) {
        return String(forwarded[0]).trim();
    }
    return req.headers['x-real-ip'] || 'unknown_ip';
}

// RPC Client for on-chain verification
const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.RPC_URL)
});

export default async function handler(req, res) {
    setCors(req, res, {
        methods: 'POST,OPTIONS',
        headers: 'Content-Type, Authorization'
    });
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const body = req.body || {};
        const {
            type,
            wallet,
            collection,
            txHash,
            price,
            gas,
            referrer,
            campaign,
            device,
            page,
            platform,
            metadata
        } = body;

        if (!type || !VALID_EVENTS.includes(type)) {
            return res.status(400).json({ error: `Invalid event type. Valid: ${VALID_EVENTS.join(', ')}` });
        }

        // ── Auth guard for points-granting events ──
        const bodyWallet = (wallet && wallet !== 'anonymous') ? String(wallet).toLowerCase() : '';
        let isGuestEvent = false;

        if (AUTH_REQUIRED_EVENTS.has(type)) {
            if (!bodyWallet && GUEST_ALLOWED_EVENTS.has(type)) {
                // Guest play: accepted, but stripped of anything wallet-scoped.
                isGuestEvent = true;
            } else {
                const auth = await verifyAuth(req);
                if (!auth?.valid) {
                    return res.status(401).json({ error: 'Authentication required' });
                }

                if (!bodyWallet || auth.address.toLowerCase() !== bodyWallet) {
                    return res.status(403).json({ error: 'Authenticated wallet does not match event wallet' });
                }
            }
        }

        // ── txHash required for mint_success ──
        if (type === 'mint_success' && !txHash) {
            return res.status(400).json({ error: 'txHash is required for mint_success events' });
        }

        const normalizedWallet = isGuestEvent ? 'anonymous' : (bodyWallet || 'anonymous');

        const timestamp = Date.now();

        // ── Rate limiting ──
        const clientIp = getClientIp(req);
        const rateLimitKey = (normalizedWallet && normalizedWallet !== 'anonymous') ? normalizedWallet : clientIp;
        await checkRateLimit(kv, rateLimitKey, type);

        // ── Occasional cleanup (1% chance) ──
        if (Math.random() < 0.01) {
            cleanupExpiredKeys(kv).catch(console.error);
        }

        // ── Build event payload ──
        // Keep `platform` (used by social_share) — it used to be dropped here,
        // so the share-platform breakdown was never recorded.
        const safeMetadata = { ...(metadata && typeof metadata === 'object' ? metadata : {}) };
        if (platform && typeof platform === 'string') {
            safeMetadata.platform = safeMetadata.platform || platform.slice(0, 40);
        }

        const event = {
            type,
            wallet: normalizedWallet || 'anonymous',
            collection: collection || null,
            txHash: txHash || null,
            price: sanitizeAmount(price, MAX_PRICE_ETH),
            gas: sanitizeAmount(gas, MAX_GAS_ETH),
            referrer: referrer || 'direct',
            campaign: campaign || null,
            device: device || 'unknown',
            page: page || null,
            metadata: safeMetadata,
            timestamp
        };

        // ── Delegate to centralized event processor ──
        const result = await processEvent(kv, event, {
            verifyMintTransaction: (hash, w) => verifyMintTransaction(hash, w)
        });

        if (!result.success) {
            return res.status(400).json({ error: result.error || 'Event processing failed' });
        }

        return res.status(200).json({
            success: true,
            eventId: result.eventId,
            duplicate: Boolean(result.duplicate)
        });

    } catch (error) {
        // Throttling is a client-actionable condition, not a server fault.
        if (error instanceof RateLimitError || error?.code === 'RATE_LIMITED') {
            res.setHeader('Retry-After', String(error.retryAfter || 60));
            return res.status(429).json({ error: 'Rate limit exceeded', retryAfter: error.retryAfter || 60 });
        }
        console.error('Track error:', error);
        return res.status(500).json({ error: 'Failed to track event' });
    }
}

// ── Transaction Verification ───────────────────────────────────

async function verifyMintTransaction(txHash, wallet) {
    try {
        let receipt;
        try {
            receipt = await publicClient.getTransactionReceipt({ hash: txHash });
        } catch (err) {
            console.warn(`Tx receipt not found for ${txHash} (RPC latency possible)`);
            return false; // Fail-closed: reject unverifiable mints
        }

        if (receipt.status !== 'success') return false;
        if (receipt.from.toLowerCase() !== wallet.toLowerCase()) return false;

        const TOPICS = {
            ERC721_TRANSFER: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
            ERC1155_SINGLE:  '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62',
            ERC1155_BATCH:   '0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb'
        };

        // ERC topics zero-pad addresses to 32 bytes:
        // 0x + 24 zero chars + 40-char address = 66 chars total
        // .slice(2) strips '0x' before prepending the correct padding
        const walletPad = `0x000000000000000000000000${wallet.toLowerCase().slice(2)}`;

        return receipt.logs.some(log => {
            const t0 = log.topics[0];
            if (t0 === TOPICS.ERC721_TRANSFER) return log.topics[2]?.toLowerCase() === walletPad;
            if (t0 === TOPICS.ERC1155_SINGLE)  return log.topics[3]?.toLowerCase() === walletPad;
            if (t0 === TOPICS.ERC1155_BATCH)   return log.topics[3]?.toLowerCase() === walletPad;
            return false;
        });
    } catch (e) {
        console.error('Verify tx failed:', e);
        return false; // Fail-closed: reject on verification errors
    }
}
