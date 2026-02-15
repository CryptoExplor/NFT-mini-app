import { toast } from '../utils/toast.js';
import { getFarcasterSDK, isInFarcaster } from '../farcaster.js';

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
        return `https://base-mintapp.vercel.app/mint/${slug}`;
    }
    if (platform === 'x') {
        // format: https://base.app/app/https:/base-mintapp.vercel.app/mint/base-invaders
        return `https://base.app/app/https:/base-mintapp.vercel.app/mint/${slug}`;
    }
    return `${window.location.origin}/mint/${slug}`;
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
    const baseAppUrl = getPlatformShareUrl('x', collection.slug);
    const openSeaUrl = getOpenSeaUrl(collection);

    const configText = getCollectionShareText(collection);
    const baseText = configText || `I'm minting ${collection.name} on Base! Check it out:`;

    const text = appendOpenSeaText(baseText, openSeaUrl);

    // 1. Try Farcaster Native Share if in Farcaster
    if (isInFarcaster()) {
        const sdk = getFarcasterSDK();
        if (sdk?.actions?.composeCast) {
            try {
                await sdk.actions.composeCast({
                    text,
                    embeds: openSeaUrl ? [fcUrl, openSeaUrl] : [fcUrl]
                });
                return;
            } catch (e) {
                console.error('Farcaster composeCast failed:', e);
            }
        }
    }

    // 2. Try Web Share API
    const shareData = {
        title: collection.name,
        text,
        url: baseAppUrl
    };

    try {
        if (navigator.share) {
            await navigator.share(shareData);
        } else {
            // Fallback to copy link + context
            await navigator.clipboard.writeText(buildClipboardPayload(text, baseAppUrl, openSeaUrl));
            toast.show('Link copied to clipboard!', 'success');
        }
    } catch (e) {
        if (e.name !== 'AbortError') {
            console.error('Share failed:', e);
            await navigator.clipboard.writeText(buildClipboardPayload(text, baseAppUrl, openSeaUrl));
            toast.show('Link copied to clipboard!', 'success');
        }
    }
}

/**
 * Specifically share to Farcaster
 */
export async function shareToFarcaster(collection, customText = null) {
    const url = getPlatformShareUrl('farcaster', collection.slug);
    const openSeaUrl = getOpenSeaUrl(collection);

    const configText = getCollectionShareText(collection);
    const baseText = customText || configText || `Just minted ${collection.name} on Base!`;

    const text = appendOpenSeaText(baseText, openSeaUrl);

    if (isInFarcaster()) {
        const sdk = getFarcasterSDK();
        if (sdk?.actions?.composeCast) {
            await sdk.actions.composeCast({
                text,
                embeds: openSeaUrl ? [url, openSeaUrl] : [url]
            });
        }
    } else {
        // Fallback to Warpcast intent
        const embeds = [url];
        if (openSeaUrl) embeds.push(openSeaUrl);
        const embedsQuery = embeds.map((embed) => `embeds[]=${encodeURIComponent(embed)}`).join('&');
        const intentUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&${embedsQuery}`;
        window.open(intentUrl, '_blank');
    }
}

/**
 * Share to Twitter/X
 */
export function shareToTwitter(collection, customText = null) {
    const url = getPlatformShareUrl('x', collection.slug);
    const openSeaUrl = getOpenSeaUrl(collection);

    const configText = getCollectionShareText(collection);
    const baseText = customText || configText || `I'm minting ${collection.name} on Base!`;

    const text = appendOpenSeaText(baseText, openSeaUrl);

    const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(intentUrl, '_blank');
}

/**
 * Share the main app to Farcaster
 */
export async function shareAppOnFarcaster() {
    const url = 'https://base-mintapp.vercel.app/';
    const text = 'Check out this minting app on Base!';

    if (isInFarcaster()) {
        const sdk = getFarcasterSDK();
        if (sdk?.actions?.composeCast) {
            await sdk.actions.composeCast({
                text,
                embeds: [url]
            });
        }
    } else {
        const intentUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(url)}`;
        window.open(intentUrl, '_blank');
    }
}
