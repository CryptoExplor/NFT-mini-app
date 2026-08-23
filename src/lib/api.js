import {
    enqueueMintAnalytics,
    flushMintAnalyticsOutbox,
    getLastMintHistoryScan,
    getMintAnalyticsOutbox,
    markMintAnalyticsAttempt,
    markMintAnalyticsSynced,
    markMintHistoryScanned,
    seedOutboxFromHistoricalMints,
    seedOutboxFromLocalTransactions
} from './mintAnalyticsOutbox.js';
import { discoverHistoricalMints } from './mintHistoryDiscovery.js';

const API_BASE = import.meta.env.VITE_API_URL || '';
const ANALYTICS_DIRTY_KEY = 'analytics:last-mint-write';
const ANALYTICS_REFRESH_BUCKET_MS = 10_000;

function markAnalyticsDirty(wallet) {
    const timestamp = Date.now();
    try {
        sessionStorage.setItem(ANALYTICS_DIRTY_KEY, String(timestamp));
        if (wallet) {
            sessionStorage.setItem(`${ANALYTICS_DIRTY_KEY}:${String(wallet).toLowerCase()}`, String(timestamp));
        }
    } catch { /* storage is best effort */ }
    return timestamp;
}

function notifyMintAnalytics(wallet, detail = {}) {
    const updatedAt = markAnalyticsDirty(wallet);
    if (typeof document !== 'undefined' && typeof CustomEvent !== 'undefined') {
        document.dispatchEvent(new CustomEvent('mint:success', {
            detail: { ...detail, wallet, updatedAt }
        }));
    }
    return updatedAt;
}

function getAnalyticsDirtyTimestamp(wallet = null) {
    try {
        const walletValue = wallet
            ? sessionStorage.getItem(`${ANALYTICS_DIRTY_KEY}:${String(wallet).toLowerCase()}`)
            : null;
        const value = walletValue || sessionStorage.getItem(ANALYTICS_DIRTY_KEY);
        const timestamp = Number(value);
        // Do not keep fragmenting cache keys forever after a historical mint.
        return Number.isFinite(timestamp) && Date.now() - timestamp < 5 * 60_000
            ? timestamp
            : null;
    } catch {
        return null;
    }
}

function addAnalyticsFreshness(params, wallet = null) {
    params.set('_refresh', String(Math.floor(Date.now() / ANALYTICS_REFRESH_BUCKET_MS)));
    const dirtyAt = getAnalyticsDirtyTimestamp(wallet);
    if (dirtyAt) params.set('_mint', String(dirtyAt));
    return params;
}

// ── Client-side event dedup/throttle ───────────────────────────
// Prevents the same event from firing more than once per DEDUP_TTL.
// Critical events (mints, wallet connect) are NEVER deduplicated.
const DEDUP_TTL = 30_000; // 30 seconds
const _recentEvents = new Map();
const NEVER_DEDUP = new Set(['mint_success', 'mint_failure', 'mint_attempt', 'tx_sent', 'wallet_connect', 'battle_loadout_built', 'battle_started_v2', 'battle_result_v2', 'social_share', 'replay_conversion']);

function shouldThrottle(type, data) {
    if (NEVER_DEDUP.has(type)) return false;
    const key = `${type}:${data.page || data.collection || ''}`;
    const now = Date.now();
    const lastSent = _recentEvents.get(key);
    if (lastSent && (now - lastSent) < DEDUP_TTL) return true;
    _recentEvents.set(key, now);
    // Cleanup old entries periodically (keep map small)
    if (_recentEvents.size > 50) {
        for (const [k, t] of _recentEvents) {
            if (now - t > DEDUP_TTL) _recentEvents.delete(k);
        }
    }
    return false;
}

// Server-side rate limiting (HTTP 429) — stop hammering until Retry-After passes.
let _trackBackoffUntil = 0;

/**
 * Track a structured event to backend analytics
 *
 * IMPORTANT: /api/track requires a JWT for identity-only mutations such as
 * battles and social shares. Confirmed mints use their on-chain receipt as
 * wallet proof. When a session exists, requests still carry BOTH token forms:
 *  - `credentials: 'include'` so the HttpOnly `jwt` cookie is sent cross-origin
 *  - `Authorization: Bearer` as the fallback for browsers/webviews that block
 *    third-party cookies (Safari, in-app Farcaster webview), where the cookie
 *    alone silently produced 401s and dropped every mint/battle event.
 *
 * @param {string} type - Event type (page_view, mint_success, etc.)
 * @param {Object} data - Event metadata
 * @returns {Promise<{ok: boolean, status?: number, error?: string, skipped?: string}>}
 */
export async function trackEvent(type, data = {}, options = {}) {
    try {
        // Client-side dedup: skip if same event fired recently
        if (shouldThrottle(type, data)) return { ok: false, skipped: 'throttled' };

        // Generic backoff must never block confirmed on-chain mint writes
        if (type !== 'mint_success' && Date.now() < _trackBackoffUntil) {
            return { ok: false, skipped: 'backoff' };
        }

        // Enrich with client-side metadata
        const enriched = {
            type,
            ...data,
            device: getDeviceType(),
            referrer: getReferrer(),
            campaign: getCampaign()
        };

        const headers = { 'Content-Type': 'application/json' };
        const session = getAuthToken();
        if (session?.token) {
            headers.Authorization = `Bearer ${session.token}`;
        }

        const response = await fetch(`${API_BASE}/api/track`, {
            method: 'POST',
            headers,
            credentials: 'include',
            // Keep a confirmed mint write alive if the user immediately opens
            // Analytics or leaves the mint route.
            keepalive: type === 'mint_success',
            body: JSON.stringify(enriched)
        });

        const contentType = response.headers.get('content-type') || '';
        const payload = contentType.includes('application/json')
            ? await response.json().catch(() => ({}))
            : {};

        if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('Retry-After') || '10', 10);
            _trackBackoffUntil = Date.now() + (Number.isFinite(retryAfter) ? retryAfter : 10) * 1000;
            console.warn(`Track rate limited (${type}); backing off ${retryAfter}s`);
            return { ok: false, status: 429, error: payload?.error || 'Rate limited' };
        }

        if (!response.ok) {
            // Surface it instead of swallowing: a rejected event never reaches
            // the live feed or user profile.
            console.warn(`Track rejected (${type}): HTTP ${response.status}`, payload?.error || '');
            return { ok: false, status: response.status, error: payload?.error || `HTTP ${response.status}` };
        }

        if (type === 'mint_success') {
            if (options.suppressMintEvent) {
                markAnalyticsDirty(data.wallet);
            } else {
                notifyMintAnalytics(data.wallet, { ...data, duplicate: Boolean(payload?.duplicate) });
            }
        }

        return { ...payload, ok: true, status: response.status };
    } catch (error) {
        console.warn('trackEvent error:', error);
        return { ok: false, error: error?.message || 'network error' };
    }
}

async function sendMintAnalytics(payload, options = {}) {
    const retryDelays = options.retry === false ? [0] : [0, 1_000, 2_000];
    let result = { ok: false, error: 'Analytics write did not run' };

    for (let attempt = 0; attempt < retryDelays.length; attempt++) {
        if (retryDelays[attempt] > 0) {
            await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
        }

        result = await trackEvent('mint_success', payload, {
            suppressMintEvent: Boolean(options.suppressMintEvent)
        });
        if (result.ok) return result;

        const transient = !result.status || result.status === 400 || result.status === 408 || result.status === 425 || result.status === 429 || result.status >= 500;
        if (!transient) break;
    }

    return result;
}

/**
 * Track a successful mint. It is persisted to a browser outbox before the
 * network request, so closing the mini app or going offline cannot lose it.
 */
export async function trackMint(wallet, collection, txHash, price = 0, gas = 0) {
    const payload = { wallet, collection, txHash, price, gas, chainId: 8453 };
    enqueueMintAnalytics(payload);

    const result = await sendMintAnalytics(payload);
    if (result.ok) markMintAnalyticsSynced(txHash);
    else markMintAnalyticsAttempt(txHash, result);
    return result;
}

const reconciliationByWallet = new Map();

/**
 * Browser-triggered historical reconciliation — no cron or dedicated server.
 *
 * 1. Seeds transactions already saved in localStorage.
 * 2. Optionally discovers Base mint events through OpenSea.
 * 3. Replays a bounded persistent outbox through the receipt-verifying endpoint.
 */
export async function reconcileMintAnalytics(wallet, options = {}) {
    const normalizedWallet = String(wallet || '').toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(normalizedWallet)) {
        return { attempted: 0, synced: 0, failed: 0, pending: 0, discovered: 0, error: 'Invalid wallet' };
    }

    if (reconciliationByWallet.has(normalizedWallet)) {
        return reconciliationByWallet.get(normalizedWallet);
    }

    const task = (async () => {
        const locallySeeded = seedOutboxFromLocalTransactions(normalizedWallet);
        let discovered = 0;
        let discoveryError = null;
        const scanAge = Date.now() - getLastMintHistoryScan(normalizedWallet);
        const shouldDiscover = options.discover !== false && (options.force || scanAge > 6 * 60 * 60 * 1000);

        if (shouldDiscover) {
            try {
                const historicalMints = await discoverHistoricalMints(normalizedWallet, {
                    maxPages: options.maxPages || 3,
                    limit: options.discoveryLimit || 50
                });
                discovered = seedOutboxFromHistoricalMints(normalizedWallet, historicalMints);
                markMintHistoryScanned(normalizedWallet);
            } catch (error) {
                // OpenSea is an enhancement; local outbox reconciliation still works.
                discoveryError = error?.message || 'History discovery unavailable';
                console.warn('[Mint reconciliation] OpenSea discovery skipped:', discoveryError);
            }
        }

        const flushResult = await flushMintAnalyticsOutbox(
            normalizedWallet,
            (item) => sendMintAnalytics({
                wallet: item.wallet,
                collection: item.collection,
                txHash: item.txHash,
                price: item.price,
                gas: item.gas,
                metadata: {
                    reconciled: item.source !== 'confirmed-mint',
                    discoveredAt: item.discoveredAt,
                    source: item.source
                }
            }, { suppressMintEvent: true, retry: false }),
            { limit: options.limit || 8, force: Boolean(options.force) }
        );

        if (flushResult.synced > 0) {
            notifyMintAnalytics(normalizedWallet, {
                reconciled: true,
                count: flushResult.synced
            });
        }

        return {
            ...flushResult,
            discovered,
            locallySeeded,
            discoveryError,
            pending: getMintAnalyticsOutbox(normalizedWallet).length
        };
    })().finally(() => reconciliationByWallet.delete(normalizedWallet));

    reconciliationByWallet.set(normalizedWallet, task);
    return task;
}

/**
 * Track a page view
 */
export function trackPageView(page, wallet = null) {
    trackEvent('page_view', { page, wallet });
}

/**
 * Track collection view
 */
export function trackCollectionView(collection, wallet = null) {
    trackEvent('collection_view', { collection, wallet });
}

/**
 * Track wallet connection
 */
export function trackWalletConnect(wallet, metadata = null) {
    trackEvent('wallet_connect', { wallet, metadata });
}

/**
 * Track mint funnel step
 */
export function trackMintClick(wallet, collection) {
    trackEvent('mint_click', { wallet, collection });
}

/**
 * Track mint attempt (tx sent)
 */
export function trackMintAttempt(wallet, collection) {
    trackEvent('mint_attempt', { wallet, collection });
}

/**
 * Track tx sent
 */
export function trackTxSent(wallet, collection, txHash) {
    trackEvent('tx_sent', { wallet, collection, txHash });
}

/**
 * Track mint failure
 */
export function trackMintFailure(wallet, collection, reason = '') {
    trackEvent('mint_failure', { wallet, collection, metadata: { reason } });
}

/**
 * Track V2 battle loadout built (fighter + item + arena selected)
 */
export function trackBattleLoadout(wallet, loadout = {}) {
    trackEvent('battle_loadout_built', {
        wallet,
        metadata: {
            fighter: loadout.fighter?.collectionSlug || null,
            item: loadout.item?.collectionSlug || null,
            arena: loadout.arena?.collectionSlug || null,
            teamSize: loadout.teamSnapshot?.length || 0,
        }
    });
}

/**
 * Track V2 battle started (AI or PvP)
 */
export function trackBattleStarted(wallet, { isAi = true, challengeId = null, opponent = null } = {}) {
    trackEvent('battle_started_v2', {
        wallet,
        metadata: { isAi, challengeId, opponent }
    });
}

/**
 * Track V2 battle result
 */
export function trackBattleResult(wallet, { won = false, isAi = true, rounds = 0, opponent = null, battleId = null } = {}) {
    return trackEvent('battle_result_v2', {
        wallet,
        metadata: { won, isAi, rounds, opponent, battleId }
    });
}

/**
 * Track social share event
 */
export function trackShare(wallet, platform = 'farcaster', metadata = {}) {
    // `platform` must live inside metadata — the API only persists known fields,
    // so a top-level platform was silently discarded.
    return trackEvent('social_share', {
        wallet,
        platform,
        metadata: { ...metadata, platform }
    });
}

/**
 * Track conversion from a replay view to active gameplay
 */
export function trackReplayConversion(wallet, battleId, type = 'play_now') {
    trackEvent('replay_conversion', {
        wallet,
        metadata: { battleId, type }
    });
}

/**
 * Get global leaderboard and analytics
 * @param {Object} options - Query params (type, period, limit)
 */
export async function getLeaderboard(options = {}) {
    try {
        const params = new URLSearchParams({
            type: options.type || 'mints',
            period: options.period || 'all_time',
            limit: options.limit || 10
        });
        if (options.collection) {
            params.set('collection', options.collection);
        }
        if (options.viewer) {
            params.set('viewer', options.viewer);
        }
        if (options.surface) {
            params.set('surface', options.surface);
        }
        addAnalyticsFreshness(params, options.viewer || null);

        const response = await fetch(`${API_BASE}/api/leaderboard?${params}`, {
            cache: 'no-store'
        });

        // Check content type before parsing
        const contentType = response.headers.get("content-type");
        if (!response.ok || !contentType || !contentType.includes("application/json")) {
            console.warn(`Leaderboard API unavailable (status: ${response.status}, type: ${contentType})`);
            return {
                stats: {},
                funnel: [],
                overallConversion: '0.0',
                leaderboard: [],
                viewerRow: null,
                collections: [],
                recentActivity: [],
                socialProof: [],
                error: 'API_UNAVAILABLE'
            };
        }

        return await response.json();
    } catch (error) {
        console.error('Failed to fetch leaderboard:', error);
        return {
            stats: {},
            funnel: [],
            overallConversion: '0.0',
            leaderboard: [],
            viewerRow: null,
            collections: [],
            recentActivity: [],
            socialProof: [],
            error: 'API_ERROR'
        };
    }
}

/**
 * Get user stats (private - own wallet only)
 * @param {string} wallet - Wallet address
 */
export async function getUserStats(wallet) {
    if (!wallet) return null;
    try {
        const session = getAuthToken();
        const headers = session?.token ? { Authorization: `Bearer ${session.token}` } : {};
        const params = addAnalyticsFreshness(new URLSearchParams({ wallet }), wallet);
        const response = await fetch(`${API_BASE}/api/user?${params}`, {
            credentials: 'include',
            headers,
            cache: 'no-store'
        });

        // Check content type before parsing
        const contentType = response.headers.get("content-type");
        if (!response.ok || !contentType || !contentType.includes("application/json")) {
            console.warn(`User Stats API unavailable (status: ${response.status}, type: ${contentType})`);
            return { rank: '-', totalMints: 0, favCollection: '-', error: 'API_UNAVAILABLE' };
        }

        return await response.json();
    } catch (error) {
        console.error('Failed to fetch user stats:', error);
        return { rank: '-', totalMints: 0, favCollection: '-', error: 'API_ERROR' };
    }
}

/**
 * Get synced battle history for a wallet.
 * Public by design so battle profiles and replays can be shared across devices.
 */
export async function getBattleHistory(wallet, limit = 50) {
    if (!wallet) return [];
    try {
        const params = new URLSearchParams({
            address: wallet,
            limit: String(limit || 50)
        });

        const response = await fetch(`${API_BASE}/api/battle?action=history&${params}`);
        const contentType = response.headers.get('content-type') || '';

        if (!response.ok || !contentType.includes('application/json')) {
            console.warn(`Battle History API unavailable (status: ${response.status}, type: ${contentType})`);
            return [];
        }

        const data = await response.json();
        return Array.isArray(data?.history) ? data.history : [];
    } catch (error) {
        console.error('Failed to fetch battle history:', error);
        return [];
    }
}

/**
 * Get a single replay record by battle id.
 */
export async function getBattleReplay(battleId) {
    if (!battleId) throw new Error('Missing battleId');

    const params = new URLSearchParams({
        action: 'replay',
        id: battleId
    });

    const response = await fetch(`${API_BASE}/api/battle?${params}`);
    if (!response.ok) {
        throw new Error('Replay not found');
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        throw new Error('Replay response was not JSON');
    }

    return await response.json();
}

// ============================================
// CLIENT-SIDE HELPERS
// ============================================

function getDeviceType() {
    if (typeof window === 'undefined') return 'unknown';
    const ua = navigator.userAgent;
    if (/Mobi|Android/i.test(ua)) return 'mobile';
    if (/Tablet|iPad/i.test(ua)) return 'tablet';
    return 'desktop';
}

function getReferrer() {
    if (typeof document === 'undefined') return 'direct';
    const ref = document.referrer;
    if (!ref) return 'direct';
    if (ref.includes('warpcast.com') || ref.includes('farcaster')) return 'farcaster';
    if (ref.includes('twitter.com') || ref.includes('x.com')) return 'twitter';
    if (ref.includes('t.me') || ref.includes('telegram')) return 'telegram';
    return 'other';
}

function getCampaign() {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('utm_campaign') || params.get('ref') || null;
}

// ============================================
// AUTH (EIP-4361 SIWE)
// ============================================

let authSession = null;

/**
 * Store auth session info (call after successful verify)
 */
export function setAuthToken(sessionData) {
    authSession = sessionData;
    try { sessionStorage.setItem('auth_session', JSON.stringify(sessionData)); } catch { }
}

/**
 * Get stored auth session (auto-clears if expired)
 */
export function getAuthToken() {
    if (authSession) {
        if (isTokenExpired(authSession.expiresAt)) {
            clearAuthToken();
            return null;
        }
        return authSession;
    }
    try { 
        const stored = sessionStorage.getItem('auth_session');
        if (stored) authSession = JSON.parse(stored);
    } catch { }
    
    if (authSession && isTokenExpired(authSession.expiresAt)) {
        clearAuthToken();
        return null;
    }
    return authSession;
}

/**
 * Check if the session is expired
 */
function isTokenExpired(expiresAtMs) {
    if (!expiresAtMs) return true;
    // Expire 30s EARLY to avoid edge-case races. The previous form
    // (`Date.now() - 30_000`) did the opposite: it kept treating the token as
    // valid for 30s after it had already expired server-side.
    return expiresAtMs < (Date.now() + 30_000);
}

/**
 * Clear auth session (logout)
 */
export function clearAuthToken() {
    authSession = null;
    try { sessionStorage.removeItem('auth_session'); } catch { }
    // Optionally call logout endpoint to clear HttpOnly cookie
    fetch(`${API_BASE}/api/auth?action=logout`, { credentials: 'include' }).catch(() => {});
}

/**
 * Request a nonce for SIWE sign-in
 */
export async function getNonce(wallet) {
    const response = await fetch(`${API_BASE}/api/auth?action=nonce&address=${wallet}`);
    if (!response.ok) throw new Error('Failed to get nonce');
    return await response.json();
}

/**
 * Verify SIWE signature and get JWT
 */
export async function verifySignature(message, signature) {
    const response = await fetch(`${API_BASE}/api/auth?action=verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature }),
        credentials: 'include'
    });
    if (!response.ok) throw new Error('Verification failed');
    const data = await response.json();
    if (data.address) {
        // Assume 1 hour expiry (same as backend maxAge)
        data.expiresAt = Date.now() + 60 * 60 * 1000;
        setAuthToken(data);
    }
    return data;
}

/**
 * Get admin analytics data (requires admin wallet)
 */
export async function getAdminData(action = 'overview', target = null) {
    try {
        const params = new URLSearchParams({ action });
        if (target) params.set('target', target);
        const session = getAuthToken();

        // Verify auth session exists locally first
        if (!session) {
            return { error: 'Unauthorized', status: 401 };
        }

        const headers = {};
        if (session.token) {
            headers.Authorization = `Bearer ${session.token}`;
        }

        const response = await fetch(`${API_BASE}/api/admin?${params}`, { 
            credentials: 'include',
            headers,
        });
        const contentType = response.headers.get('content-type') || '';
        const payload = contentType.includes('application/json')
            ? await response.json()
            : null;

        if (!response.ok) {
            return {
                error: payload?.error || 'Admin request failed',
                status: response.status
            };
        }

        return payload;
    } catch (error) {
        console.error('Admin data error:', error);
        return {
            error: error?.message || 'Admin request failed',
            status: 0
        };
    }
}

/**
 * Download CSV export (admin only)
 */
export async function downloadCSV(type) {
    try {
        const session = getAuthToken();
        if (!session) {
            return { success: false, error: 'Unauthorized', status: 401 };
        }

        const headers = {};
        if (session.token) {
            headers.Authorization = `Bearer ${session.token}`;
        }

        const response = await fetch(`${API_BASE}/api/admin?action=export&type=${encodeURIComponent(type)}`, {
            credentials: 'include',
            headers,
        });

        if (!response.ok) {
            let errorMessage = 'Export failed';
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                const payload = await response.json();
                if (payload?.error) errorMessage = payload.error;
            }
            return { success: false, error: errorMessage, status: response.status };
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${type}-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        return { success: true };
    } catch (error) {
        console.error('Download error:', error);
        return {
            success: false,
            error: error?.message || 'Export failed',
            status: 0
        };
    }
}
