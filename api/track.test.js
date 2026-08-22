import test from 'node:test';
import assert from 'node:assert/strict';

import { eventRequiresAuth, getMintDetailsFromReceipt, isMintReceiptForWallet } from './track.js';

const WALLET = '0x1111111111111111111111111111111111111111';
const OTHER_WALLET = '0x2222222222222222222222222222222222222222';
const BASE_INVADERS = '0xCADD0E7B715d4c398cdeb889964ad8F9886AfaA4';
const ERC721_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ERC1155_SINGLE = '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62';
const ZERO_TOPIC = `0x${'0'.repeat(64)}`;
const topicFor = (address) => `0x${'0'.repeat(24)}${address.toLowerCase().slice(2)}`;

test('confirmed mint events use receipt proof instead of requiring a second wallet signature', () => {
    assert.equal(eventRequiresAuth('mint_success'), false);
    assert.equal(eventRequiresAuth('battle_result_v2'), true);
    assert.equal(eventRequiresAuth('social_share'), true);
});

test('accepts a standards-compliant mint to the wallet from the configured collection', () => {
    const receipt = {
        status: 'success',
        // A relayer/smart-account bundler may be the transaction sender.
        from: OTHER_WALLET,
        logs: [{
            address: BASE_INVADERS,
            topics: [ERC721_TRANSFER, ZERO_TOPIC, topicFor(WALLET), '0x01']
        }]
    };

    assert.equal(isMintReceiptForWallet(receipt, WALLET, 'base-invaders'), true);
    const details = getMintDetailsFromReceipt(receipt, WALLET, 'base-invaders');
    assert.equal(details.tokenId, '1');
    assert.equal(details.quantity, 1);
    assert.equal(details.collectionName, 'BaseInvaders');
    assert.equal(details.imageUrl, '/base-invaders.webp');
    assert.equal(details.openseaUrl.endsWith('/1'), true);
});

test('extracts ERC-1155 token id and quantity for rich feed data', () => {
    const word = (value) => BigInt(value).toString(16).padStart(64, '0');
    const receipt = {
        status: 'success',
        logs: [{
            address: BASE_INVADERS,
            topics: [ERC1155_SINGLE, topicFor(OTHER_WALLET), ZERO_TOPIC, topicFor(WALLET)],
            data: `0x${word(7)}${word(3)}`
        }]
    };

    const details = getMintDetailsFromReceipt(receipt, WALLET, 'base-invaders');
    assert.equal(details.tokenId, '7');
    assert.equal(details.quantity, 3);
});

test('rejects transfers, wrong recipients, and logs from another contract', () => {
    const baseReceipt = {
        status: 'success',
        logs: [{
            address: BASE_INVADERS,
            topics: [ERC721_TRANSFER, ZERO_TOPIC, topicFor(WALLET), '0x01']
        }]
    };

    const transferReceipt = structuredClone(baseReceipt);
    transferReceipt.logs[0].topics[1] = topicFor(OTHER_WALLET);

    const wrongRecipient = structuredClone(baseReceipt);
    wrongRecipient.logs[0].topics[2] = topicFor(OTHER_WALLET);

    const wrongContract = structuredClone(baseReceipt);
    wrongContract.logs[0].address = OTHER_WALLET;

    assert.equal(isMintReceiptForWallet(transferReceipt, WALLET, 'base-invaders'), false);
    assert.equal(isMintReceiptForWallet(wrongRecipient, WALLET, 'base-invaders'), false);
    assert.equal(isMintReceiptForWallet(wrongContract, WALLET, 'base-invaders'), false);
    assert.equal(isMintReceiptForWallet(baseReceipt, WALLET, 'unknown-collection'), false);
});
