
const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Track a successful mint
 * @param {string} wallet - Wallet address
 * @param {string} collection - Collection slug
 * @param {string} txHash - Transaction hash
 */
export async function trackMint(wallet, collection, txHash) {
    try {
        await fetch(`${API_BASE}/api/track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet, collection, txHash })
        });
    } catch (error) {
        console.error('Failed to track mint:', error);
    }
}

/**
 * Get global leaderboard and stats
 * @returns {Promise<Object>} Leaderboard data
 */
export async function getLeaderboard() {
    try {
        const response = await fetch(`${API_BASE}/api/leaderboard`);
        if (!response.ok) throw new Error('Failed to fetch leaderboard');
        return await response.json();
    } catch (error) {
        console.error('Failed to fetch leaderboard:', error);
        return null;
    }
}

/**
 * Get user stats
 * @param {string} wallet - Wallet address
 * @returns {Promise<Object>} User data
 */
export async function getUserStats(wallet) {
    if (!wallet) return null;
    try {
        const response = await fetch(`${API_BASE}/api/user?wallet=${wallet}`);
        if (!response.ok) throw new Error('Failed to fetch user stats');
        return await response.json();
    } catch (error) {
        console.error('Failed to fetch user stats:', error);
        return null;
    }
}
