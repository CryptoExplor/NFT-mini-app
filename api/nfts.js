/**
 * OpenSea proxy
 * GET /api/nfts?path=<opensea-v2-path>&<query>
 *
 * Why this exists: the browser used to call api.opensea.io directly with
 * `VITE_OPENSEA_API_KEY`. Every `VITE_*` value is inlined into the client
 * bundle at build time, so that key was published to anyone who opened
 * DevTools. This route keeps the key server-side (`OPENSEA_API_KEY`) and only
 * forwards a strict allowlist of read-only paths.
 *
 * Allowed paths (OpenSea API v2, read-only):
 *   chain/{chain}/account/{address}/nfts
 *   chain/{chain}/contract/{address}/nfts/{tokenId}
 *   chain/{chain}/contract/{address}/nfts
 */

import { setCors } from './_lib/cors.js';
import { kv } from './_lib/kv.js';
import { checkRateLimit, RateLimitError } from './_lib/events.js';

const OPENSEA_BASE = 'https://api.opensea.io/api/v2';
const ALLOWED_CHAINS = new Set(['ethereum', 'base', 'base_sepolia']);
const ALLOWED_QUERY_PARAMS = new Set(['limit', 'next', 'collection']);
const MAX_LIMIT = 200;
const UPSTREAM_TIMEOUT_MS = 12_000;

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const TOKEN_ID_RE = /^[A-Za-z0-9_-]{1,78}$/;

/**
 * Validate the requested path against the allowlist.
 * @returns {{ ok: true, path: string } | { ok: false, error: string }}
 */
export function resolveOpenSeaPath(rawPath) {
    if (typeof rawPath !== 'string' || rawPath.length === 0 || rawPath.length > 200) {
        return { ok: false, error: 'path is required' };
    }
    // No traversal, no absolute URLs, no query smuggling.
    if (rawPath.includes('..') || rawPath.includes('//') || rawPath.includes('?') || rawPath.includes('#')) {
        return { ok: false, error: 'Invalid path' };
    }

    const parts = rawPath.replace(/^\/+|\/+$/g, '').split('/');

    if (parts[0] !== 'chain' || !ALLOWED_CHAINS.has(parts[1])) {
        return { ok: false, error: 'Unsupported chain' };
    }

    // chain/{chain}/account/{address}/nfts
    if (parts.length === 5 && parts[2] === 'account' && parts[4] === 'nfts') {
        if (!ADDRESS_RE.test(parts[3])) return { ok: false, error: 'Invalid address' };
        return { ok: true, path: `chain/${parts[1]}/account/${parts[3].toLowerCase()}/nfts` };
    }

    // chain/{chain}/contract/{address}/nfts
    if (parts.length === 5 && parts[2] === 'contract' && parts[4] === 'nfts') {
        if (!ADDRESS_RE.test(parts[3])) return { ok: false, error: 'Invalid contract address' };
        return { ok: true, path: `chain/${parts[1]}/contract/${parts[3].toLowerCase()}/nfts` };
    }

    // chain/{chain}/contract/{address}/nfts/{tokenId}
    if (parts.length === 6 && parts[2] === 'contract' && parts[4] === 'nfts') {
        if (!ADDRESS_RE.test(parts[3])) return { ok: false, error: 'Invalid contract address' };
        if (!TOKEN_ID_RE.test(parts[5])) return { ok: false, error: 'Invalid token id' };
        return { ok: true, path: `chain/${parts[1]}/contract/${parts[3].toLowerCase()}/nfts/${parts[5]}` };
    }

    return { ok: false, error: 'Path not allowed' };
}

/** Copy only the query params OpenSea actually needs. */
export function buildUpstreamQuery(query) {
    const params = new URLSearchParams();

    for (const key of ALLOWED_QUERY_PARAMS) {
        const value = query?.[key];
        if (value === undefined || value === null || value === '') continue;

        const single = Array.isArray(value) ? value[0] : value;
        if (typeof single !== 'string' && typeof single !== 'number') continue;

        if (key === 'limit') {
            const limit = Math.max(1, Math.min(parseInt(single, 10) || 50, MAX_LIMIT));
            params.set('limit', String(limit));
            continue;
        }

        params.set(key, String(single).slice(0, 400));
    }

    return params;
}

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0].trim();
    return req.headers['x-real-ip'] || 'unknown_ip';
}

export default async function handler(req, res) {
    setCors(req, res, { methods: 'GET,OPTIONS', headers: 'Content-Type' });
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const resolved = resolveOpenSeaPath(req.query?.path);
    if (!resolved.ok) {
        return res.status(400).json({ error: resolved.error });
    }

    const apiKey = process.env.OPENSEA_API_KEY || process.env.VITE_OPENSEA_API_KEY || '';

    try {
        await checkRateLimit(kv, getClientIp(req), 'opensea_proxy', 120, 60);
    } catch (error) {
        if (error instanceof RateLimitError || error?.code === 'RATE_LIMITED') {
            res.setHeader('Retry-After', String(error.retryAfter || 60));
            return res.status(429).json({ error: 'Rate limit exceeded' });
        }
        // A KV outage must not take NFT browsing down with it.
        console.warn('[OpenSea proxy] Rate limit check failed:', error?.message);
    }

    const query = buildUpstreamQuery(req.query);
    const url = `${OPENSEA_BASE}/${resolved.path}${query.toString() ? `?${query}` : ''}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    try {
        const upstream = await fetch(url, {
            headers: {
                Accept: 'application/json',
                ...(apiKey ? { 'X-API-KEY': apiKey } : {})
            },
            signal: controller.signal
        });

        if (upstream.status === 429) {
            res.setHeader('Retry-After', upstream.headers.get('retry-after') || '5');
            return res.status(429).json({ error: 'OpenSea rate limited' });
        }

        if (!upstream.ok) {
            return res.status(upstream.status === 404 ? 404 : 502).json({
                error: `OpenSea responded ${upstream.status}`
            });
        }

        const data = await upstream.json();

        // Short shared cache: NFT ownership changes slowly, and this collapses
        // bursts from many clients into a single upstream call.
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
        return res.status(200).json(data);
    } catch (error) {
        if (error?.name === 'AbortError') {
            return res.status(504).json({ error: 'OpenSea request timed out' });
        }
        console.error('[OpenSea proxy] Request failed:', error?.message || error);
        return res.status(502).json({ error: 'Failed to reach OpenSea' });
    } finally {
        clearTimeout(timeout);
    }
}
