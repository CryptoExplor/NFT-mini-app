import { toast } from '../utils/toast.js';
import { getFarcasterSDK, isInFarcaster } from '../farcaster.js';
import { getPlayerPoints } from '../lib/game/points.js';
import { getRankByPoints } from '../lib/game/rankSystem.js';
import { getAccount } from '@wagmi/core';
import { wagmiAdapter } from '../wallet.js';

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
    return uniqueUrls([shareUrl, imageUrl], 1);
}

function getMainAppShareUrl() {
    return toAbsoluteUrl('/share');
}

function getMainAppEmbeds() {
    const shareUrl = getMainAppShareUrl();
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

function getCollectionShareText(collection) {
    const shareTextConfig = collection.farcaster?.shareText;

    if (Array.isArray(shareTextConfig) && shareTextConfig.length > 0) {
        return shareTextConfig[Math.floor(Math.random() * shareTextConfig.length)];
    }

    return shareTextConfig || null;
}

function getPlatformShareUrl(platform, slug) {
    if (platform === 'farcaster') return getCollectionShareUrl(slug);
    if (platform === 'web') return getCollectionShareUrl(slug);
    if (platform === 'x') return getCollectionMintUrl(slug);
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

    if (isInFarcaster()) {
        if (await tryComposeCast(text, embeds)) {
            return;
        }
        await openExternalUrl(intentUrl);
        return;
    }

    const shareData = {
        title: collection.name,
        text,
        url: fcUrl || baseAppUrl
    };

    try {
        if (navigator?.share) {
            await navigator.share(shareData);
            return;
        }

        await openExternalUrl(intentUrl);
    } catch (error) {
        if (error?.name !== 'AbortError') {
            console.error('Share failed:', error);
            const opened = await openExternalUrl(intentUrl);
            if (opened) return;

            const payload = buildClipboardPayload(text, fcUrl || baseAppUrl, openSeaUrl);
            if (imageUrl && !payload.includes(imageUrl)) {
                await copySharePayload(`${payload}\nImage: ${imageUrl}`);
            } else {
                await copySharePayload(payload);
            }
        }
    }
}

export async function shareReplayToFeed(battleId, won = false) {
    const origin = getAppOrigin();
    const url = `${origin}/battle?replay=${battleId}`;

    const account = getAccount(wagmiAdapter.wagmiConfig);
    const points = getPlayerPoints(account?.address);
    const rank = getRankByPoints(points);

    const text = won
        ? `I just won a battle in the NFT Arena.\n\nRank: ${rank.label}${rank.id === 'mythic' ? ' - Mythic' : ''}\n\nWatch the replay and try to beat my squad:`
        : `Check out this intense battle in the NFT Arena.\n\nCurrent Rank: ${rank.label}`;

    const embeds = [url];

    if (await tryComposeCast(text, embeds)) {
        return;
    }

    await openExternalUrl(buildComposeIntentUrl(text, embeds));
}

export async function shareCustomToFeed(text, url) {
    const embeds = url ? [url] : [];

    if (await tryComposeCast(text, embeds)) {
        return;
    }

    await openExternalUrl(buildComposeIntentUrl(text, embeds));
}

export async function shareChallengeToFeed(challengeId, collectionName) {
    const origin = getAppOrigin();
    const url = `${origin}/battle?challenge=${challengeId}`;

    const account = getAccount(wagmiAdapter.wagmiConfig);
    const points = getPlayerPoints(account?.address);
    const rank = getRankByPoints(points);

    const text = `I'm putting my ${collectionName} on the line.\n\nRank: ${rank.label}${rank.id === 'mythic' ? ' - Mythic' : ''}\n\nWho wants to challenge my NFT? Click below to fight:`;

    const embeds = [url];

    if (await tryComposeCast(text, embeds)) {
        return;
    }

    await openExternalUrl(buildComposeIntentUrl(text, embeds));
}

export function shareToTwitter(collection, customText = null) {
    const url = getPlatformShareUrl('web', collection.slug);
    const openSeaUrl = getOpenSeaUrl(collection);

    const configText = getCollectionShareText(collection);
    const baseText = customText || configText || `I'm minting ${collection.name} on Base!`;
    const text = appendOpenSeaText(baseText, openSeaUrl);

    const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(intentUrl, '_blank');
}

export async function shareAppToFeed() {
    const url = getMainAppShareUrl();
    const text = 'Check out Base Mint - NFT Battle Arena on Base. Pick your fighter and enter the arena.';
    const embeds = getMainAppEmbeds();

    if (await tryComposeCast(text, embeds)) {
        return;
    }

    await openExternalUrl(buildComposeIntentUrl(text, uniqueUrls([url], 1)));
}

/**
 * Check if a wallet (or FID) follows another FID on Farcaster.
 * Used for social combat synergies.
 *
 * NOTE: In production, this would query a Farcaster Hub or Neynar API.
 * For now, this only trusts session context hints or cached results.
 */
export async function isFarcasterFollower(targetFid = 309857) {
    if (!isInFarcaster()) return false;

    const sdk = getFarcasterSDK();
    const context = sdk?.context;
    const userFid = context?.user?.fid;

    if (!userFid) return false;
    const cacheKey = `fc_follow_${userFid}_${targetFid}`;

    try {
        const cached = localStorage.getItem(cacheKey);
        if (cached === '1') return true;
        if (cached === '0') return false;
    } catch { }

    const followsTarget = Boolean(
        context?.relationships?.following?.includes?.(targetFid) ||
        context?.socialGraph?.following?.includes?.(targetFid)
    );

    try {
        localStorage.setItem(cacheKey, followsTarget ? '1' : '0');
    } catch { }

    return followsTarget;
}

export function getFrameMetadata(battleId, challengeId = null) {
    const origin = getAppOrigin();
    if (challengeId) {
        return {
            'fc:frame': 'vNext',
            'fc:frame:image': `${origin}/api/og/challenge/${challengeId}`,
            'fc:frame:button:1': 'Accept Challenge',
            'fc:frame:button:1:action': 'post_redirect',
            'fc:frame:post_url': `${origin}/api/frame/challenge/${challengeId}`,
        };
    }
    return {
        'fc:frame': 'vNext',
        'fc:frame:image': `${origin}/api/og/battle/${battleId}`,
        'fc:frame:button:1': 'Watch Replay',
        'fc:frame:button:1:action': 'post_redirect',
        'fc:frame:button:2': 'Enter Arena',
        'fc:frame:button:2:action': 'post_redirect',
        'fc:frame:post_url': `${origin}/api/frame/battle/${battleId}`,
    };
}

export function getDominanceMessage(winCount, percentile = 72) {
    return `I just defeated ${percentile}% of players in the Arena.\n\nThink you can top that? Challenge me:`;
}
