import { storage } from '../utils/storage.js';

const OUTBOX_KEY = 'mint_analytics_outbox_v1';
const SYNCED_KEY = 'mint_analytics_synced_v1';
const LOCAL_TRANSACTIONS_KEY = 'nft_transactions';
const SCAN_KEY_PREFIX = 'mint_history_scan_v1:';
const MAX_OUTBOX_ITEMS = 100;
const MAX_SYNCED_HASHES = 300;
const MAX_ITEM_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const HASH_RE = /^0x[a-fA-F0-9]{64}$/;
const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;
const BACKOFF_MS = [0, 30_000, 2 * 60_000, 10 * 60_000, 60 * 60_000];

function readList(key) {
    const value = storage.getJSON(key, []);
    return Array.isArray(value) ? value : [];
}

function normalizeItem(value, fallbackWallet = '') {
    const wallet = String(value?.wallet || fallbackWallet || '').toLowerCase();
    const txHash = String(value?.txHash || value?.hash || '').toLowerCase();
    const collection = String(value?.collection || value?.slug || '').trim().toLowerCase();
    const chainId = Number(value?.chainId || 8453);

    if (!WALLET_RE.test(wallet) || !HASH_RE.test(txHash) || !collection || chainId !== 8453) {
        return null;
    }

    const addedAt = Number(value?.addedAt || value?.timestamp || Date.now());
    return {
        wallet,
        collection,
        txHash,
        price: Number.isFinite(Number(value?.price)) ? Math.max(0, Number(value.price)) : 0,
        gas: Number.isFinite(Number(value?.gas)) ? Math.max(0, Number(value.gas)) : 0,
        chainId,
        source: String(value?.source || 'confirmed-mint').slice(0, 40),
        discoveredAt: Number(value?.discoveredAt || value?.timestamp || addedAt),
        addedAt,
        attempts: Math.max(0, Number(value?.attempts) || 0),
        lastAttemptAt: Math.max(0, Number(value?.lastAttemptAt) || 0),
        lastError: String(value?.lastError || '').slice(0, 160)
    };
}

function readSyncedHashes() {
    return new Set(readList(SYNCED_KEY).map((hash) => String(hash).toLowerCase()).filter((hash) => HASH_RE.test(hash)));
}

function writeOutbox(items) {
    const cutoff = Date.now() - MAX_ITEM_AGE_MS;
    const normalized = items
        .map((item) => normalizeItem(item))
        .filter((item) => item && item.addedAt >= cutoff)
        .sort((a, b) => a.discoveredAt - b.discoveredAt)
        .slice(-MAX_OUTBOX_ITEMS);
    storage.setJSON(OUTBOX_KEY, normalized);
    return normalized;
}

export function getMintAnalyticsOutbox(wallet = null) {
    const normalizedWallet = wallet ? String(wallet).toLowerCase() : null;
    const items = writeOutbox(readList(OUTBOX_KEY));
    return normalizedWallet ? items.filter((item) => item.wallet === normalizedWallet) : items;
}

export function enqueueMintAnalytics(value, fallbackWallet = '') {
    const item = normalizeItem(value, fallbackWallet);
    if (!item) return { queued: false, reason: 'invalid' };
    if (readSyncedHashes().has(item.txHash)) return { queued: false, reason: 'synced', item };

    const items = getMintAnalyticsOutbox();
    const existingIndex = items.findIndex((entry) => entry.txHash === item.txHash);
    if (existingIndex >= 0) {
        items[existingIndex] = {
            ...items[existingIndex],
            ...item,
            attempts: items[existingIndex].attempts,
            lastAttemptAt: items[existingIndex].lastAttemptAt,
            lastError: items[existingIndex].lastError,
            addedAt: Math.min(items[existingIndex].addedAt, item.addedAt)
        };
    } else {
        items.push(item);
    }
    writeOutbox(items);
    return { queued: true, item };
}

export function markMintAnalyticsAttempt(txHash, result = {}) {
    const normalizedHash = String(txHash || '').toLowerCase();
    const items = getMintAnalyticsOutbox();
    const item = items.find((entry) => entry.txHash === normalizedHash);
    if (!item) return;

    item.attempts += 1;
    item.lastAttemptAt = Date.now();
    item.lastError = String(result?.error || (result?.status ? `HTTP ${result.status}` : 'sync failed')).slice(0, 160);
    writeOutbox(items);
}

export function markMintAnalyticsSynced(txHash) {
    const normalizedHash = String(txHash || '').toLowerCase();
    if (!HASH_RE.test(normalizedHash)) return;

    writeOutbox(getMintAnalyticsOutbox().filter((item) => item.txHash !== normalizedHash));
    const synced = [normalizedHash, ...readSyncedHashes()].slice(0, MAX_SYNCED_HASHES);
    storage.setJSON(SYNCED_KEY, synced);
}

/** Seed historical transactions saved by this browser before analytics was fixed. */
export function seedOutboxFromLocalTransactions(wallet) {
    const normalizedWallet = String(wallet || '').toLowerCase();
    if (!WALLET_RE.test(normalizedWallet)) return 0;

    let seeded = 0;
    for (const tx of readList(LOCAL_TRANSACTIONS_KEY)) {
        if (tx?.wallet && String(tx.wallet).toLowerCase() !== normalizedWallet) continue;
        const result = enqueueMintAnalytics({
            wallet: normalizedWallet,
            collection: tx?.slug,
            txHash: tx?.hash,
            price: tx?.price || 0,
            chainId: tx?.chainId || 8453,
            timestamp: tx?.timestamp,
            source: 'local-history'
        });
        if (result.queued) seeded += 1;
    }
    return seeded;
}

/** Add on-chain/OpenSea discoveries to the same idempotent local queue. */
export function seedOutboxFromHistoricalMints(wallet, mints = []) {
    let seeded = 0;
    for (const mint of mints) {
        const result = enqueueMintAnalytics({
            ...mint,
            wallet,
            source: mint?.source || 'opensea-history'
        });
        if (result.queued) seeded += 1;
    }
    return seeded;
}

function canAttempt(item, force) {
    if (force || !item.lastAttemptAt) return true;
    const backoff = BACKOFF_MS[Math.min(item.attempts, BACKOFF_MS.length - 1)];
    return Date.now() - item.lastAttemptAt >= backoff;
}

/**
 * Flush a bounded batch. `send` is injected so this module stays independent
 * from the API client and is easy to test.
 */
export async function flushMintAnalyticsOutbox(wallet, send, options = {}) {
    const limit = Math.max(1, Math.min(Number(options.limit) || 8, 12));
    const force = Boolean(options.force);
    const candidates = getMintAnalyticsOutbox(wallet)
        .filter((item) => item.attempts < 8 && canAttempt(item, force))
        .slice(0, limit);

    let synced = 0;
    let failed = 0;
    for (const item of candidates) {
        let result;
        try {
            result = await send(item);
        } catch (error) {
            result = { ok: false, error: error?.message || 'network error' };
        }

        if (result?.ok) {
            markMintAnalyticsSynced(item.txHash);
            synced += 1;
        } else {
            markMintAnalyticsAttempt(item.txHash, result);
            failed += 1;
        }
    }

    return {
        attempted: candidates.length,
        synced,
        failed,
        pending: getMintAnalyticsOutbox(wallet).length
    };
}

export function getLastMintHistoryScan(wallet) {
    return Number(storage.getItem(`${SCAN_KEY_PREFIX}${String(wallet || '').toLowerCase()}`, '0')) || 0;
}

export function markMintHistoryScanned(wallet, timestamp = Date.now()) {
    storage.setItem(`${SCAN_KEY_PREFIX}${String(wallet || '').toLowerCase()}`, String(timestamp));
}

// Test/maintenance helper; not used by the product UI.
export function clearMintAnalyticsOutbox() {
    storage.removeItem(OUTBOX_KEY);
    storage.removeItem(SYNCED_KEY);
}
