/**
 * OpenSea media selection helpers.
 *
 * OpenSea's NFT responses expose separate display and original media URLs.
 * Grid/list surfaces must prefer the display URL so merely scrolling through a
 * wallet does not download every full-resolution asset. The original URL is
 * reserved for an explicitly opened NFT detail view.
 */

function firstString(...values) {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
}

/**
 * Select preview and original media from either a raw OpenSea response or one
 * of this app's normalized NFT objects.
 */
export function getNFTMedia(nft = {}) {
    const previewImageUrl = firstString(
        nft.preview_image_url,
        nft.display_image_url,
        nft.image_url,
        nft.image
    );
    const fullImageUrl = firstString(
        nft.full_image_url,
        nft.original_image_url,
        // OpenSea's image_url is a useful fallback when no original is exposed.
        nft._raw?.original_image_url,
        nft._raw?.image_url,
        nft.image_url,
        nft.image,
        previewImageUrl
    );
    const previewAnimationUrl = firstString(
        nft.preview_animation_url,
        nft.display_animation_url,
        nft.animation_url
    );
    const fullAnimationUrl = firstString(
        nft.full_animation_url,
        nft.original_animation_url,
        nft._raw?.original_animation_url,
        nft._raw?.animation_url,
        nft.animation_url,
        previewAnimationUrl
    );

    return {
        previewImageUrl,
        fullImageUrl,
        previewAnimationUrl,
        fullAnimationUrl
    };
}

/**
 * Select media directly from a raw OpenSea response while preserving the
 * distinction between bandwidth-friendly display media and originals.
 */
export function normalizeOpenSeaMedia(nft = {}) {
    const displayImageUrl = firstString(
        nft.display_image_url,
        nft.image_url,
        nft.image
    );
    const originalImageUrl = firstString(
        nft.original_image_url,
        nft.image_url,
        nft.image,
        displayImageUrl
    );
    const displayAnimationUrl = firstString(
        nft.display_animation_url,
        nft.animation_url
    );
    const originalAnimationUrl = firstString(
        nft.original_animation_url,
        nft.animation_url,
        displayAnimationUrl
    );

    return {
        displayImageUrl,
        originalImageUrl,
        displayAnimationUrl,
        originalAnimationUrl
    };
}

/**
 * Convert common decentralized NFT URI schemes into browser-loadable HTTPS.
 * Display URLs from OpenSea are normally already HTTPS, while original creator
 * media can still use ipfs:// or ar://.
 */
export function toBrowserMediaUrl(url) {
    const raw = firstString(url);
    if (!raw) return '';

    if (raw.toLowerCase().startsWith('ipfs://')) {
        const path = raw.slice('ipfs://'.length).replace(/^ipfs\//i, '').replace(/^\/+/, '');
        return path ? `https://ipfs.io/ipfs/${path}` : '';
    }
    if (raw.toLowerCase().startsWith('ar://')) {
        const path = raw.slice('ar://'.length).replace(/^\/+/, '');
        return path ? `https://arweave.net/${path}` : '';
    }

    return raw;
}

/** OpenSea animation_url may be video/audio, a 3D model, or an HTML experience. */
export function getAnimationKind(url) {
    const pathname = String(url || '').split(/[?#]/, 1)[0].toLowerCase();
    if (/\.(html?|gltf|glb)$/.test(pathname)) return 'interactive';
    return 'media';
}
