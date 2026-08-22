/**
 * Leaderboard API regression tests.
 *
 * Run: node --test --experimental-test-module-mocks api/leaderboard.test.js
 *
 * The KV module is mocked so these run without credentials. Focus is the
 * key-resolution fix: weekly boards are written as
 * `leaderboard:<type>:week:<ISO week>` but were read as
 * `leaderboard:<type>:<period>`, so `?period=week` was always empty — while
 * legacy/all-time data must keep rendering.
 */

import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { getWeekNumber } from './_lib/events.js';

const WEEK = getWeekNumber(new Date());
const WALLET_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const WALLET_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

/** Builds a kv double whose zsets are seeded from a { key: [member, score] } map. */
function makeKv(zsets = {}, extras = {}) {
    const reads = [];

    const zrange = (key) => {
        reads.push(key);
        const rows = zsets[key] || [];
        return rows.flatMap(([member, score]) => [member, String(score)]);
    };
    const zcard = (key) => (zsets[key] || []).length;

    const handlers = {
        zrange: (key) => zrange(key),
        zcard: (key) => zcard(key),
        hgetall: (key) => extras[key] || null,
        hget: (key, field) => extras[key]?.[field] ?? null,
        lrange: (key) => extras[key] || [],
        scard: (key) => extras[key] || 0,
        get: (key) => extras[key] ?? null,
        set: () => 'OK',
        zrevrank: () => null,
        zscore: () => null
    };

    const kv = { _reads: reads };
    for (const [name, fn] of Object.entries(handlers)) {
        kv[name] = async (...args) => fn(...args);
    }
    kv.pipeline = () => {
        const queued = [];
        const api = {};
        for (const [name, fn] of Object.entries(handlers)) {
            api[name] = (...args) => {
                queued.push(() => fn(...args));
                return api;
            };
        }
        api.exec = async () => queued.map((run) => run());
        return api;
    };
    return kv;
}

function makeRes() {
    const res = {
        statusCode: 200,
        headers: {},
        body: null,
        setHeader(k, v) { this.headers[k] = v; },
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
        end() { return this; }
    };
    return res;
}

async function loadHandler(kv) {
    mock.module('./_lib/kv.js', { namedExports: { kv } });
    mock.module('../src/lib/loadCollections.js', { namedExports: { loadCollections: () => [] } });
    const mod = await import(`./leaderboard.js?t=${Math.random()}`);
    return mod.default;
}

test('period=week reads the ISO-week key that the writers actually use', async (t) => {
    t.after(() => mock.reset());

    const kv = makeKv({
        [`leaderboard:battle_wins:week:${WEEK}`]: [[WALLET_A, 7]],
        'leaderboard:battle_wins:all_time': [[WALLET_B, 99]]
    });

    const handler = await loadHandler(kv);
    const res = makeRes();
    await handler(
        { method: 'GET', headers: {}, query: { type: 'battle_wins', period: 'week', surface: 'competition' } },
        res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.leaderboard[0].wallet, WALLET_A);
    assert.equal(res.body.leaderboard[0].score, 7);
});

test('falls back to all-time so historical data still renders when a week is empty', async (t) => {
    t.after(() => mock.reset());

    const kv = makeKv({
        'leaderboard:battle_wins:all_time': [[WALLET_B, 42]]
    });

    const handler = await loadHandler(kv);
    const res = makeRes();
    await handler(
        { method: 'GET', headers: {}, query: { type: 'battle_wins', period: 'week', surface: 'competition' } },
        res
    );

    assert.equal(res.body.leaderboard.length, 1);
    assert.equal(res.body.leaderboard[0].wallet, WALLET_B);
    assert.equal(res.body.leaderboard[0].score, 42);
});

test('all_time still resolves to the legacy key untouched', async (t) => {
    t.after(() => mock.reset());

    const kv = makeKv({ 'leaderboard:mints:all_time': [[WALLET_A, 3]] });

    const handler = await loadHandler(kv);
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: { type: 'mints' } }, res);

    assert.equal(res.body.leaderboard[0].score, 3);
    assert.ok(kv._reads.includes('leaderboard:mints:all_time'));
});

test('funnel is ordered by the real user path and flagged as event counts', async (t) => {
    t.after(() => mock.reset());

    const kv = makeKv({}, {
        'funnel:mint': {
            page_view: '100',
            collection_view: '80',
            wallet_connect: '40',
            mint_click: '20',
            tx_sent: '10',
            mint_success: '5'
        }
    });

    const handler = await loadHandler(kv);
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: { type: 'mints' } }, res);

    const steps = res.body.funnel.map((s) => s.step);
    assert.deepEqual(steps, [
        'page_view',
        'collection_view',
        'wallet_connect',
        'mint_click',
        'tx_sent',
        'mint_success'
    ]);
    // Every later step is <= the previous one, so no >100% conversions.
    for (let i = 1; i < res.body.funnel.length; i++) {
        assert.ok(parseFloat(res.body.funnel[i].conversion) <= 100);
    }
    assert.equal(res.body.funnel[0].unit, 'events');
    assert.equal(res.body.overallConversion, '5.0');
});

test('battle_points reports its own unit in the social proof marquee', async (t) => {
    t.after(() => mock.reset());

    const kv = makeKv({ 'leaderboard:battle_wins:all_time': [[WALLET_A, 12]] });

    const handler = await loadHandler(kv);
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: { type: 'battle_points' } }, res);

    const whale = res.body.socialProof.find((m) => m.type === 'whale');
    assert.ok(whale);
    assert.match(whale.text, /battle points/);
    assert.doesNotMatch(whale.text, /mints/);
});
