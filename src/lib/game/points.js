/**
 * Points & Leaderboard Logic
 * Manages player progression and competitive rankings.
 */

const POINTS_KEY = 'arena_points_v2';
const LEADERBOARD_KEY = 'arena_leaderboard_mock';

export function getPlayerPoints(address = 'Anonymous') {
    const data = localStorage.getItem(`${POINTS_KEY}_${address}`);
    return data ? parseInt(data, 10) : 0;
}

export function addPlayerPoints(address = 'Anonymous', pointsToAdd, battleId = null) {
    // Idempotency check for battles
    if (battleId) {
        const rewardKey = `reward_claimed_${battleId}`;
        if (localStorage.getItem(rewardKey)) {
            console.warn(`[Points] Reward already claimed for battle: ${battleId}`);
            return null;
        }
        localStorage.setItem(rewardKey, 'true');
    }

    const current = getPlayerPoints(address);
    const updated = current + pointsToAdd;
    localStorage.setItem(`${POINTS_KEY}_${address}`, updated.toString());
    
    // Sync with mock leaderboard
    updateMockLeaderboard(address, updated);
    
    return {
        previous: current,
        updated: updated,
        diff: pointsToAdd
    };
}

function updateMockLeaderboard(address, score) {
    let board = JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || '[]');
    const index = board.findIndex(entry => entry.address === address);
    
    if (index !== -1) {
        board[index].score = score;
    } else {
        board.push({ address, score });
    }
    
    // Sort and keep top 50
    board.sort((a, b) => b.score - a.score);
    board = board.slice(0, 50);
    
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(board));
}

export async function getGlobalLeaderboard() {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 300));
    const board = JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || '[]');
    
    // In production, this would be:
    // return await fetch('/api/leaderboard').then(r => r.json());
    
    return board;
}

export function getDailyBossLeaderboard(bossId) {
    // Mock daily leaderboard
    const key = `leaderboard_boss_${bossId}`;
    return JSON.parse(localStorage.getItem(key) || '[]');
}
