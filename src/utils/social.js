
import { toast } from '../utils/toast.js';
import { getFarcasterSDK, isInFarcaster } from '../farcaster.js';

/**
 * Get the platform-specific share URL for a collection
 */
function getPlatformShareUrl(platform, slug) {
    if (platform === 'farcaster') {
        return `https://farcaster.xyz/miniapps/YE6YuWN74WWI/base-mint-app/mint/${slug}`;
    }
    if (platform === 'x') {
        // format: https://base.app/app/https:/base-mintapp.vercel.app/mint/base-invaders
        return `https://base.app/app/https:/base-mintapp.vercel.app/mint/${slug}`;
    }
    return `${window.location.origin}/mint/${slug}`;
}

/**
 * Share a collection (Generic/Web Share)
 */
export async function shareCollection(collection) {
    const fcUrl = getPlatformShareUrl('farcaster', collection.slug);
    const xUrl = getPlatformShareUrl('x', collection.slug);
    const text = `I'm minting ${collection.name} on Base! Check it out:`;

    // 1. Try Farcaster Native Share if in Farcaster
    if (isInFarcaster()) {
        const sdk = getFarcasterSDK();
        if (sdk?.actions?.composeCast) {
            try {
                await sdk.actions.composeCast({
                    text: text,
                    embeds: [fcUrl]
                });
                return;
            } catch (e) {
                console.error('Farcaster composeCast failed:', e);
            }
        }
    }

    // 2. Try Web Share API (Defaulting to Farcaster URL as it's the primary mini-app link)
    const shareData = {
        title: collection.name,
        text: text,
        url: fcUrl
    };

    try {
        if (navigator.share) {
            await navigator.share(shareData);
        } else {
            // Fallback to copy link
            await navigator.clipboard.writeText(fcUrl);
            toast.show('Link copied to clipboard!', 'success');
        }
    } catch (e) {
        if (e.name !== 'AbortError') {
            console.error('Share failed:', e);
            await navigator.clipboard.writeText(fcUrl);
            toast.show('Link copied to clipboard!', 'success');
        }
    }
}

/**
 * Specifically share to Farcaster
 */
export async function shareToFarcaster(collection, customText = null) {
    const url = getPlatformShareUrl('farcaster', collection.slug);
    const text = customText || `Just minted ${collection.name} on Base! 🚀`;

    if (isInFarcaster()) {
        const sdk = getFarcasterSDK();
        if (sdk?.actions?.composeCast) {
            await sdk.actions.composeCast({
                text: text,
                embeds: [url]
            });
        }
    } else {
        // Fallback to Warpcast intent
        const intentUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(url)}`;
        window.open(intentUrl, '_blank');
    }
}

/**
 * Share to Twitter/X
 */
export function shareToTwitter(collection, customText = null) {
    const url = getPlatformShareUrl('x', collection.slug);
    const text = customText || `I'm minting ${collection.name} on Base! 🔵`;
    const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(intentUrl, '_blank');
}
