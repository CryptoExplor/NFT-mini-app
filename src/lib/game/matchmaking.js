/**
 * Matchmaking KV Storage (Mock Backend)
 * 
 * Uses LocalStorage as a temporary Key-Value store to hold user-posted challenges.
 * In a production environment, this would hit an actual database or Redis KV.
 * 
 * V2 Schema: challenges now include snapshot hash, passive ability, and expiry.
 */

import { createSnapshotHash } from '../battle/snapshot.js';
import { ARENA } from '../battle/balanceConfig.js';

const KV_KEY = 'miniapp_battle_challenges';

function loadKV() {
    try {
        const data = localStorage.getItem(KV_KEY);
        if (data) {
            const challenges = JSON.parse(data);
            // Filter expired challenges
            const now = Date.now();
            return challenges.filter(c => !c.expiresAt || c.expiresAt > now);
        }
    } catch (e) {
        console.error('Failed to parse KV challenges', e);
    }
    return [];
}

function saveKV(challenges) {
    try {
        const trimmed = challenges.slice(0, ARENA.MAX_ACTIVE_CHALLENGES);
        localStorage.setItem(KV_KEY, JSON.stringify(trimmed));
    } catch (e) {
        console.error('Failed to save KV challenges', e);
    }
}

/**
 * Gets all active player-posted challenges from the KV store.
 */
export async function getActiveChallenges() {
    await new Promise(res => setTimeout(res, 200));
    return loadKV();
}

/**
 * Posts a new challenge to the KV store.
 * @param {string} playerAddress - The wallet address of the poster
 * @param {Object} selectedNft - The specific NFT selected for combat (must be normalized)
 * @param {Array} playerTeam - The full wallet inventory of the poster (for synergies)
 */
export async function postChallenge(playerAddress, selectedNft, playerTeam = []) {
    await new Promise(res => setTimeout(res, 300));

    const challenges = loadKV();

    // Create snapshot hash of the fighter's stats at challenge time
    let snapshotHash = null;
    if (selectedNft.stats) {
        try {
            snapshotHash = await createSnapshotHash(selectedNft.stats);
        } catch (e) {
            console.warn('Failed to create snapshot hash', e);
        }
    }

    const newChallenge = {
        id: `challenge_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        // V2 schema version
        schemaVersion: 2,
        // Player info
        player: playerAddress || 'Anonymous',
        // Fighter info
        collectionName: selectedNft.collectionName,
        nftId: selectedNft.nftId,
        stats: selectedNft.stats,
        trait: selectedNft.trait || 'Standard',
        imageUrl: selectedNft.imageUrl || '',
        passive: selectedNft.passive || selectedNft.stats?.passive || null,
        // Anti-cheat
        snapshotHash,
        // Team synergies (V2)
        teamSynergies: playerTeam,
        // Metadata
        isAi: false,
        timestamp: Date.now(),
        expiresAt: Date.now() + ARENA.CHALLENGE_EXPIRY_MS,
    };

    challenges.unshift(newChallenge);
    saveKV(challenges);

    return newChallenge;
}

/**
 * Removes a challenge (e.g., after it has been fought or cancelled)
 */
export async function removeChallenge(challengeId) {
    let challenges = loadKV();
    challenges = challenges.filter(c => c.id !== challengeId);
    saveKV(challenges);
}

/**
 * Gets a challenge by ID for validation before fight.
 */
export async function getChallengeById(challengeId) {
    const challenges = loadKV();
    return challenges.find(c => c.id === challengeId) || null;
}
