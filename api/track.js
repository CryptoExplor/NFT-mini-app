import { kv } from './_lib/kv.js';
import { createPublicClient, decodeAbiParameters, formatEther, http } from 'viem';
import { base } from 'viem/chains';
import { setCors } from './_lib/cors.js';
import { verifyAuth } from './_lib/authMiddleware.js';
import { verifyBattleClaim } from './_lib/battle/verifyClaim.js';
import { COLLECTIONS_MAP } from '../collections/index.js';
import {
    VALID_EVENTS,
    processEvent,
    checkRateLimit,
    cleanupExpiredKeys,
    RateLimitError
} from './_lib/events.js';

// Events that grant points / mutate a wallet's record normally need a JWT.
// mint_success is the exception: the confirmed on-chain receipt proves the
// recipient and collection, so requiring a separate SIWE session caused every
// normal mint-only user to receive 401 and silently lose feed/profile updates.
const AUTH_REQUIRED_EVENTS = new Set([
    'battle_result_v2',
    'battle_won',
    'social_share'
]);

export function eventRequiresAuth(type) {
    return AUTH_REQUIRED_EVENTS.has(type);
}

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

        if (eventRequiresAuth(type)) {
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
        // Receipt-proven mints do not need JWT auth, so bind their throttle to
        // both wallet and caller IP. Otherwise an attacker could exhaust a
        // victim wallet's five-event quota with invalid hashes.
        const rateLimitKey = type === 'mint_success' && normalizedWallet !== 'anonymous'
            ? `${normalizedWallet}:${clientIp}`
            : ((normalizedWallet && normalizedWallet !== 'anonymous') ? normalizedWallet : clientIp);
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

        // ── Battle claims must reference a server-stored battle record ──
        // The ladder is only allowed to move for a battle the server produced
        // (PvP via the fight endpoint, AI via the verified record endpoint) and
        // each battle can only be counted once per wallet. The stored record —
        // not the request body — decides whether the wallet actually won.
        let battleVerification = null;
        if (type === 'battle_result_v2' && normalizedWallet !== 'anonymous') {
            battleVerification = await verifyBattleClaim(kv, normalizedWallet, safeMetadata);
            safeMetadata.ladderVerified = battleVerification.verified;

            if (battleVerification.verified) {
                safeMetadata.won = battleVerification.won;
                if (battleVerification.opponent) safeMetadata.opponent = battleVerification.opponent;
                safeMetadata.isAi = battleVerification.isAi;
            } else {
                // Unverifiable claim: never counted, never rejected loudly (the
                // record write may simply still be in flight on a slow network).
                console.warn(`[Track] Unverified battle claim (${battleVerification.reason}) from ${normalizedWallet}`);
                return res.status(202).json({
                    success: true,
                    counted: false,
                    reason: battleVerification.reason
                });
            }
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
            verifyMintTransaction: (hash, w, slug) => verifyMintTransaction(hash, w, slug)
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

const MINT_TOPICS = {
    ERC721_TRANSFER: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
    ERC1155_SINGLE: '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62',
    ERC1155_BATCH: '0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb'
};
const ZERO_ADDRESS_TOPIC = `0x${'0'.repeat(64)}`;

function getCollectionConfig(collectionSlug) {
    const collection = COLLECTIONS_MAP[String(collectionSlug || '').toLowerCase()];
    const address = String(collection?.contractAddress || '').toLowerCase();
    if (!collection || !/^0x[a-f0-9]{40}$/.test(address)) return null;
    return { collection, address };
}

function topicUint(topic) {
    try {
        return BigInt(topic).toString();
    } catch {
        return '';
    }
}

function safeQuantity(value) {
    try {
        const quantity = BigInt(value);
        return Number(quantity > 999999n ? 999999n : quantity || 1n);
    } catch {
        return 1;
    }
}

/** Extract server-trusted rich mint details from ERC-721/1155 receipt logs. */
export function getMintDetailsFromReceipt(receipt, wallet, collectionSlug) {
    const normalizedWallet = String(wallet || '').toLowerCase();
    const config = getCollectionConfig(collectionSlug);
    if (receipt?.status !== 'success' || !config || !/^0x[a-f0-9]{40}$/.test(normalizedWallet)) {
        return null;
    }

    const walletTopic = `0x${'0'.repeat(24)}${normalizedWallet.slice(2)}`;

    for (const log of receipt.logs || []) {
        if (String(log?.address || '').toLowerCase() !== config.address) continue;

        const topics = (log.topics || []).map((topic) => String(topic || '').toLowerCase());
        const signature = topics[0];
        let tokenIds = [];
        let quantity = 1;

        if (signature === MINT_TOPICS.ERC721_TRANSFER) {
            if (topics[1] !== ZERO_ADDRESS_TOPIC || topics[2] !== walletTopic) continue;
            tokenIds = [topicUint(topics[3])].filter(Boolean);
        } else if (signature === MINT_TOPICS.ERC1155_SINGLE) {
            if (topics[2] !== ZERO_ADDRESS_TOPIC || topics[3] !== walletTopic) continue;
            const data = String(log.data || '').replace(/^0x/, '');
            if (data.length >= 128) {
                tokenIds = [topicUint(`0x${data.slice(0, 64)}`)].filter(Boolean);
                quantity = safeQuantity(`0x${data.slice(64, 128)}`);
            }
        } else if (signature === MINT_TOPICS.ERC1155_BATCH) {
            if (topics[2] !== ZERO_ADDRESS_TOPIC || topics[3] !== walletTopic) continue;
            try {
                const [ids, quantities] = decodeAbiParameters(
                    [{ type: 'uint256[]' }, { type: 'uint256[]' }],
                    log.data
                );
                tokenIds = (ids || []).slice(0, 20).map(String);
                quantity = safeQuantity((quantities || []).reduce((sum, value) => sum + value, 0n));
            } catch {
                tokenIds = [];
            }
        } else {
            continue;
        }

        const tokenId = tokenIds[0] || '';
        const collection = config.collection;
        return {
            valid: true,
            chain: 'base',
            chainId: Number(collection.chainId) || 8453,
            contract: config.address,
            tokenId,
            tokenIds,
            quantity,
            collectionName: String(collection.name || collection.slug || collectionSlug).slice(0, 100),
            imageUrl: String(collection.imageUrl || '').slice(0, 500),
            openseaUrl: tokenId
                ? `https://opensea.io/assets/base/${config.address}/${encodeURIComponent(tokenId)}`
                : String(collection.openseaUrl || '').slice(0, 500),
            blockNumber: receipt.blockNumber !== undefined ? String(receipt.blockNumber) : '',
            gas: receipt.gasUsed && receipt.effectiveGasPrice
                ? Number(formatEther(receipt.gasUsed * receipt.effectiveGasPrice))
                : 0
        };
    }

    return null;
}

/**
 * A receipt is sufficient wallet proof when the configured collection emitted
 * a standards-compliant mint (from the zero address) to that wallet.
 */
export function isMintReceiptForWallet(receipt, wallet, collectionSlug) {
    return Boolean(getMintDetailsFromReceipt(receipt, wallet, collectionSlug));
}

async function verifyMintTransaction(txHash, wallet, collectionSlug) {
    try {
        let receipt = null;

        // The browser already waited for confirmation, but the server RPC can
        // lag behind another provider briefly. Retry before rejecting the event.
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                receipt = await publicClient.getTransactionReceipt({ hash: txHash });
                break;
            } catch (error) {
                if (attempt === 2) {
                    console.warn(`Tx receipt not found for ${txHash} after retries`);
                    return false;
                }
                await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
            }
        }

        const details = getMintDetailsFromReceipt(receipt, wallet, collectionSlug);
        if (!details) return false;

        try {
            const block = await publicClient.getBlock(
                receipt.blockHash ? { blockHash: receipt.blockHash } : { blockNumber: receipt.blockNumber }
            );
            details.mintedAt = Number(block.timestamp) * 1000;
        } catch (error) {
            // Rich timestamp is optional; receipt proof remains authoritative.
            console.warn(`Block timestamp unavailable for ${txHash}:`, error?.message || error);
        }

        return details;
    } catch (error) {
        console.error('Verify tx failed:', error);
        return false; // Fail-closed: reject on verification errors
    }
}
