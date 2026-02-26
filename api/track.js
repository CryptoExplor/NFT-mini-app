import { kv } from '@vercel/kv';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { setCors } from './lib/cors.js';
import {
    VALID_EVENTS,
    processEvent,
    checkRateLimit,
    cleanupExpiredKeys
} from './lib/events.js';

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
            metadata
        } = req.body;

        if (!type || !VALID_EVENTS.includes(type)) {
            return res.status(400).json({ error: `Invalid event type. Valid: ${VALID_EVENTS.join(', ')}` });
        }

        const normalizedWallet = (wallet && wallet !== 'anonymous')
            ? String(wallet).toLowerCase()
            : wallet;

        const timestamp = Date.now();

        // ── Rate limiting ──
        const clientIp = req.headers['x-forwarded-for'] || 'unknown_ip';
        const rateLimitKey = (normalizedWallet && normalizedWallet !== 'anonymous') ? normalizedWallet : clientIp;
        await checkRateLimit(kv, rateLimitKey, type);

        // ── Occasional cleanup (1% chance) ──
        if (Math.random() < 0.01) {
            cleanupExpiredKeys(kv).catch(console.error);
        }

        // ── Build event payload ──
        const event = {
            type,
            wallet: normalizedWallet || 'anonymous',
            collection: collection || null,
            txHash: txHash || null,
            price: price || 0,
            gas: gas || 0,
            referrer: referrer || 'direct',
            campaign: campaign || null,
            device: device || 'unknown',
            page: page || null,
            metadata: metadata || {},
            timestamp
        };

        // ── Delegate to centralized event processor ──
        const result = await processEvent(kv, event, {
            verifyMintTransaction: (hash, w) => verifyMintTransaction(hash, w)
        });

        if (!result.success) {
            return res.status(400).json({ error: result.error || 'Event processing failed' });
        }

        return res.status(200).json({ success: true, eventId: result.eventId });

    } catch (error) {
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
            return true; // Soft fail
        }

        if (receipt.status !== 'success') return false;
        if (receipt.from.toLowerCase() !== wallet.toLowerCase()) return false;

        const TOPICS = {
            ERC721_TRANSFER: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
            ERC1155_SINGLE: '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62',
            ERC1155_BATCH: '0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb'
        };

        const walletPad = wallet.toLowerCase().replace('0x', '0x000000000000000000000000');

        return receipt.logs.some(log => {
            const t0 = log.topics[0];
            if (t0 === TOPICS.ERC721_TRANSFER) return log.topics[2]?.toLowerCase() === walletPad;
            if (t0 === TOPICS.ERC1155_SINGLE) return log.topics[3]?.toLowerCase() === walletPad;
            if (t0 === TOPICS.ERC1155_BATCH) return log.topics[3]?.toLowerCase() === walletPad;
            return false;
        });
    } catch (e) {
        console.error('Verify tx failed:', e);
        return true; // Fail open
    }
}
