/**
 * Team Snapshot & Synergy System
 * 
 * Deterministically sorts and slices the user's wallet inventory to max 20 NFTs
 * to compute consistent cross-collection synergy buffs.
 */

import { applyTeamSynergies } from '../game/engine.js';
import { createSnapshotHash } from './snapshot.js';

/**
 * Deterministically sorts a wallet inventory and returns the top 20 NFTs for team synergies.
 * Sorting logic prioritizes Fighters, then by Rarity/Stats, then alphabetically by collection/id.
 */
export function buildTeamSnapshot(walletNFTs = []) {
    if (!Array.isArray(walletNFTs)) return [];

    // Filter out invalid entries just in case
    const valid = walletNFTs.filter(n => n && n.engineId && n.nftId);

    // Sort to ensure determinism
    valid.sort((a, b) => {
        // 1. Fighters first
        const isFighterA = a.role === 'FIGHTER' ? 1 : 0;
        const isFighterB = b.role === 'FIGHTER' ? 1 : 0;
        if (isFighterA !== isFighterB) return isFighterB - isFighterA;

        // 2. Alphabetical by collection engineId
        const colA = String(a.engineId).toLowerCase();
        const colB = String(b.engineId).toLowerCase();
        if (colA !== colB) return colA.localeCompare(colB);

        // 3. Numerical by token ID
        const numA = parseInt(a.nftId, 10);
        const numB = parseInt(b.nftId, 10);
        if (!isNaN(numA) && !isNaN(numB)) {
            return numA - numB;
        }

        // 4. Alphabetical by token ID if not numerical
        return String(a.nftId).localeCompare(String(b.nftId));
    });

    return valid.slice(0, 20);
}

/**
 * Specifically calculates the bonus derived ONLY from the team snapshot,
 * comparing the fighter's base stats with the post-synergy stats.
 */
export function getTeamPassiveBonuses(baseFighter, teamSnapshot) {
    if (!teamSnapshot || teamSnapshot.length === 0) return {};

    // Clone base fighter to avoid mutating original during calculation
    const base = { ...baseFighter };
    const buffed = applyTeamSynergies({ ...baseFighter }, teamSnapshot);

    const bonuses = {};
    // Apply buffs at 60% face value as defined in V2 spec
    const multiplier = 0.6;

    if (buffed.hp > base.hp) bonuses.hp = Math.floor((buffed.hp - base.hp) * multiplier);
    if (buffed.atk > base.atk) bonuses.atk = Math.floor((buffed.atk - base.atk) * multiplier);
    if (buffed.def > base.def) bonuses.def = Math.floor((buffed.def - base.def) * multiplier);
    if (buffed.spd > base.spd) bonuses.spd = Math.floor((buffed.spd - base.spd) * multiplier);
    if (buffed.crit > base.crit) bonuses.crit = Number(((buffed.crit - base.crit) * multiplier).toFixed(3));
    if (buffed.dodge > base.dodge) bonuses.dodge = Number(((buffed.dodge - base.dodge) * multiplier).toFixed(3));
    if (buffed.lifesteal > base.lifesteal) bonuses.lifesteal = Number(((buffed.lifesteal - base.lifesteal) * multiplier).toFixed(3));

    return bonuses;
}

/**
 * Computes a secure hash covering both the final fighter stats AND the team snapshot state.
 * This guarantees the exact same loadout was used when the challenge was created vs fought.
 */
export async function computeCompleteSnapshotHash(finalFighterStats, teamSnapshot) {
    // Create a deterministic payload combining both elements
    const payload = {
        stats: finalFighterStats,
        teamIds: (teamSnapshot || []).map(t => `${t.engineId}_${t.nftId}`)
    };

    return await createSnapshotHash(payload);
}
