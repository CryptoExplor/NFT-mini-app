/**
 * Conversion & Retention Engine
 * Handles streaks, win tracking, and social prompts.
 */

const CONVERSION_STATE_KEY = 'arena_conversion_state';

/**
 * Gets the current conversion state for a player
 */
export function getConversionState(address) {
    if (!address) return null;
    const data = localStorage.getItem(`${CONVERSION_STATE_KEY}_${address}`);
    return data ? JSON.parse(data) : {
        lastWinDate: null,
        streak: 0,
        totalWins: 0,
        lastShareDate: null,
        lastPromptDate: null,
        milestones: []
    };
}

/**
 * Updates state after a battle result
 */
export function recordBattleResult(address, won) {
    if (!address) return null;
    const state = getConversionState(address);
    const now = new Date().toISOString().split('T')[0];

    if (won) {
        state.totalWins++;
        if (state.lastWinDate === now) {
            // Already recorded a win today — do NOT increment streak again.
            // Streak is day-based (consecutive days with at least one win),
            // not battle-count-based. This prevents prompt spam.
            if (state.streak === 0) {
                // A loss earlier today reset the streak. A new win should restart it at 1.
                state.streak = 1;
            }
        } else {
            // First win of a new day: advance streak and record the day.
            state.lastWinDate = now;
            state.streak++;
        }
    } else {
        // Any loss resets the streak.
        state.streak = 0;
        state.lastWinDate = null;
    }

    localStorage.setItem(`${CONVERSION_STATE_KEY}_${address}`, JSON.stringify(state));
    return state;
}

/**
 * Checks if we should show a share prompt
 */
export function shouldShowSharePrompt(address) {
    if (!address) return false;
    const state = getConversionState(address);
    const now = new Date().toISOString().split('T')[0];

    if (state.lastShareDate === now || state.lastPromptDate === now) {
        return false;
    }

    // Show if first win of the day OR streak milestone, but only once per day.
    const isFirstWinToday = state.lastWinDate === now;
    const isStreakMilestone = state.streak > 0 && state.streak % 3 === 0;

    if (!isFirstWinToday && !isStreakMilestone) {
        return false;
    }

    state.lastPromptDate = now;
    localStorage.setItem(`${CONVERSION_STATE_KEY}_${address}`, JSON.stringify(state));
    return true;
}

/**
 * Records that a share was attempted/completed
 */
export function recordShare(address) {
    if (!address) return;
    const state = getConversionState(address);
    state.lastShareDate = new Date().toISOString().split('T')[0];
    localStorage.setItem(`${CONVERSION_STATE_KEY}_${address}`, JSON.stringify(state));
}

/**
 * Gets a "Dominance" percentile based on score/wins
 * (Deterministic but looks organic)
 */
export function getDominancePercentile(score) {
    // Basic logic: score of 500 = 80th percentile, 1000 = 95th, etc.
    if (score < 100) return 40 + (score / 10);
    if (score < 500) return 60 + (score / 20);
    return Math.min(99, 85 + (score / 100));
}
