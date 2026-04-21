/**
 * Tests for CORS origin allowlist enforcement.
 *
 * Run with: node --test api/_lib/cors.test.js
 *
 * These tests verify that:
 *  - Allowed origins are echoed back (required for credentialed requests)
 *  - Arbitrary / attacker-controlled origins are NOT echoed back
 *  - The Vary: Origin header is always set
 *  - Access-Control-Allow-Credentials is always true
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setCors, withCors } from './cors.js';

const PRODUCTION_ORIGIN = 'https://base-mintapp.vercel.app';

/** Minimal mock of a Vercel/Express response object */
function mockRes() {
    const headers = {};
    return {
        headers,
        setHeader(key, value) { headers[key] = value; },
        status(code) { this._status = code; return this; },
        end() { return this; },
        json(body) { this._body = body; return this; },
    };
}

/** Minimal mock of a request object */
function mockReq(origin, method = 'GET') {
    return { headers: { origin }, method };
}

describe('setCors — origin allowlist', () => {
    test('echoes production origin when request comes from production', () => {
        const req = mockReq(PRODUCTION_ORIGIN);
        const res = mockRes();
        setCors(req, res);
        assert.equal(res.headers['Access-Control-Allow-Origin'], PRODUCTION_ORIGIN);
    });

    test('echoes localhost:5173 (Vite dev server)', () => {
        const req = mockReq('http://localhost:5173');
        const res = mockRes();
        setCors(req, res);
        assert.equal(res.headers['Access-Control-Allow-Origin'], 'http://localhost:5173');
    });

    test('echoes localhost:3000', () => {
        const req = mockReq('http://localhost:3000');
        const res = mockRes();
        setCors(req, res);
        assert.equal(res.headers['Access-Control-Allow-Origin'], 'http://localhost:3000');
    });

    test('echoes localhost:4173 (Vite preview)', () => {
        const req = mockReq('http://localhost:4173');
        const res = mockRes();
        setCors(req, res);
        assert.equal(res.headers['Access-Control-Allow-Origin'], 'http://localhost:4173');
    });

    test('does NOT echo an arbitrary attacker-controlled origin', () => {
        const req = mockReq('https://evil.example.com');
        const res = mockRes();
        setCors(req, res);
        // Must fall back to production origin, not reflect the attacker's origin
        assert.equal(res.headers['Access-Control-Allow-Origin'], PRODUCTION_ORIGIN);
        assert.notEqual(res.headers['Access-Control-Allow-Origin'], 'https://evil.example.com');
    });

    test('does NOT echo an origin that merely starts with "http"', () => {
        const req = mockReq('http://attacker.io/steal');
        const res = mockRes();
        setCors(req, res);
        assert.equal(res.headers['Access-Control-Allow-Origin'], PRODUCTION_ORIGIN);
    });

    test('does NOT echo a null origin', () => {
        const req = mockReq('null');
        const res = mockRes();
        setCors(req, res);
        assert.equal(res.headers['Access-Control-Allow-Origin'], PRODUCTION_ORIGIN);
    });

    test('handles missing origin header gracefully', () => {
        const req = mockReq(undefined);
        const res = mockRes();
        setCors(req, res);
        assert.equal(res.headers['Access-Control-Allow-Origin'], PRODUCTION_ORIGIN);
    });

    test('handles array origin header (proxy artefact) gracefully', () => {
        // Some proxies forward Origin as an array; we should not reflect it
        const req = { headers: { origin: ['https://evil.example.com', PRODUCTION_ORIGIN] }, method: 'GET' };
        const res = mockRes();
        setCors(req, res);
        // An array is not a string, so it won't match the Set — falls back to production
        assert.equal(res.headers['Access-Control-Allow-Origin'], PRODUCTION_ORIGIN);
    });
});

describe('setCors — invariant headers', () => {
    test('always sets Vary: Origin', () => {
        const res = mockRes();
        setCors(mockReq(PRODUCTION_ORIGIN), res);
        assert.equal(res.headers['Vary'], 'Origin');
    });

    test('always sets Access-Control-Allow-Credentials: true', () => {
        const res = mockRes();
        setCors(mockReq('https://evil.example.com'), res);
        assert.equal(res.headers['Access-Control-Allow-Credentials'], 'true');
    });

    test('respects caller-supplied methods option', () => {
        const res = mockRes();
        setCors(mockReq(PRODUCTION_ORIGIN), res, { methods: 'GET,POST,DELETE' });
        assert.equal(res.headers['Access-Control-Allow-Methods'], 'GET,POST,DELETE');
    });

    test('ignores caller-supplied origin if it is not on the allowlist', () => {
        const res = mockRes();
        // Caller tries to force an arbitrary origin — must be rejected
        setCors(mockReq(PRODUCTION_ORIGIN), res, { origin: 'https://evil.example.com' });
        assert.equal(res.headers['Access-Control-Allow-Origin'], PRODUCTION_ORIGIN);
    });

    test('accepts caller-supplied origin when it is on the allowlist', () => {
        const res = mockRes();
        setCors(mockReq(PRODUCTION_ORIGIN), res, { origin: 'http://localhost:5173' });
        assert.equal(res.headers['Access-Control-Allow-Origin'], 'http://localhost:5173');
    });
});

describe('withCors — preflight handling', () => {
    test('returns 204 for OPTIONS preflight without calling handler', async () => {
        let handlerCalled = false;
        const wrapped = withCors(async (_req, _res) => { handlerCalled = true; });

        const req = mockReq(PRODUCTION_ORIGIN, 'OPTIONS');
        const res = mockRes();
        await wrapped(req, res);

        assert.equal(handlerCalled, false);
        assert.equal(res._status, 204);
    });

    test('calls handler for non-OPTIONS requests', async () => {
        let handlerCalled = false;
        const wrapped = withCors(async (_req, res) => {
            handlerCalled = true;
            res.status(200).json({ ok: true });
        });

        const req = mockReq(PRODUCTION_ORIGIN, 'GET');
        const res = mockRes();
        await wrapped(req, res);

        assert.equal(handlerCalled, true);
    });

    test('sets CORS headers on non-OPTIONS requests too', async () => {
        const wrapped = withCors(async (_req, res) => res.status(200).json({}));
        const req = mockReq('https://evil.example.com', 'POST');
        const res = mockRes();
        await wrapped(req, res);

        assert.equal(res.headers['Access-Control-Allow-Origin'], PRODUCTION_ORIGIN);
        assert.notEqual(res.headers['Access-Control-Allow-Origin'], 'https://evil.example.com');
    });
});
