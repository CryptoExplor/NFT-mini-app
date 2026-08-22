/**
 * Fighter ownership tests.
 *
 * Run: node --test --experimental-test-module-mocks "api/**\/*.test.js"
 *
 * Only the resolution + policy layers are exercised here; the cached-owner path
 * means no RPC call is needed, so these run offline and deterministically.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveCollectionContract, verifyFighterOwnership, getFighterIdentity } from './ownership.js';

const OWNER = '0x1111111111111111111111111111111111111111';
const STRANGER = '0x2222222222222222222222222222222222222222';
const BASE_MOODS = '0x8be6974ffc8feea343af658e84193ffc03fdeafe';

/** KV double that only implements the owner cache. */
function createKv(entries = {}) {
    const store = new Map(Object.entries(entries));
    return {
        _store: store,
        async get(key) { return store.get(key) ?? null; },
        async set(key, value) { store.set(key, value); return 'OK'; }
    };
}

test('collection slugs resolve to their on-chain contract', async () => {
    const direct = await resolveCollectionContract('base-moods');
    assert.ok(direct, 'registry slug resolves');
    assert.equal(direct.address.toLowerCase(), BASE_MOODS);
    assert.equal(direct.chainId, 8453);
});

test('battle profile aliases resolve to the same contract', async () => {
    for (const alias of ['BaseMoods', 'base_moods', 'BASE_MOODS'.toLowerCase()]) {
        const resolved = await resolveCollectionContract(alias);
        assert.ok(resolved, `${alias} should resolve`);
        assert.equal(resolved.address.toLowerCase(), BASE_MOODS);
    }
});

test('unknown collections do not resolve', async () => {
    assert.equal(await resolveCollectionContract('not-a-collection'), null);
    assert.equal(await resolveCollectionContract(''), null);
    assert.equal(await resolveCollectionContract(null), null);
});

test('the cached owner decides the fight without touching the RPC', async () => {
    const kv = createKv({ [`own:${BASE_MOODS}:7`]: OWNER });

    const mine = await verifyFighterOwnership(kv, {
        wallet: OWNER, collectionSlug: 'base-moods', tokenId: '7'
    });
    assert.deepEqual({ owned: mine.owned, skipped: mine.skipped }, { owned: true, skipped: false });

    const theirs = await verifyFighterOwnership(kv, {
        wallet: STRANGER, collectionSlug: 'base-moods', tokenId: '7'
    });
    assert.equal(theirs.owned, false, 'a wallet cannot fight with somebody else\'s NFT');
});

test('an owner match is case-insensitive', async () => {
    const kv = createKv({ [`own:${BASE_MOODS}:9`]: OWNER });
    const result = await verifyFighterOwnership(kv, {
        wallet: OWNER.toUpperCase(), collectionSlug: 'base-moods', tokenId: '9'
    });
    assert.equal(result.owned, true);
});

test('malformed wallets are always rejected', async () => {
    const kv = createKv();
    const result = await verifyFighterOwnership(kv, {
        wallet: 'not-a-wallet', collectionSlug: 'base-moods', tokenId: '1'
    });
    assert.equal(result.owned, false);
    assert.equal(result.reason, 'invalid_wallet');
});

test('unknown collections and bad token ids are skipped, not blocked (default policy)', async () => {
    const kv = createKv();

    const unknown = await verifyFighterOwnership(kv, {
        wallet: OWNER, collectionSlug: 'base-gods', tokenId: '1'
    });
    assert.equal(unknown.skipped, true);
    assert.equal(unknown.owned, true, 'collections without a contract mapping stay playable');

    const badToken = await verifyFighterOwnership(kv, {
        wallet: OWNER, collectionSlug: 'base-moods', tokenId: 'abc'
    });
    assert.equal(badToken.skipped, true);
    assert.equal(badToken.reason, 'invalid_token_id');
});

test('STRICT_BATTLE_OWNERSHIP flips skipped checks into rejections', async () => {
    const kv = createKv();
    const previous = process.env.STRICT_BATTLE_OWNERSHIP;
    process.env.STRICT_BATTLE_OWNERSHIP = 'true';

    try {
        const unknown = await verifyFighterOwnership(kv, {
            wallet: OWNER, collectionSlug: 'base-gods', tokenId: '1'
        });
        assert.equal(unknown.owned, false);
        assert.equal(unknown.skipped, true);
    } finally {
        if (previous === undefined) delete process.env.STRICT_BATTLE_OWNERSHIP;
        else process.env.STRICT_BATTLE_OWNERSHIP = previous;
    }
});

test('a KV outage does not block play', async () => {
    const brokenKv = {
        async get() { throw new Error('KV down'); },
        async set() { throw new Error('KV down'); }
    };

    // No cache and no RPC configured in tests → skipped, still playable.
    const result = await verifyFighterOwnership(brokenKv, {
        wallet: OWNER, collectionSlug: 'base-gods', tokenId: '3'
    });
    assert.equal(result.owned, true);
    assert.equal(result.skipped, true);
});

test('fighter identity is read from either loadout shape', () => {
    assert.deepEqual(
        getFighterIdentity({ fighter: { collectionSlug: 'base-moods', tokenId: '5' } }),
        { collectionSlug: 'base-moods', tokenId: '5' }
    );
    assert.deepEqual(
        getFighterIdentity({ fighter: { collectionName: 'Base Moods', nftId: 8 } }),
        { collectionSlug: 'Base Moods', tokenId: 8 }
    );
    assert.deepEqual(getFighterIdentity({}), { collectionSlug: null, tokenId: null });
});
