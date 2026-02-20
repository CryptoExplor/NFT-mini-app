const API_BASE = import.meta.env.VITE_API_URL || '';

// ── Client-side event dedup/throttle ───────────────────────────
// Prevents the same event from firing more than once per DEDUP_TTL.
// Critical events (mints, wallet connect) are NEVER deduplicated.
const DEDUP_TTL = 30_000; // 30 seconds
const _recentEvents = new Map();
const NEVER_DEDUP = new Set(['mint_success', 'mint_failure', 'mint_attempt', 'tx_sent', 'wallet_connect']);

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

        const response = await fetch(`${API_BASE}/api/user?wallet=${wallet}`);

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

let authToken = null;

/**
 * Store auth token (call after successful verify)
 */
export function setAuthToken(token) {
    authToken = token;
    try { sessionStorage.setItem('auth_token', token); } catch { }
}

/**
 * Get stored auth token
 */
export function getAuthToken() {
    if (authToken) return authToken;
    try { authToken = sessionStorage.getItem('auth_token'); } catch { }
    return authToken;
}

/**
 * Clear auth token (logout)
 */
export function clearAuthToken() {
    authToken = null;
    try { sessionStorage.removeItem('auth_token'); } catch { }
}

/**
 * Request a nonce for SIWE sign-in
 */
export async function getNonce(wallet) {
    const response = await fetch(`${API_BASE}/api/auth/nonce?wallet=${wallet}`);
    if (!response.ok) throw new Error('Failed to get nonce');
    return await response.json();
}

/**
 * Verify SIWE signature and get JWT
 */
export async function verifySignature(message, signature) {
    const response = await fetch(`${API_BASE}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature })
    });
    if (!response.ok) throw new Error('Verification failed');
    const data = await response.json();
    if (data.token) setAuthToken(data.token);
    return data;
}

/**
 * Get admin analytics data (requires admin wallet)
 */
export async function getAdminData(action = 'overview', target = null) {
    try {
        const params = new URLSearchParams({ action });
        if (target) params.set('target', target);

        const headers = {};
        const token = getAuthToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${API_BASE}/api/admin?${params}`, { headers });
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
        const token = getAuthToken();
        if (!token) {
            return { success: false, error: 'Unauthorized', status: 401 };
        }

        const response = await fetch(`${API_BASE}/api/export?type=${type}`, {
            headers: { 'Authorization': `Bearer ${token}` }
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
