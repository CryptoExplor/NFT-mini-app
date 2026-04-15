/**
 * Simple Battle Engine Wrapper — MVP Mode
 *
 * Thin wrapper around the full engine for 1v1 battles with no items,
 * no arena, no team synergies.
 *
 * Rules:
 *   - 1v1 only
 *   - No items, no arena, no team
 *   - Speed decides who goes first
 *   - Damage = max(1, atk - def * 0.5)
 *   - Crit = 1.5x
 *   - Max 20 turns (override from balanceConfig)
 *
 * NEVER modify the original engine.js directly.
 * This wrapper calls it internally with all V2 options disabled.
 */

import { simulateBattle } from '../game/engine.js';

/**
 * Simplified battle interface for MVP.
 *
 * @param {Object} playerStats - Normalized fighter stats (from metadataNormalizer.normalizeFighter)
 * @param {Object} enemyStats  - Normalized fighter stats (or AI-generated)
 * @param {Object} [opts]      - Optional overrides
 * @param {Function} [opts.prng]       - PRNG function (defaults to Math.random)
 * @param {boolean}  [opts.isAiBattle] - Whether enemy is AI (enables win-rate tuning)
 * @param {number}   [opts.aiWinRate]  - AI win probability (0-1, default 0.6)
 * @returns {Object} { winner, winnerSide, totalRounds, logs }
 */
export function simulateBattleSimple(playerStats, enemyStats, opts = {}) {
    const prng = typeof opts.prng === 'function' ? opts.prng : Math.random;

    // Call the full engine with all V2 systems explicitly disabled
    return simulateBattle(playerStats, enemyStats, prng, {
        // V2 systems — all DISABLED for MVP
        playerItem: null,
        enemyItem: null,
        environment: null,
        playerTeam: [],
        enemyTeam: [],
        playerPassive: null,
        enemyPassive: null,

        // AI settings — passthrough
        isAiBattle: opts.isAiBattle ?? false,
        aiWinRate: opts.aiWinRate ?? 0.6,
    });
}
