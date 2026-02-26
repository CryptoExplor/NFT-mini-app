/**
 * Matchmaking API Client
 * Connects to global Vercel KV backend to load and post challenges.
 */

// We import ARENA for the expiry time fallback just in case
import { ARENA } from '../battle/balanceConfig.js';
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
 * @param {Object} selectedNft - The specific NFT selected for combat
 * @param {Array} playerTeam - The full wallet inventory of the poster
 */
export async function postChallenge(playerAddress, selectedNft, playerTeam = []) {
    try {
        const res = await fetch('/api/battle/challenge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userAddress: playerAddress,
                collectionId: selectedNft.engineId, // Pass the engineId for the normalizer
                collectionName: selectedNft.collectionName,
                nftId: selectedNft.nftId,
                rawMetadata: selectedNft.rawAttributes || []
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
export async function resolveFight(challengeId, attackerAddress, selectedNft) {
    try {
        // Send resolution request to the secure backend engine
        const res = await fetch('/api/battle/fight', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                challengeId,
                attackerAddress,
                attackerCollectionId: selectedNft.engineId,
                attackerTokenId: selectedNft.nftId,
                rawMetadata: selectedNft.rawAttributes || []
            })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Battle failed on server');
        }

        return await res.json();
    } catch (e) {
        console.error('Battle resolution error:', e);
        throw e;
    }
}
