import test from 'node:test';
import assert from 'node:assert/strict';

import { getAnimationKind, getNFTMedia, normalizeOpenSeaMedia, toBrowserMediaUrl } from './nftMedia.js';

test('OpenSea display media is selected for previews and original media for details', () => {
    const media = normalizeOpenSeaMedia({
        display_image_url: 'https://i.seadn.io/preview.png',
        image_url: 'https://i.seadn.io/image.png',
        original_image_url: 'https://creator.example/original.png',
        display_animation_url: 'https://i.seadn.io/preview.mp4',
        original_animation_url: 'https://creator.example/original.mp4'
    });

    assert.equal(media.displayImageUrl, 'https://i.seadn.io/preview.png');
    assert.equal(media.originalImageUrl, 'https://creator.example/original.png');
    assert.equal(media.displayAnimationUrl, 'https://i.seadn.io/preview.mp4');
    assert.equal(media.originalAnimationUrl, 'https://creator.example/original.mp4');
});

test('media selection gracefully falls back when OpenSea has no display URL', () => {
    const media = normalizeOpenSeaMedia({ image_url: 'https://example.com/only.png' });

    assert.equal(media.displayImageUrl, 'https://example.com/only.png');
    assert.equal(media.originalImageUrl, 'https://example.com/only.png');
});

test('normalized NFT media keeps previews and originals separate', () => {
    const media = getNFTMedia({
        preview_image_url: 'https://example.com/small.webp',
        full_image_url: 'https://example.com/full.png',
        preview_animation_url: 'https://example.com/clip.mp4',
        full_animation_url: 'https://example.com/movie.mp4'
    });

    assert.deepEqual(media, {
        previewImageUrl: 'https://example.com/small.webp',
        fullImageUrl: 'https://example.com/full.png',
        previewAnimationUrl: 'https://example.com/clip.mp4',
        fullAnimationUrl: 'https://example.com/movie.mp4'
    });
});

test('decentralized original media is converted to a browser-loadable URL', () => {
    assert.equal(toBrowserMediaUrl('ipfs://ipfs/bafy123/image.png'), 'https://ipfs.io/ipfs/bafy123/image.png');
    assert.equal(toBrowserMediaUrl('ipfs://bafy123/image.png'), 'https://ipfs.io/ipfs/bafy123/image.png');
    assert.equal(toBrowserMediaUrl('ar://transaction-id'), 'https://arweave.net/transaction-id');
    assert.equal(toBrowserMediaUrl('https://i.seadn.io/example.png'), 'https://i.seadn.io/example.png');
});

test('HTML and 3D animations are opened as interactive media', () => {
    assert.equal(getAnimationKind('https://example.com/nft.html?token=1'), 'interactive');
    assert.equal(getAnimationKind('https://example.com/model.glb#scene'), 'interactive');
    assert.equal(getAnimationKind('https://example.com/movie.mp4'), 'media');
});
