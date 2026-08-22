/**
 * Challenge store tests (in-memory KV double).
 *
 * Run: node --test --experimental-test-module-mocks "api/**\/*.test.js"
 *
 * Expiry now lives inside the stored value instead of a sibling
 * `challenge:ttl:<id>` key, so listing challenges costs ONE command instead of
 * one EXISTS per challenge.
 */

import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

const HASH_KEY = 'challenges:active';

function createRedis() {
    const hashes = new Map();
    const strings = new Map();
    const calls = [];

    const redis = {
        _hashes: hashes,
        _calls: calls,
        async hset(key, obj) {
            calls.push('hset');
            const hash = hashes.get(key) || new Map();
            for (const [field, value] of Object.entries(obj)) hash.set(field, value);
            hashes.set(key, hash);
        },
        async hget(key, field) {
            calls.push('hget');
            return hashes.get(key)?.get(field) ?? null;
        },
        async hgetall(key) {
            calls.push('hgetall');
            const hash = hashes.get(key);
            return hash ? Object.fromEntries(hash) : null;
        },
        async hdel(key, field) {
            calls.push('hdel');
            hashes.get(key)?.delete(field);
        },
        async exists(key) {
            calls.push('exists');
            return strings.has(key) ? 1 : 0;
        },
        async set(key, value) {
            calls.push('set');
            strings.set(key, value);
            return 'OK';
        },
        async del(key) {
            calls.push('del');
            strings.delete(key);
        },
        pipeline() {
            const queued = [];
            const api = {
                hdel: (...args) => (queued.push(() => redis.hdel(...args)), api),
                del: (...args) => (queued.push(() => redis.del(...args)), api),
                exec: async () => Promise.all(queued.map((run) => run()))
            };
            return api;
        }
    };

    return redis;
}

async function loadKv(redis) {
    mock.module('@upstash/redis', {
        namedExports: {
            Redis: class {
                static fromEnv() { return redis; }
                constructor() { return redis; }
            }
        }
    });
    return import(`./kv.js?t=${Math.random()}`);
}

test('listing challenges costs one command regardless of challenge count', async (t) => {
    t.after(() => mock.reset());

    const redis = createRedis();
    const kv = await loadKv(redis);

    for (let i = 0; i < 25; i++) {
        await kv.setChallengeAtomic(`ch_${i}`, { player: `0x${i}`, expiresAt: Date.now() + 60_000 });
    }

    redis._calls.length = 0;
    const challenges = await kv.listActiveChallenges();

    assert.equal(challenges.length, 25);
    assert.equal(redis._calls.filter((c) => c === 'exists').length, 0, 'no per-challenge EXISTS');
    assert.equal(redis._calls.filter((c) => c === 'hgetall').length, 1);
});

test('expired challenges are filtered out and cleaned up lazily', async (t) => {
    t.after(() => mock.reset());

    const redis = createRedis();
    const kv = await loadKv(redis);

    await kv.setChallengeAtomic('fresh', { player: '0xa', expiresAt: Date.now() + 60_000 });
    await kv.setChallengeAtomic('stale', { player: '0xb', expiresAt: Date.now() - 1_000 });

    const challenges = await kv.listActiveChallenges();

    assert.deepEqual(challenges.map((c) => c.id), ['fresh']);
    // The stale entry is removed from the hash rather than lingering forever.
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(redis._hashes.get(HASH_KEY).has('stale'), false);
});

test('an expired challenge can never be fetched for a fight', async (t) => {
    t.after(() => mock.reset());

    const redis = createRedis();
    const kv = await loadKv(redis);

    await kv.setChallengeAtomic('stale', { player: '0xb', expiresAt: Date.now() - 1 });

    assert.equal(await kv.getChallengeAtomic('stale'), null);
});

test('records written before inline expiry fall back to _storedAt + TTL', async (t) => {
    t.after(() => mock.reset());

    const redis = createRedis();
    const kv = await loadKv(redis);

    // Simulate a legacy row: no expiresAt, only _storedAt.
    const legacyFresh = JSON.stringify({ player: '0xa', _storedAt: Date.now() - 60_000 });
    const legacyOld = JSON.stringify({ player: '0xb', _storedAt: Date.now() - 7_200_000 });
    await redis.hset(HASH_KEY, { legacyFresh, legacyOld });

    const challenges = await kv.listActiveChallenges();
    const ids = challenges.map((c) => c.id);

    assert.ok(ids.includes('legacyFresh'), 'a legacy challenge inside the 1h window still shows');
    assert.ok(!ids.includes('legacyOld'), 'a legacy challenge past the 1h window is dropped');
});

test('a stored challenge keeps its own expiresAt', async (t) => {
    t.after(() => mock.reset());

    const redis = createRedis();
    const kv = await loadKv(redis);

    const expiresAt = Date.now() + 123_456;
    await kv.setChallengeAtomic('ch_1', { player: '0xa', expiresAt });

    const stored = await kv.getChallengeAtomic('ch_1');
    assert.equal(stored.expiresAt, expiresAt);
    assert.ok(stored._storedAt > 0);
});
