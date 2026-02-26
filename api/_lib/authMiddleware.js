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
        return {
            wallet: payload.wallet || payload.sub,
            isAdmin: payload.isAdmin || false
        };
    } catch {
        return null;
    }
}

/**
 * Extract and verify auth from request.
 * Supports: Bearer token in Authorization header
 * Fallback: wallet query param (backward compat, read-only)
 * 
 * @returns {{ wallet: string, isAdmin: boolean, authenticated: boolean }}
 */
export async function requireAuth(req) {
    // Try JWT first
    const authHeader = req.headers?.authorization;
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const decoded = await verifyJWT(token);
        if (decoded) {
            return { ...decoded, authenticated: true };
        }
    }

    // Fallback: wallet query param (unauthenticated, limited access)
    const wallet = req.query?.wallet || req.headers?.['x-wallet-address'];
    if (wallet && /^0x[a-fA-F0-9]{40}$/.test(wallet)) {
        return { wallet: wallet.toLowerCase(), isAdmin: false, authenticated: false };
    }

    return null;
}

/**
 * Require admin-level JWT authentication.
 * @returns {{ wallet: string, isAdmin: boolean }} or null
 */
export async function requireAdmin(req) {
    const auth = await requireAuth(req);
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
