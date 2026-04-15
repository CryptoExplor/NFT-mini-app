/**
 * V2 Battle Engine Wrapper
 *
 * Full-featured wrapper around the core engine with ALL systems enabled:
 * - Item synergies
 * - Arena/environment effects
 * - Team snapshot passives
 * - Seeded PRNG for deterministic replays
 *
 * Used for:
 *   - V2 AI battles (local)
 *   - V2 PvP battles (server-side)
 *   - Replay verification
 *
 * DO NOT modify engine.js directly. Use this wrapper to control options.
 */

import { simulateBattle } from '../game/engine.js';
import { createPRNG } from './prng.js';

/**
 * Full V2 battle simulation.
 *
 * @param {Object} playerStats - Normalized fighter stats (post-layer application)
 * @param {Object} enemyStats  - Normalized fighter stats (post-layer application)
 * @param {Object} [opts]      - V2 battle options
 * @param {Object}   [opts.playerItem]    - Normalized item stats for player (or null)
 * @param {Object}   [opts.enemyItem]     - Normalized item stats for enemy (or null)
 * @param {Object}   [opts.environment]   - Normalized arena stats (or null)
 * @param {Array}    [opts.playerTeam]    - Player team snapshot (max 20 NFTs)
 * @param {Array}    [opts.enemyTeam]     - Enemy team snapshot (max 20 NFTs)
 * @param {string}   [opts.playerPassive] - Player passive ability key (or null)
 * @param {string}   [opts.enemyPassive]  - Enemy passive ability key (or null)
 * @param {string}   [opts.seed]          - Seed string for deterministic PRNG
 * @param {Function} [opts.prng]          - Custom PRNG function (overrides seed)
 * @param {boolean}  [opts.isAiBattle]    - Whether enemy is AI
 * @param {number}   [opts.aiWinRate]     - AI win probability (0-1, default 0.6)
 * @returns {Object} { winner, winnerSide, totalRounds, logs }
 */
export function simulateBattleV2(playerStats, enemyStats, opts = {}) {
    // Resolve PRNG: explicit function > seed string > Math.random
    let prng;
    if (typeof opts.prng === 'function') {
        prng = opts.prng;
    } else if (opts.seed) {
        prng = createPRNG(opts.seed);
    } else {
        prng = Math.random;
    }

    return simulateBattle(playerStats, enemyStats, prng, {
        // V2 systems — all enabled
        playerItem: opts.playerItem || null,
        enemyItem: opts.enemyItem || null,
        environment: opts.environment || null,
        playerTeam: opts.playerTeam || [],
        enemyTeam: opts.enemyTeam || [],
        playerPassive: opts.playerPassive || null,
        enemyPassive: opts.enemyPassive || null,

        // AI settings
        isAiBattle: opts.isAiBattle ?? false,
        aiWinRate: opts.aiWinRate ?? 0.6,
    });
}
