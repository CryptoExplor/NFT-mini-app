import test from 'node:test';
import assert from 'node:assert/strict';

import {
    clearMintAnalyticsOutbox,
    enqueueMintAnalytics,
    flushMintAnalyticsOutbox,
    getMintAnalyticsOutbox,
    markMintAnalyticsSynced,
    seedOutboxFromHistoricalMints
} from './mintAnalyticsOutbox.js';

const WALLET = '0x1111111111111111111111111111111111111111';
const HASH_A = `0x${'a'.repeat(64)}`;
const HASH_B = `0x${'b'.repeat(64)}`;

test('persistent mint outbox deduplicates by transaction hash', () => {
    clearMintAnalyticsOutbox();
    enqueueMintAnalytics({ wallet: WALLET, collection: 'base-invaders', txHash: HASH_A });
    enqueueMintAnalytics({ wallet: WALLET, collection: 'base-invaders', txHash: HASH_A, price: 0.1 });

    const pending = getMintAnalyticsOutbox(WALLET);
    assert.equal(pending.length, 1);
    assert.equal(pending[0].txHash, HASH_A);
    assert.equal(pending[0].price, 0.1);
});

test('successful flush removes an item and remembers it as synced', async () => {
    clearMintAnalyticsOutbox();
    enqueueMintAnalytics({ wallet: WALLET, collection: 'base-invaders', txHash: HASH_A });

    const result = await flushMintAnalyticsOutbox(WALLET, async () => ({ ok: true }), { force: true });
    assert.equal(result.synced, 1);
    assert.equal(result.pending, 0);

    const requeue = enqueueMintAnalytics({ wallet: WALLET, collection: 'base-invaders', txHash: HASH_A });
    assert.equal(requeue.queued, false);
    assert.equal(requeue.reason, 'synced');
});

test('failed items remain queued with retry metadata', async () => {
    clearMintAnalyticsOutbox();
    enqueueMintAnalytics({ wallet: WALLET, collection: 'base-invaders', txHash: HASH_A });

    const result = await flushMintAnalyticsOutbox(
        WALLET,
        async () => ({ ok: false, status: 503, error: 'offline' }),
        { force: true }
    );

    assert.equal(result.failed, 1);
    const [pending] = getMintAnalyticsOutbox(WALLET);
    assert.equal(pending.attempts, 1);
    assert.equal(pending.lastError, 'offline');
});

test('historical discoveries enter the same outbox', () => {
    clearMintAnalyticsOutbox();
    const seeded = seedOutboxFromHistoricalMints(WALLET, [
        { collection: 'base-invaders', txHash: HASH_A, timestamp: Date.now() - 2_000 },
        { collection: 'base-moods', txHash: HASH_B, timestamp: Date.now() - 1_000 }
    ]);

    assert.equal(seeded, 2);
    assert.deepEqual(
        getMintAnalyticsOutbox(WALLET).map((item) => item.txHash),
        [HASH_A, HASH_B]
    );

    markMintAnalyticsSynced(HASH_A);
    assert.deepEqual(getMintAnalyticsOutbox(WALLET).map((item) => item.txHash), [HASH_B]);
});
