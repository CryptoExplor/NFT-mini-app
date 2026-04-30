const API_BASE = import.meta.env.VITE_API_URL || '';

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

/**
 * Track a structured event to backend analytics
 * @param {string} type - Event type (page_view, mint_success, etc.)
 * @param {Object} data - Event metadata
 */
export async function trackEvent(type, data = {}) {
    try {
        // Client-side dedup: skip if same event fired recently
        if (shouldThrottle(type, data)) return;

        // Enrich with client-side metadata
        const enriched = {
            type,
            ...data,
            device: getDeviceType(),
            referrer: getReferrer(),
            campaign: getCampaign()
        };

        // Fire and forget (don't block UI)
        fetch(`${API_BASE}/api/track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(enriched)
        }).catch(err => console.warn('Track failed:', err));

    } catch (error) {
        console.warn('trackEvent error:', error);
    }
}

/**
 * Track a successful mint (convenience wrapper)
 */
export function trackMint(wallet, collection, txHash, price = 0, gas = 0) {
    trackEvent('mint_success', { wallet, collection, txHash, price, gas });
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
    trackEvent('battle_result_v2', {
        wallet,
        metadata: { won, isAi, rounds, opponent, battleId }
    });
}

/**
 * Track social share event
 */
export function trackShare(wallet, platform = 'farcaster', metadata = {}) {
    trackEvent('social_share', {
        wallet,
        platform,
        metadata
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

        // Allow relative paths in dev (e.g. vercel dev)
        // if (!API_BASE && import.meta.env.DEV) { ... }

        const response = await fetch(`${API_BASE}/api/leaderboard?${params}`);

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
        // Allow relative paths in dev
        // if (!API_BASE && import.meta.env.DEV) { ... }

        const response = await fetch(`${API_BASE}/api/user?wallet=${encodeURIComponent(wallet)}`);

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
    // 30s buffer to avoid edge-case races
    return expiresAtMs < (Date.now() - 30_000);
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

        const response = await fetch(`${API_BASE}/api/export?type=${type}`, {
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
