import { jwtVerify } from 'jose';

/**
 * Verify a JWT token and return decoded payload.
 * @returns {{ wallet: string, isAdmin: boolean }} or null
 */
export async function verifyJWT(token) {
    try {
        if (!process.env.JWT_SECRET) {
            console.error('JWT_SECRET environment variable is not configured — refusing to verify tokens');
            return null;
        }
        const secret = new TextEncoder().encode(process.env.JWT_SECRET);
        const { payload } = await jwtVerify(token, secret);
        const wallet = String(payload.sub || payload.address || payload.wallet || '').toLowerCase();
        if (!/^0x[a-f0-9]{40}$/i.test(wallet)) {
            return null;
        }
        return {
            wallet,
            isAdmin: payload.isAdmin || false
        };
    } catch {
        return null;
    }
}

/**
 * Verify auth from request for battle API endpoints.
 * Returns a standardized { valid, address, error } shape.
 *
 * @param {Object} req - HTTP request
 * @returns {Promise<{ valid: boolean, address?: string, error?: string }>}
 */
export async function verifyAuth(req) {
    const authHeader = req.headers?.authorization;
    let token = null;

    // 1. Try Cookie
    const cookieHeader = req.headers?.cookie || '';
    const cookieMatch = cookieHeader.match(/(?:^|;)\s*jwt=([^;]+)/);
    if (cookieMatch) {
        token = cookieMatch[1];
    }
    
    // 2. Fallback to Authorization header
    if (!token && authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7);
    }

    if (!token) {
        return { valid: false, error: 'Missing or invalid Authentication' };
    }

    const decoded = await verifyJWT(token);

    if (!decoded) {
        return { valid: false, error: 'Invalid or expired token' };
    }

    return { valid: true, address: decoded.wallet };
}

/**
 * Extract and verify auth from request.
 * Supports: Bearer token in Authorization header
 * Optional fallback: wallet query param (unauthenticated, limited access)
 *
 * @returns {{ wallet: string, isAdmin: boolean, authenticated: boolean }}
 */
export async function getAuthContext(req, { allowQueryFallback = false } = {}) {
    // Try JWT first
    const authHeader = req.headers?.authorization;
    let token = null;

    // 1. Try Cookie
    const cookieHeader = req.headers?.cookie || '';
    const cookieMatch = cookieHeader.match(/(?:^|;)\s*jwt=([^;]+)/);
    if (cookieMatch) {
        token = cookieMatch[1];
    }

    // 2. Fallback to Authorization header
    if (!token && authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7);
    }

    if (token) {
        const decoded = await verifyJWT(token);
        if (decoded) {
            return {
                wallet: decoded.wallet,
                isAdmin: decoded.isAdmin,
                authenticated: true
            };
        }
    } 
    
    if (!allowQueryFallback) {
        return null;
    }

    // Fallback: wallet query param (unauthenticated, limited access)
    const wallet = req.query?.wallet || req.headers?.['x-wallet-address'];
    if (wallet && /^0x[a-fA-F0-9]{40}$/.test(wallet)) {
        return { wallet: wallet.toLowerCase(), isAdmin: false, authenticated: false };
    }

    return null;
}

/** @deprecated Use getAuthContext instead */
export const requireAuth = getAuthContext;

/**
 * Require admin-level JWT authentication.
 * @returns {{ wallet: string, isAdmin: boolean }} or null
 */
export async function requireAdmin(req) {
    const auth = await getAuthContext(req);
    if (!auth || !auth.authenticated) return null;

    // Check JWT claims
    if (auth.isAdmin) return auth;

    // Double-check against env
    const adminList = (process.env.ADMIN_WALLETS || '')
        .split(',')
        .map(w => w.trim().toLowerCase())
        .filter(Boolean);

    if (adminList.includes(auth.wallet)) {
        return { ...auth, isAdmin: true };
    }

    return null;
}
