/**
 * Matchmaking API Client
 * Connects to global Vercel KV backend to load and post challenges.
 */

// We import ARENA for the expiry time fallback just in case
import { ARENA } from '../battle/balanceConfig.js';
import { signMessage } from '@wagmi/core';
import { wagmiAdapter } from '../../wallet.js';

let battleAuthToken = null;
let tokenExpiry = 0;

async function getBattleToken(walletAddress) {
    if (battleAuthToken && Date.now() < tokenExpiry) return battleAuthToken;

    try {
        const chainId = wagmiAdapter.wagmiConfig.state?.chainId || 8453;

        // 1. Get Nonce
        const nonceRes = await fetch(`/api/auth/nonce?address=${walletAddress}`);
        const nonceData = await nonceRes.json();
        if (!nonceData?.nonce) throw new Error('Failed to get nonce');

        // 2. Construct SIWE Message
        const domain = window.location.host;
        const origin = window.location.origin;
        const issuedAt = new Date().toISOString();
        const message = `${domain} wants you to sign in with your Ethereum account:\n${walletAddress}\n\nSign in to Battle Arena\n\nURI: ${origin}\nVersion: 1\nChain ID: ${chainId}\nNonce: ${nonceData.nonce}\nIssued At: ${issuedAt}`;

        // 3. Sign Message
        const signature = await signMessage(wagmiAdapter.wagmiConfig, { message });

        // 4. Verify & Get Token
        const verifyRes = await fetch('/api/auth/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, signature })
        });
        const verifyData = await verifyRes.json();

        if (verifyData?.token) {
            battleAuthToken = verifyData.token;
            // Track expiry (server returns expiresIn in seconds)
            tokenExpiry = Date.now() + ((verifyData.expiresIn || 3600) * 1000) - 60000; // 1min safety margin
            return battleAuthToken;
        }
        throw new Error('Verification failed format');
    } catch (e) {
        console.error('Battle Auth Error:', e);
        throw e;
    }
}
/**
 * Gets all active player-posted challenges from the global API.
 */
export async function getActiveChallenges() {
    try {
        const res = await fetch('/api/battle/challenge');
        if (!res.ok) throw new Error('Failed to fetch challenges');

        const data = await res.json();

        // Filter expired challenges locally as well just in case
        const now = Date.now();
        return (data.challenges || []).filter(c => !c.expiresAt || c.expiresAt > now);
    } catch (e) {
        console.error('Failed to load global challenges', e);
        return [];
    }
}

/**
 * Posts a new challenge to the global API.
 * @param {string} playerAddress - The wallet address of the poster
 * @param {Object} loadout - The BattleLoadoutV1 object
 */
export async function postChallenge(playerAddress, loadout) {
    try {
        const token = await getBattleToken(playerAddress);

        const res = await fetch('/api/battle/challenge', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                loadout: loadout,
                fighterStats: loadout.fighter?.stats || {},
            })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to post challenge');
        }

        return await res.json();
    } catch (e) {
        console.error('API Error posting challenge:', e);
        throw e;
    }
}

/**
 * Gets a challenge by ID (fetch from active list)
 */
export async function getChallengeById(challengeId) {
    const challenges = await getActiveChallenges();
    return challenges.find(c => c.id === challengeId) || null;
}

/**
 * Execute a fight against a challenge
 */
export async function resolveFight(challengeId, attackerAddress, loadout) {
    try {
        const token = await getBattleToken(attackerAddress);

        // V2 API expects { challengeId, defenderLoadout }
        const res = await fetch('/api/battle/fight', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                challengeId,
                defenderLoadout: loadout,
            })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || err.error || 'Battle failed on server');
        }

        return await res.json();
    } catch (e) {
        console.error('Battle resolution error:', e);
        throw e;
    }
}

/**
 * Legacy Challenge Compatibility Layer (V1 Task 9)
 * Converts pre-V1 challenge shapes to BattleLoadoutV1 in memory.
 * No destructive migration — old and new records coexist.
 */
export function readLegacyChallenge(raw) {
    if (!raw) return null;

    // Already V2 format
    if (raw.schemaVersion === 'battle-loadout-v1' && raw.loadout) return raw;

    // Convert legacy { collectionName, nftId, stats, ... } to V1 shape
    return {
        ...raw,
        loadout: {
            fighter: {
                collectionSlug: raw.collectionId || raw.collectionName || 'unknown',
                collectionName: raw.collectionName || raw.collectionId || 'Unknown',
                tokenId: String(raw.nftId || raw.tokenId || '0'),
                nftId: String(raw.nftId || raw.tokenId || '0'),
                attributes: raw.rawAttributes || raw.traits || [],
                imageUrl: raw.imageUrl || raw.image || '',
                stats: raw.stats || {},
                role: 'FIGHTER',
            },
            item: null,
            arena: null,
            teamSnapshot: [],
            schemaVersion: 'battle-loadout-v1',
        },
        schemaVersion: 'battle-loadout-v1',
    };
}

/**
 * Clear cached auth token (call on wallet disconnect)
 */
export function clearBattleAuth() {
    battleAuthToken = null;
    tokenExpiry = 0;
}
