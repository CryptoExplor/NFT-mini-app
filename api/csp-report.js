/**
 * CSP violation collector
 * POST /api/csp-report
 *
 * The stricter policy ships as `Content-Security-Policy-Report-Only`, which is
 * only useful if the reports land somewhere. Browsers send them here as
 * `application/csp-report` (CSP2) or `application/reports+json` (Reporting API).
 *
 * Reports are aggregated in KV as counters per (directive, blocked-origin) so a
 * misbehaving third party shows up immediately without unbounded log noise:
 *
 *   GET /api/csp-report            → 405
 *   GET /api/admin?action=csp      → aggregated view (admin only)
 */

import { setCors } from './_lib/cors.js';
import { kv } from './_lib/kv.js';
import { checkRateLimit, RateLimitError } from './_lib/events.js';

const COUNTER_KEY = 'csp:violations';
const SAMPLE_KEY = 'csp:samples';
const RETENTION_SECONDS = 14 * 24 * 60 * 60;
const MAX_SAMPLES = 50;
const MAX_BODY_BYTES = 16_384;

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0].trim();
    return req.headers['x-real-ip'] || 'unknown_ip';
}

/** Reduce a URL to scheme+host so counters stay bounded. */
export function toOrigin(value) {
    const raw = String(value || '').trim();
    if (!raw) return 'unknown';
    // Keyword sources are reported verbatim by browsers.
    if (['inline', 'eval', 'self', 'data', 'blob', 'wasm-eval'].includes(raw)) return raw;

    try {
        const url = new URL(raw);
        return `${url.protocol}//${url.host}` || 'unknown';
    } catch {
        return raw.slice(0, 80);
    }
}

/**
 * Normalise both report shapes into `{ directive, blockedOrigin, documentUri }`.
 */
export function normalizeReports(body) {
    if (!body) return [];

    // Reporting API: [{ type: 'csp-violation', body: {...} }]
    // A malformed array (nulls, strings) must not throw — this endpoint is
    // unauthenticated and receives whatever a browser or a scanner sends.
    const entries = Array.isArray(body)
        ? body
            .filter((entry) => entry && typeof entry === 'object')
            .filter((entry) => !entry.type || entry.type === 'csp-violation')
            .map((entry) => entry.body || entry)
        // CSP2: { 'csp-report': {...} }
        : [body['csp-report'] || body];

    return entries
        .filter((entry) => entry && typeof entry === 'object')
        // An entry with neither a directive nor a blocked URL carries no
        // information — dropping it keeps the counters meaningful.
        .filter((entry) => Boolean(
            entry.effectiveDirective || entry['effective-directive'] ||
            entry.violatedDirective || entry['violated-directive'] ||
            entry.blockedURL || entry['blocked-uri']
        ))
        .map((entry) => ({
            directive: String(
                entry.effectiveDirective || entry['effective-directive'] ||
                entry.violatedDirective || entry['violated-directive'] || 'unknown'
            ).split(' ')[0].slice(0, 40),
            blockedOrigin: toOrigin(entry.blockedURL || entry['blocked-uri']),
            documentUri: toOrigin(entry.documentURL || entry['document-uri'])
        }))
        .slice(0, 10);
}

export default async function handler(req, res) {
    setCors(req, res, {
        methods: 'POST,OPTIONS',
        headers: 'Content-Type, application/csp-report, application/reports+json'
    });
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        // Violation reports are unauthenticated by definition — keep them cheap.
        await checkRateLimit(kv, getClientIp(req), 'csp_report', 60, 60);
    } catch (error) {
        if (error instanceof RateLimitError || error?.code === 'RATE_LIMITED') {
            // Never make the browser retry a report.
            return res.status(204).end();
        }
    }

    try {
        let body = req.body;
        if (typeof body === 'string') {
            if (body.length > MAX_BODY_BYTES) return res.status(204).end();
            try { body = JSON.parse(body); } catch { return res.status(204).end(); }
        }

        const reports = normalizeReports(body);
        if (reports.length === 0) return res.status(204).end();

        const pipe = kv.pipeline();
        for (const report of reports) {
            pipe.hincrby(COUNTER_KEY, `${report.directive}|${report.blockedOrigin}`, 1);
        }
        pipe.expire(COUNTER_KEY, RETENTION_SECONDS);

        // Keep a small rolling sample for context (which page, when).
        pipe.lpush(SAMPLE_KEY, JSON.stringify({ ...reports[0], timestamp: Date.now() }));
        pipe.ltrim(SAMPLE_KEY, 0, MAX_SAMPLES - 1);
        pipe.expire(SAMPLE_KEY, RETENTION_SECONDS);

        await pipe.exec();
    } catch (error) {
        console.warn('[CSP] Failed to record report:', error?.message);
    }

    // Always 204: a failing collector must never surface in the browser console.
    return res.status(204).end();
}
