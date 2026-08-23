/**
 * Event pipeline regression tests (in-memory KV double).
 *
 * Run: node --test api/_lib/events.test.js
 *
 * Covers the counting bugs fixed in the analytics audit:
 *  - AI wins counted exactly once on the arena ladder
 *  - PvP attacker wins reaching stats:global.battle_wins
 *  - weekly boards being written + TTL'd only when touched
 *  - duplicate mint_success not inflating global/daily counters
 *  - UTC-stable ISO week bucketing
 *  - typed rate-limit error (so the API can answer 429, not 500)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    processEvent,
    checkRateLimit,
    getWeekNumber,
    RateLimitError
} from './events.js';

// ── Minimal in-memory Redis double ─────────────────────────────
function createFakeKv() {
    const hashes = new Map();
    const zsets = new Map();
    const strings = new Map();
    const sets = new Map();
    const lists = new Map();
    const expirations = new Map();

    const hash = (k) => hashes.get(k) || (hashes.set(k, new Map()), hashes.get(k));
    const zset = (k) => zsets.get(k) || (zsets.set(k, new Map()), zsets.get(k));
    const set = (k) => sets.get(k) || (sets.set(k, new Set()), sets.get(k));
    const list = (k) => lists.get(k) || (lists.set(k, []), lists.get(k));

    const ops = {
        hincrby: (k, f, n) => hash(k).set(f, (Number(hash(k).get(f)) || 0) + n),
        hincrbyfloat: (k, f, n) => hash(k).set(f, (Number(hash(k).get(f)) || 0) + n),
        hset: (k, obj) => Object.entries(obj).forEach(([f, v]) => hash(k).set(f, v)),
        hgetall: (k) => (hashes.has(k) ? Object.fromEntries(hash(k)) : null),
        hget: (k, f) => hash(k).get(f) ?? null,
        zincrby: (k, n, m) => zset(k).set(m, (zset(k).get(m) || 0) + n),
        zadd: (k, { score, member }) => zset(k).set(member, score),
        zscore: (k, m) => zset(k).get(m) ?? null,
        set: (k, v, opts = {}) => {
            // Honour SET ... NX (used by the rate limiter to seed the counter)
            if (opts.nx && strings.has(k)) return null;
            if (opts.ex) expirations.set(k, opts.ex);
            strings.set(k, v);
            return 'OK';
        },
        get: (k) => strings.get(k) ?? null,
        incr: (k) => {
            const next = (Number(strings.get(k)) || 0) + 1;
            strings.set(k, next);
            return next;
        },
        sadd: (k, m) => (set(k).has(m) ? 0 : (set(k).add(m), 1)),
        lpush: (k, v) => list(k).unshift(v),
        lrange: (k, start, stop) => list(k).slice(start, stop + 1),
        ltrim: (k, start, stop) => lists.set(k, list(k).slice(start, stop + 1)),
        expire: (k, ttl) => expirations.set(k, ttl),
        del: (k) => strings.delete(k)
    };

    const kv = {
        _hashes: hashes,
        _zsets: zsets,
        _lists: lists,
        _expirations: expirations,
        pipeline() {
            const queued = [];
            const api = {};
            for (const [name, fn] of Object.entries(ops)) {
                api[name] = (...args) => {
                    queued.push(() => fn(...args));
                    return api;
                };
            }
            api.exec = async () => queued.map((run) => run());
            return api;
        }
    };

    for (const [name, fn] of Object.entries(ops)) {
        kv[name] = async (...args) => fn(...args);
    }
    return kv;
}

const WEEK = getWeekNumber(new Date());
const WALLET = '0x1111111111111111111111111111111111111111';
const OPPONENT = '0x2222222222222222222222222222222222222222';

// ── Tests ──────────────────────────────────────────────────────

test('AI win increments the arena ladder exactly once', async () => {
    const kv = createFakeKv();

    await processEvent(kv, {
        type: 'battle_result_v2',
        wallet: WALLET,
        metadata: { won: true, isAi: true, ladderVerified: true }
    });

    assert.equal(kv._zsets.get('leaderboard:battle_wins:all_time').get(WALLET), 1);
    assert.equal(kv._hashes.get(`user:${WALLET}:profile`).get('battle_wins'), 1);
    // Ladder and profile must agree — the old double-write made them 2 vs 1.
    assert.equal(
        kv._zsets.get('leaderboard:battle_wins:all_time').get(WALLET),
        kv._hashes.get(`user:${WALLET}:profile`).get('battle_wins')
    );
});

test('an already-counted ladder write is not repeated (ladderCounted)', async () => {
    const kv = createFakeKv();

    await processEvent(kv, {
        type: 'battle_result_v2',
        wallet: WALLET,
        metadata: { won: true, isAi: true, ladderCounted: true, ladderVerified: true }
    });

    assert.equal(kv._zsets.has('leaderboard:battle_wins:all_time'), false);
    assert.equal(kv._hashes.get(`user:${WALLET}:profile`).get('battle_wins'), 1);
});

test('PvP counts one battle and one global win even when the attacker wins', async () => {
    const kv = createFakeKv();

    // Defender lost — carries affectsGlobal
    await processEvent(kv, {
        type: 'battle_result_v2',
        wallet: WALLET,
        metadata: { won: false, isAi: false, affectsGlobal: true, countsGlobalWin: true, ladderVerified: true }
    });
    // Attacker won — mirrored event, not counted in global volume
    await processEvent(kv, {
        type: 'battle_result_v2',
        wallet: OPPONENT,
        metadata: { won: true, isAi: false, affectsGlobal: false, countsGlobalWin: true, ladderVerified: true }
    });

    const global = kv._hashes.get('stats:global');
    assert.equal(global.get('battle_total'), 1, 'match counted once');
    assert.equal(global.get('battle_wins'), 1, 'attacker victory must reach the global counter');
    assert.equal(kv._zsets.get('leaderboard:battle_wins:all_time').get(OPPONENT), 1);
});

test('battle wins award weekly points and TTL only the touched weekly keys', async () => {
    const kv = createFakeKv();

    await processEvent(kv, {
        type: 'battle_result_v2',
        wallet: WALLET,
        metadata: { won: true, isAi: true, ladderVerified: true }
    });

    assert.equal(kv._zsets.get(`leaderboard:points:week:${WEEK}`).get(WALLET), 5);
    assert.equal(kv._zsets.get(`leaderboard:battle_wins:week:${WEEK}`).get(WALLET), 1);

    const expired = [...kv._expirations.keys()];
    assert.ok(expired.includes(`leaderboard:points:week:${WEEK}`));
    assert.ok(expired.includes(`leaderboard:battle_wins:week:${WEEK}`));
    // The mints board was never written by this event, so it must not be TTL'd.
    assert.ok(!expired.includes(`leaderboard:mints:week:${WEEK}`));
});

test('guest battles move global counters without touching wallet state', async () => {
    const kv = createFakeKv();

    await processEvent(kv, {
        type: 'battle_result_v2',
        wallet: 'anonymous',
        metadata: { won: true, isAi: true }
    });

    assert.equal(kv._hashes.get('stats:global').get('battle_total'), 1);
    assert.equal(kv._hashes.get('stats:global').get('battle_wins'), 1);
    assert.equal(kv._hashes.has('user:anonymous:profile'), false);
    assert.equal(kv._zsets.has('leaderboard:battle_wins:all_time'), false);
});

test('an unverified battle claim never touches the ladder, points or profile', async () => {
    const kv = createFakeKv();

    // No ladderVerified flag = the claim was not tied to a stored battle record.
    await processEvent(kv, {
        type: 'battle_result_v2',
        wallet: WALLET,
        metadata: { won: true, isAi: true }
    });

    assert.equal(kv._zsets.has('leaderboard:battle_wins:all_time'), false);
    assert.equal(kv._zsets.has('leaderboard:points'), false);
    assert.equal(kv._hashes.get(`user:${WALLET}:profile`)?.get('battle_wins'), undefined);
});

test('confirmed mint updates the feed, user profile, and journey together', async () => {
    const kv = createFakeKv();
    const verifiedCalls = [];
    const event = {
        type: 'mint_success',
        wallet: WALLET,
        collection: 'test-collection',
        txHash: '0xconfirmed',
        price: 0.01,
        timestamp: Date.now()
    };

    const result = await processEvent(kv, event, {
        verifyMintTransaction: async (...args) => {
            verifiedCalls.push(args);
            return {
                valid: true,
                tokenId: '42',
                tokenIds: ['42'],
                quantity: 1,
                collectionName: 'Test Collection',
                contract: '0x3333333333333333333333333333333333333333',
                imageUrl: '/test.webp',
                openseaUrl: 'https://opensea.io/assets/base/0x3333333333333333333333333333333333333333/42',
                chain: 'base',
                chainId: 8453,
                gas: 0.00001,
                mintedAt: event.timestamp
            };
        }
    });

    assert.equal(result.success, true);
    assert.deepEqual(verifiedCalls, [['0xconfirmed', WALLET, 'test-collection']]);
    assert.equal(kv._hashes.get(`user:${WALLET}:profile`).get('total_mints'), 1);
    assert.equal(kv._zsets.get('leaderboard:mints:all_time').get(WALLET), 1);

    const feedItem = JSON.parse(kv._lists.get('activity:global')[0]);
    assert.equal(feedItem.wallet, WALLET);
    assert.equal(feedItem.collection, 'test-collection');
    assert.equal(feedItem.txHash, '0xconfirmed');
    assert.equal(feedItem.tokenId, '42');
    assert.equal(feedItem.collectionName, 'Test Collection');
    assert.equal(feedItem.imageUrl, '/test.webp');
    assert.equal(feedItem.quantity, 1);

    const journeyItem = JSON.parse(kv._lists.get(`user:${WALLET}:journey`)[0]);
    assert.equal(journeyItem.type, 'mint_success');
    assert.equal(journeyItem.txHash, '0xconfirmed');
    assert.equal(journeyItem.tokenId, '42');
    assert.equal(journeyItem.openseaUrl.includes('/42'), true);
});

test('historical reconciliation keeps the on-chain timestamp and does not reset streaks', async () => {
    const kv = createFakeKv();
    const mintedAt = Date.now() - 10 * 24 * 60 * 60 * 1000;
    const mintDay = new Date(mintedAt).toISOString().split('T')[0];

    await processEvent(kv, {
        type: 'mint_success',
        wallet: WALLET,
        collection: 'test-collection',
        txHash: '0xhistorical',
        timestamp: Date.now()
    }, {
        verifyMintTransaction: async () => ({
            valid: true,
            tokenId: '7',
            quantity: 1,
            mintedAt
        })
    });

    const feedItem = JSON.parse(kv._lists.get('activity:global')[0]);
    assert.equal(feedItem.timestamp, mintedAt);
    assert.equal(feedItem.reconciled, true);
    assert.equal(kv._hashes.get(`daily:stats:${mintDay}`).get('mint_success'), 1);
    assert.equal(kv._hashes.get(`user:${WALLET}:profile`).get('streak'), undefined);
});

test('historical replay detects pre-migration transactions in the user journey', async () => {
    const kv = createFakeKv();
    const txHash = '0xpre-migration';
    await kv.lpush(`user:${WALLET}:journey`, JSON.stringify({
        type: 'mint_success',
        collection: 'test-collection',
        txHash,
        timestamp: Date.now() - 30 * 24 * 60 * 60 * 1000
    }));

    const result = await processEvent(kv, {
        type: 'mint_success',
        wallet: WALLET,
        collection: 'test-collection',
        txHash
    }, {
        verifyMintTransaction: async () => true
    });

    assert.equal(result.duplicate, true);
    assert.equal(kv._hashes.get('stats:global')?.get('total_mints'), undefined);
    assert.equal(await kv.hget('mint:processed:all', txHash), 1);
});

test('duplicate mint_success does not inflate global or daily counters', async () => {
    const kv = createFakeKv();
    const event = {
        type: 'mint_success',
        wallet: WALLET,
        collection: 'test-collection',
        txHash: '0xabc',
        price: 0.01
    };

    const first = await processEvent(kv, event);
    const eventsAfterFirst = kv._hashes.get('stats:global').get('total_events');
    const mintsAfterFirst = kv._hashes.get('stats:global').get('total_mints');

    const second = await processEvent(kv, event);

    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(second.duplicate, true);
    assert.equal(kv._hashes.get('stats:global').get('total_events'), eventsAfterFirst);
    assert.equal(kv._hashes.get('stats:global').get('total_mints'), mintsAfterFirst);
});

test('getWeekNumber is UTC-stable regardless of process timezone', () => {
    const monday0200Utc = new Date('2026-08-24T02:00:00Z');
    const original = process.env.TZ;

    process.env.TZ = 'UTC';
    const utc = getWeekNumber(monday0200Utc);
    process.env.TZ = 'America/New_York';
    const ny = getWeekNumber(monday0200Utc);
    process.env.TZ = original;

    assert.equal(utc, ny);
    assert.match(utc, /^\d{4}-W\d{2}$/);
});

test('rate limiting throws a typed error the API can map to 429', async () => {
    const kv = createFakeKv();
    let thrown = null;

    for (let i = 0; i < 15; i++) {
        try {
            await checkRateLimit(kv, WALLET, 'mint_success', 5);
        } catch (err) {
            thrown = err;
            break;
        }
    }

    assert.ok(thrown instanceof RateLimitError);
    assert.equal(thrown.code, 'RATE_LIMITED');
    assert.equal(typeof thrown.retryAfter, 'number');
});
