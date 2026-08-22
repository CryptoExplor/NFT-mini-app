/**
 * Points & Leaderboard Logic
 * Manages player progression and competitive rankings.
 */
import { storage } from '../../utils/storage.js';

const POINTS_KEY = 'arena_points_v2';
const LEADERBOARD_KEY = 'arena_leaderboard_mock';
const REWARD_CLAIM_PREFIX = 'reward_claimed_';
const MAX_REWARD_CLAIM_KEYS = 300;

export function getPlayerPoints(address = 'Anonymous') {
    const data = storage.getItem(`${POINTS_KEY}_${address}`);
    const parsed = parseInt(data, 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function addPlayerPoints(address = 'Anonymous', pointsToAdd, battleId = null) {
    // Idempotency check for battles
    if (battleId) {
        const rewardKey = `${REWARD_CLAIM_PREFIX}${battleId}`;
        if (storage.getItem(rewardKey)) {
            console.warn(`[Points] Reward already claimed for battle: ${battleId}`);
            return null;
        }
        storage.setItem(rewardKey, 'true');
        // One marker per battle was written and never removed, so this grew
        // forever and eventually hit the storage quota.
        storage.pruneKeys(REWARD_CLAIM_PREFIX, MAX_REWARD_CLAIM_KEYS);
    }

    const current = getPlayerPoints(address);
    const safeDelta = Number.isFinite(Number(pointsToAdd)) ? Number(pointsToAdd) : 0;
    const updated = current + safeDelta;
    storage.setItem(`${POINTS_KEY}_${address}`, updated.toString());
    
    // Sync with mock leaderboard
    updateMockLeaderboard(address, updated);
    
    return {
        previous: current,
        updated: updated,
        diff: pointsToAdd
    };
}

function updateMockLeaderboard(address, score) {
    let board = storage.getJSON(LEADERBOARD_KEY, []);
    if (!Array.isArray(board)) board = [];
    const index = board.findIndex(entry => entry.address === address);
    
    if (index !== -1) {
        board[index].score = score;
    } else {
        board.push({ address, score });
    }
    
    // Sort and keep top 50
    board.sort((a, b) => b.score - a.score);
    board = board.slice(0, 50);
    
    storage.setJSON(LEADERBOARD_KEY, board);
}

export async function getGlobalLeaderboard() {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 300));
    const board = storage.getJSON(LEADERBOARD_KEY, []);
    
    // In production, this would be:
    // return await fetch('/api/leaderboard').then(r => r.json());
    
    return board;
}

export function getDailyBossLeaderboard(bossId) {
    // Mock daily leaderboard
    const key = `leaderboard_boss_${bossId}`;
    return storage.getJSON(key, []);
}
