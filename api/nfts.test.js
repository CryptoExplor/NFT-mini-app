/**
 * OpenSea proxy tests — the allowlist is the security boundary that keeps the
 * server-side API key from being turned into an open relay.
 *
 * Run: node --test --experimental-test-module-mocks "api/**\/*.test.js"
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveOpenSeaPath, buildUpstreamQuery } from './nfts.js';

const ADDRESS = '0x1111111111111111111111111111111111111111';

test('allows the read-only account and contract paths', () => {
    const account = resolveOpenSeaPath(`chain/base/account/${ADDRESS}/nfts`);
    assert.equal(account.ok, true);
    assert.equal(account.path, `chain/base/account/${ADDRESS}/nfts`);

    const contract = resolveOpenSeaPath(`chain/base/contract/${ADDRESS}/nfts`);
    assert.equal(contract.ok, true);

    const token = resolveOpenSeaPath(`chain/ethereum/contract/${ADDRESS}/nfts/42`);
    assert.equal(token.ok, true);
    assert.equal(token.path, `chain/ethereum/contract/${ADDRESS}/nfts/42`);
});

test('addresses are normalised to lowercase', () => {
    const upper = `0x${'A'.repeat(40)}`;
    const resolved = resolveOpenSeaPath(`chain/base/account/${upper}/nfts`);
    assert.equal(resolved.ok, true);
    assert.equal(resolved.path.includes(upper.toLowerCase()), true);
});

test('rejects traversal, absolute urls and query smuggling', () => {
    for (const bad of [
        '../../orders/base/seaport/listings',
        'chain/base/account/../../offers',
        'https://evil.example.com/steal',
        'chain/base/account/0x1/nfts?x=1',
        'chain//base/account/nfts',
        'chain/base/account/nfts#frag'
    ]) {
        assert.equal(resolveOpenSeaPath(bad).ok, false, `${bad} must be rejected`);
    }
});

test('rejects unknown chains, bad addresses and non-allowlisted endpoints', () => {
    assert.equal(resolveOpenSeaPath(`chain/solana/account/${ADDRESS}/nfts`).ok, false);
    assert.equal(resolveOpenSeaPath('chain/base/account/not-an-address/nfts').ok, false);
    assert.equal(resolveOpenSeaPath(`chain/base/account/${ADDRESS}/offers`).ok, false);
    assert.equal(resolveOpenSeaPath('listings/collection/foo/all').ok, false);
    assert.equal(resolveOpenSeaPath('').ok, false);
    assert.equal(resolveOpenSeaPath(null).ok, false);
    assert.equal(resolveOpenSeaPath('a'.repeat(500)).ok, false);
});

test('token ids are constrained', () => {
    assert.equal(resolveOpenSeaPath(`chain/base/contract/${ADDRESS}/nfts/1`).ok, true);
    assert.equal(resolveOpenSeaPath(`chain/base/contract/${ADDRESS}/nfts/<script>`).ok, false);
    assert.equal(resolveOpenSeaPath(`chain/base/contract/${ADDRESS}/nfts/${'9'.repeat(100)}`).ok, false);
});

test('only known query params are forwarded, with limit clamped', () => {
    const params = buildUpstreamQuery({
        limit: '9999',
        next: 'cursor-abc',
        collection: 'base-moods',
        // must not be forwarded
        'X-API-KEY': 'leak',
        redirect: 'https://evil.example.com',
        path: 'chain/base/account/x/nfts'
    });

    assert.equal(params.get('limit'), '200');
    assert.equal(params.get('next'), 'cursor-abc');
    assert.equal(params.get('collection'), 'base-moods');
    assert.equal(params.get('redirect'), null);
    assert.equal(params.get('path'), null);
    assert.equal(params.get('X-API-KEY'), null);
});

test('missing or invalid limits fall back to a sane default', () => {
    assert.equal(buildUpstreamQuery({ limit: 'abc' }).get('limit'), '50');
    assert.equal(buildUpstreamQuery({ limit: '-5' }).get('limit'), '1');
    assert.equal(buildUpstreamQuery({}).toString(), '');
});
