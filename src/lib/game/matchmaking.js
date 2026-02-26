/**
 * Matchmaking KV Storage (Mock Backend)
 * 
 * Uses LocalStorage as a temporary Key-Value store to hold user-posted challenges.
 * In a production environment, this would hit an actual database or Redis KV.
 */

const KV_KEY = 'miniapp_battle_challenges';

function loadKV() {
    try {
        const data = localStorage.getItem(KV_KEY);
        if (data) return JSON.parse(data);
    } catch (e) {
        console.error('Failed to parse KV challenges', e);
    }
    return [];
}

function saveKV(challenges) {
    try {
        // Keep only the 20 most recent challenges to prevent bloat
        const trimmed = challenges.slice(0, 20);
        localStorage.setItem(KV_KEY, JSON.stringify(trimmed));
    } catch (e) {
        console.error('Failed to save KV challenges', e);
    }
}

/**
 * Gets all active player-posted challenges from the KV store.
 */
export async function getActiveChallenges() {
    // Simulated network delay
    await new Promise(res => setTimeout(res, 300));
    return loadKV();
}

/**
 * Posts a new challenge to the KV store.
 * @param {string} playerAddress - The wallet address of the poster
 * @param {Object} selectedNft - The specific NFT selected for combat
 * @param {Array} playerTeam - The full wallet inventory of the poster (for synergies)
 */
export async function postChallenge(playerAddress, selectedNft, playerTeam = []) {
    // Simulated network delay
    await new Promise(res => setTimeout(res, 400));

    const challenges = loadKV();

    const newChallenge = {
        id: `challenge_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        player: playerAddress || 'Anonymous',
        collectionName: selectedNft.collectionName,
        nftId: selectedNft.nftId,
        stats: selectedNft.stats, // Assumes normalized
        trait: selectedNft.trait || 'Standard',
        imageUrl: selectedNft.imageUrl || '',
        teamSynergies: playerTeam, // The synergy payload
        isAi: false,
        timestamp: Date.now()
    };

    // Unshift to put newest at the top
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
