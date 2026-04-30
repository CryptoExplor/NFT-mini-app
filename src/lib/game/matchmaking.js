/**
 * Matchmaking API Client
 * Connects to global Vercel KV backend to load and post challenges.
 *
 * Auth strategy (context-aware):
 *   Farcaster miniapp → sdk.actions.signIn() (silent, zero popup)
 *   Base App / Web    → wagmi signMessage (SIWE, one-time popup per session)
 */

import { signMessage } from '@wagmi/core';
import { wagmiAdapter } from '../../wallet.js';
import { getBattleHistory as fetchBattleHistory } from '../api.js';
import { isInMiniApp, isInFarcasterClient, getFarcasterSDK } from '../../farcaster.js';

let tokenExpiry = 0;
let battleAuthToken = null;

function buildBattleRequestInit(init = {}) {
    const headers = { ...(init.headers || {}) };
    if (battleAuthToken) {
        headers.Authorization = `Bearer ${battleAuthToken}`;
    }

    return {
        ...init,
        headers,
        credentials: 'include',
    };
}

async function fetchWithBattleAuth(walletAddress, url, init = {}) {
    await getBattleToken(walletAddress);

    let response = await fetch(url, buildBattleRequestInit(init));
    if (response.status === 401 || response.status === 403) {
        tokenExpiry = 0;
        battleAuthToken = null;
        await getBattleToken(walletAddress, { forceRefresh: true });
        response = await fetch(url, buildBattleRequestInit(init));
    }

    return response;
}

// ── Farcaster Silent Auth ──────────────────────────────────────────────
// Uses sdk.actions.signIn() which produces a standard EIP-4361 message
// signed by the user's custody address — zero wallet popup.
async function getFarcasterToken(walletAddress, nonce) {
    const sdk = getFarcasterSDK();
    if (!sdk?.actions?.signIn) {
        throw new Error('Farcaster SDK signIn unavailable');
    }

    const result = await sdk.actions.signIn({ nonce, acceptAuthAddress: true });
    if (!result?.message || !result?.signature) {
        throw new Error('Farcaster signIn returned empty result');
    }

    return { message: result.message, signature: result.signature };
}

// ── Standard SIWE Auth (Web / Base App) ────────────────────────────────
async function getSiweToken(walletAddress, nonce) {
    const chainId = wagmiAdapter.wagmiConfig.state?.chainId || 8453;
    const domain = window.location.host;
    const origin = window.location.origin;
    const issuedAt = new Date().toISOString();
    const message = `${domain} wants you to sign in with your Ethereum account:\n${walletAddress}\n\nSign in to Battle Arena\n\nURI: ${origin}\nVersion: 1\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${issuedAt}`;

    const signature = await signMessage(wagmiAdapter.wagmiConfig, { message });
    return { message, signature };
}

// ── Unified Token Acquisition ──────────────────────────────────────────
async function getBattleToken(walletAddress, { forceRefresh = false } = {}) {
    if (!forceRefresh && Date.now() < tokenExpiry) return true;

    try {
        // 1. Get Nonce from server
        const nonceRes = await fetch(`/api/auth?action=nonce&address=${walletAddress}`);
        const nonceData = await nonceRes.json();
        if (!nonceData?.nonce) throw new Error('Failed to get nonce');

        // 2. Sign — pick strategy by context
        const useFarcasterAuth = isInMiniApp() && isInFarcasterClient();
        const { message, signature } = useFarcasterAuth
            ? await getFarcasterToken(walletAddress, nonceData.nonce)
            : await getSiweToken(walletAddress, nonceData.nonce);

        // 3. Verify & Get Token
        const verifyRes = await fetch('/api/auth?action=verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ message, signature })
        });
        const verifyData = await verifyRes.json();

        if (verifyData?.address) {
            battleAuthToken = typeof verifyData.token === 'string' ? verifyData.token : battleAuthToken;
            tokenExpiry = Number.isFinite(verifyData.expiresAt) ? verifyData.expiresAt : Date.now() + 3540000;
            return true;
        }
        throw new Error('Verification failed format');
    } catch (e) {
        console.error('Battle Auth Error:', e);
        throw e;
    }
}

/**
 * Pre-authenticate before battle starts.
 * Call this on the loadout/preview screen so the wallet popup (if any)
 * happens BEFORE the fight — never after the dopamine moment.
 *
 * In Farcaster miniapp context this is completely silent (no popup).
 * Returns true if auth succeeded, throws on failure.
 */
export async function ensureBattleAuth(walletAddress) {
    if (!walletAddress) return false;
    return getBattleToken(walletAddress, { forceRefresh: false });
}

/**
 * Gets all active player-posted challenges from the global API.
 */
export async function getActiveChallenges() {
    try {
        const res = await fetch('/api/battle?action=challenge');
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
        const res = await fetchWithBattleAuth(playerAddress, '/api/battle?action=challenge', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
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
        const res = await fetchWithBattleAuth(attackerAddress, '/api/battle?action=fight', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
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
 * Get battle history for a player
 */
export async function getBattleHistory(walletAddress) {
    return fetchBattleHistory(walletAddress, 50);
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
    tokenExpiry = 0;
    battleAuthToken = null;
}

/**
 * Record an AI battle result on the server.
 * AI battles are simulated locally — this persists them so they appear
 * in the verifiable history tab.
 *
 * Fire-and-forget: auth failure or network error is swallowed so the
 * battle UI is never blocked.
 *
 * @param {string} walletAddress
 * @param {{ playerStats, enemyStats, result, loadout }} battle
 */
export async function recordAiBattle(walletAddress, { seed, playerStats, enemyStats, result, loadout, extras, logs }) {
    if (!walletAddress) return;

    try {
        // If no seed provided, fallback to deterministic (though battle.js should provide it)
        const finalSeed = seed || `ai:${walletAddress}:${playerStats.name}:${enemyStats.name}:${Date.now()}`;

        const response = await fetchWithBattleAuth(walletAddress, '/api/battle?action=record', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                seed: finalSeed,
                p1: {
                    name: playerStats.name,
                    stats: playerStats,
                    item: loadout?.item?.stats || null,
                    arena: loadout?.arena?.stats || null,
                    team: loadout?.teamSnapshot || [],
                },
                p2: {
                    name: enemyStats.name,
                    stats: enemyStats,
                },
                options: { isAiBattle: true },
                result: {
                    winnerSide: result.winnerSide,
                    winnerName: result.winner,
                    rounds: result.totalRounds || 0,
                },
                // Pre-computed stats so the leaderboard doesn't re-simulate with the wrong engine
                extras: extras || null,
                // Store logs for replays
                logs: logs || []
            }),
        });

        if (!response.ok) {
            throw new Error(`AI battle record failed (${response.status})`);
        }

        return await response.json().catch(() => null);

    } catch (err) {
        // Non-blocking — never surface to user
        console.warn('[recordAiBattle] Failed to persist AI battle result:', err.message);
        return null;
    }
}
