import { toast } from '../utils/toast.js';
import { getFarcasterSDK, isInFarcaster } from '../farcaster.js';

const APP_ORIGIN = 'https://base-mintapp.vercel.app';
const WARPCAST_COMPOSE_URL = 'https://warpcast.com/~/compose';
const COLLECTION_SHARE_FALLBACK_IMAGE = '/image.png';

function getAppOrigin() {
    if (typeof window !== 'undefined' && typeof window.location?.origin === 'string' && window.location.origin.startsWith('http')) {
        return window.location.origin;
    }
    return APP_ORIGIN;
}

function toAbsoluteUrl(url, baseUrl = getAppOrigin()) {
    if (typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (!trimmed) return null;

    try {
        return new URL(trimmed, baseUrl).toString();
    } catch {
        return null;
    }
}

function uniqueUrls(urls, limit = 2) {
    const deduped = [];
    for (const url of urls) {
        if (!url || deduped.includes(url)) continue;
        deduped.push(url);
        if (deduped.length >= limit) break;
    }
    return deduped;
}

function getCollectionShareUrl(slug) {
    return toAbsoluteUrl(`/share/${slug}`);
}

function getCollectionMintUrl(slug) {
    return toAbsoluteUrl(`/mint/${slug}`);
}

function getCollectionImageUrl(collection) {
    return toAbsoluteUrl(collection?.shareImageUrl || collection?.imageUrl || COLLECTION_SHARE_FALLBACK_IMAGE);
}

function getCollectionEmbeds(collection) {
    const shareUrl = getCollectionShareUrl(collection.slug);
    const imageUrl = getCollectionImageUrl(collection);
    // Keep collection casts to a single embed to avoid duplicate cards in compose.
    // `/share/:slug` already contains the collection image metadata.
    return uniqueUrls([shareUrl, imageUrl], 1);
}

function getMainAppShareUrl() {
    return toAbsoluteUrl('/share');
}

function getMainAppEmbeds() {
    const shareUrl = getMainAppShareUrl();
    // Keep main app share to a single embed to avoid duplicate cards.
    return uniqueUrls([shareUrl], 1);
}

async function tryComposeCast(text, embeds) {
    if (!isInFarcaster()) return false;

    const sdk = getFarcasterSDK();
    if (!sdk?.actions?.composeCast) return false;

    try {
        await sdk.actions.composeCast({
            text,
            embeds: uniqueUrls(embeds)
        });
        return true;
    } catch (error) {
        console.error('Farcaster composeCast failed:', error);
        return false;
    }
}

function buildComposeIntentUrl(text, embeds) {
    const params = new URLSearchParams();
    if (text) params.set('text', text);
    for (const embed of uniqueUrls(embeds)) {
        params.append('embeds[]', embed);
    }
    return `${WARPCAST_COMPOSE_URL}?${params.toString()}`;
}

async function openExternalUrl(url) {
    if (!url || typeof window === 'undefined') return false;

    if (isInFarcaster()) {
        const sdk = getFarcasterSDK();
        if (sdk?.actions?.openUrl) {
            try {
                await sdk.actions.openUrl(url);
                return true;
            } catch (error) {
                console.error('Farcaster openUrl fallback failed:', error);
            }
        }
    }

    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
}

async function copySharePayload(payload) {
    if (!payload) return;
    try {
        if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(payload);
            toast.show('Link copied to clipboard!', 'success');
            return;
        }
    } catch (error) {
        console.error('Clipboard write failed:', error);
    }
    toast.show('Unable to share automatically.', 'error');
}

/**
 * Get share text from collection config
 * Supports string or array of strings (random selection)
 */
function getCollectionShareText(collection) {
    // Try farcaster.shareText first (as it's currently the only place for share text)
    const shareTextConfig = collection.farcaster?.shareText;

    if (Array.isArray(shareTextConfig) && shareTextConfig.length > 0) {
        return shareTextConfig[Math.floor(Math.random() * shareTextConfig.length)];
    }

    return shareTextConfig || null;
}

/**
 * Get the platform-specific share URL for a collection
 */
function getPlatformShareUrl(platform, slug) {
    if (platform === 'farcaster') {
        return getCollectionShareUrl(slug);
    }
    if (platform === 'web') {
        return getCollectionShareUrl(slug);
    }
    if (platform === 'x') {
        return getCollectionMintUrl(slug);
    }
    return toAbsoluteUrl(`/mint/${slug}`);
}

function getOpenSeaUrl(collection) {
    const rawUrl = collection?.openseaUrl;
    if (typeof rawUrl !== 'string') return null;
    const url = rawUrl.trim();
    return url.length > 0 ? url : null;
}

function appendOpenSeaText(baseText, openSeaUrl) {
    if (!openSeaUrl || baseText.includes(openSeaUrl)) {
        return baseText;
    }
    return `${baseText}\nOpenSea: ${openSeaUrl}`;
}

function buildClipboardPayload(text, primaryUrl, openSeaUrl) {
    let payload = text;
    if (primaryUrl && !payload.includes(primaryUrl)) {
        payload += `\n${primaryUrl}`;
    }
    if (openSeaUrl && !payload.includes(openSeaUrl)) {
        payload += `\nOpenSea: ${openSeaUrl}`;
    }
    return payload;
}

/**
 * Share a collection (Generic/Web Share)
 */
export async function shareCollection(collection) {
    const fcUrl = getPlatformShareUrl('farcaster', collection.slug);
    const baseAppUrl = getPlatformShareUrl('web', collection.slug);
    const openSeaUrl = getOpenSeaUrl(collection);
    const imageUrl = getCollectionImageUrl(collection);
    const embeds = getCollectionEmbeds(collection);

    const configText = getCollectionShareText(collection);
    const baseText = configText || `I'm minting ${collection.name} on Base! Check it out:`;

    const text = appendOpenSeaText(baseText, openSeaUrl);
    const intentUrl = buildComposeIntentUrl(text, embeds);

    // 1. Try Farcaster Native Share if in Farcaster/Base App
    if (isInFarcaster()) {
        if (await tryComposeCast(text, embeds)) {
            return;
        }
        await openExternalUrl(intentUrl);
        return;
    }

    // 2. Try Web Share API
    const shareData = {
        title: collection.name,
        text,
        url: fcUrl || baseAppUrl
    };

    try {
        if (navigator?.share) {
            await navigator.share(shareData);
            return;
        } else {
            // Web fallback to Warpcast compose intent
            await openExternalUrl(intentUrl);
            return;
        }
    } catch (error) {
        if (error?.name !== 'AbortError') {
            console.error('Share failed:', error);
            // Fallback to Warpcast compose intent first
            const opened = await openExternalUrl(intentUrl);
            if (opened) return;

            // Last fallback to copy link + context
            const payload = buildClipboardPayload(text, fcUrl || baseAppUrl, openSeaUrl);
            if (imageUrl && !payload.includes(imageUrl)) {
                await copySharePayload(`${payload}\nImage: ${imageUrl}`);
            } else {
                await copySharePayload(payload);
            }
        }
    }
}

/**
 * Share to feed (client-agnostic)
 */
export async function shareToFeed(collection, customText = null) {
    const url = getPlatformShareUrl('farcaster', collection.slug);
    const openSeaUrl = getOpenSeaUrl(collection);
    const embeds = getCollectionEmbeds(collection);

    const configText = getCollectionShareText(collection);
    const baseText = customText || configText || `Just minted ${collection.name} on Base!`;

    const text = appendOpenSeaText(baseText, openSeaUrl);

    if (await tryComposeCast(text, embeds)) {
        return;
    }

    const fallbackEmbeds = uniqueUrls([url, ...embeds]);
    await openExternalUrl(buildComposeIntentUrl(text, fallbackEmbeds));
}

/**
 * Share to Twitter/X
 */
export function shareToTwitter(collection, customText = null) {
    const url = getPlatformShareUrl('web', collection.slug);
    const openSeaUrl = getOpenSeaUrl(collection);

    const configText = getCollectionShareText(collection);
    const baseText = customText || configText || `I'm minting ${collection.name} on Base!`;

    const text = appendOpenSeaText(baseText, openSeaUrl);

    const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(intentUrl, '_blank');
}

/**
 * Share the main app to feed (client-agnostic)
 */
export async function shareAppToFeed() {
    const url = getMainAppShareUrl();
    const text = 'Check out Base Mint App — Mint and collect Onchain NFTs on Base!';
    const embeds = getMainAppEmbeds();

    if (await tryComposeCast(text, embeds)) {
        return;
    }

    await openExternalUrl(buildComposeIntentUrl(text, uniqueUrls([url], 1)));
}
