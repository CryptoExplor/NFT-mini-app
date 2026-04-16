import { getCollectionProfile } from './collectionProfiles.js';
import { STAT_CAPS, STAT_FLOORS, COLLECTION_PASSIVES, TRAIT_PASSIVE_OVERRIDES } from './balanceConfig.js';

/**
 * Unified Normalization Engine
 * 
 * Takes raw NFT metadata and standardizes it based on the strict rules 
 * defined in collectionProfiles.js. Uses centralized balance caps from balanceConfig.js.
 */

/**
 * Main Normalizer Entry Point
 * @param {string} collectionId - ID from collectionProfiles.js
 * @param {string} tokenId - ID of the token
 * @param {Array} rawAttributes - OpenSea standard attributes array
 * @returns {Object} Standardized fighter stats with passive ability
 */
export function normalizeFighter(collectionId, tokenId, rawAttributes) {
    const profile = getCollectionProfile(collectionId);

    if (!profile) {
        throw new Error(`Collection ${collectionId} not supported.`);
    }

    // Clone base stats so we don't mutate the constant
    const stats = {
        hp: profile.baseStats.hp || 100,
        atk: profile.baseStats.atk || 10,
        def: profile.baseStats.def || 10,
        spd: profile.baseStats.spd || 10,
        crit: 0.05,
        dodge: 0,
        affinity: null,
        lifesteal: 0,
        regen: 0,
        image: `placeholder_url_for_${tokenId}`,
        source: collectionId,
        tokenId: tokenId,
        name: `${profile.name} #${tokenId}`
    };

    if (profile.statSource === 'STATIC_METADATA') {
        applyMetadataTraits(stats, profile, rawAttributes);
    }

    // Resolve passive ability
    stats.passive = resolvePassiveForFighter(collectionId, rawAttributes);

    // IN V2: WE NO LONGER CLAMP HERE. 
    // We clamp AFTER all layers (items/arenas/synergies) are applied in applyLayer()
    return stats;
}

/**
 * Normalizes an ITEM_BUFF NFT into a set of stat modifiers.
 */
export function normalizeItemStats(collectionId, tokenId, rawAttributes) {
    const profile = getCollectionProfile(collectionId);
    if (!profile || profile.role !== 'ITEM_BUFF') return null;

    // Items provide differential stat buffs
    const buffs = { hp: 0, atk: 0, def: 0, spd: 0, crit: 0, dodge: 0, lifesteal: 0, regen: 0 };

    // In V2 MVP, we'll do simple trait parsing similar to fighters
    if (profile.statSource === 'STATIC_METADATA' || profile.statSource === 'DYNAMIC_ONCHAIN') {
        if (profile.traitsMap) {
            for (const [traitType, traitConfig] of Object.entries(profile.traitsMap)) {
                const value = getTrait(rawAttributes, traitType);
                if (value && traitConfig[value]) {
                    const mods = traitConfig[value];
                    if (mods.hp) buffs.hp += mods.hp;
                    if (mods.atk) buffs.atk += mods.atk;
                    if (mods.def) buffs.def += mods.def;
                    if (mods.spd) buffs.spd += mods.spd;
                    if (mods.crit) buffs.crit += mods.crit;
                    if (mods.dodge) buffs.dodge += mods.dodge;
                    if (mods.lifesteal) buffs.lifesteal += mods.lifesteal;
                    if (mods.regen) buffs.regen += mods.regen;
                }
            }
        }
    }

    // Default fallback buffs if no traits match
    if (collectionId === 'neon-runes' && buffs.atk === 0) buffs.atk += 10;
    if (collectionId === 'bytebeats' && buffs.spd === 0) buffs.spd += 10;
    if (collectionId === 'neon-shapes' && buffs.def === 0) buffs.def += 10;

    return buffs;
}

/**
 * Normalizes an ENVIRONMENT NFT into arena-wide or personal modifiers.
 */
export function normalizeArenaStats(collectionId, tokenId, rawAttributes) {
    const profile = getCollectionProfile(collectionId);
    if (!profile || profile.role !== 'ENVIRONMENT') return null;

    // Environments might provide global rules or specific stat boosts
    const buffs = { hp: 0, atk: 0, def: 0, spd: 0, crit: 0, dodge: 0, lifesteal: 0, regen: 0 };

    if (collectionId === 'mini-worlds') {
        buffs.hp += 25; // Example environmental blessing
    }

    return buffs;
}

/**
 * Applies a buff layer (from an Item, Arena, or Synergy) onto a base fighter.
 * Clamps the final result to ensure balance ceilings are respected.
 *
 * @param {Object} baseStats  - Current fighter stats
 * @param {Object} buffLayer  - Stat modifiers to apply
 * @param {number} [scale=1]  - Diminishing returns factor:
 *                              Items = 1.0 (full value)
 *                              Arena = 0.8 (diminishing)
 *                              Team  = 0.6 (diminishing)
 * @returns {Object} New stats object with buffs applied and caps enforced
 */
export function applyLayer(baseStats, buffLayer, scale = 1) {
    if (!buffLayer) return clampStats({ ...baseStats });

    const s = Math.max(0, Math.min(1, scale)); // Clamp scale to [0, 1]
    const combined = { ...baseStats };
    if (buffLayer.hp) combined.hp += Math.round(buffLayer.hp * s);
    if (buffLayer.atk) combined.atk += Math.round(buffLayer.atk * s);
    if (buffLayer.def) combined.def += Math.round(buffLayer.def * s);
    if (buffLayer.spd) combined.spd += Math.round(buffLayer.spd * s);
    if (buffLayer.crit) combined.crit += buffLayer.crit * s;
    if (buffLayer.dodge) combined.dodge += buffLayer.dodge * s;
    if (buffLayer.lifesteal) combined.lifesteal += buffLayer.lifesteal * s;
    if (buffLayer.regen) combined.regen += Math.round(buffLayer.regen * s);

    return clampStats(combined);
}

function getTrait(attributes, traitType) {
    if (!attributes || !Array.isArray(attributes)) return null;
    const trait = attributes.find(a => a.trait_type === traitType);
    return trait ? trait.value : null;
}

/**
 * Parses the raw traits through the profile's traitsMap rules
 */
function applyMetadataTraits(stats, profile, attributes) {
    if (!profile.traitsMap) return;

    for (const [traitType, traitConfig] of Object.entries(profile.traitsMap)) {
        const value = getTrait(attributes, traitType);
        if (value && traitConfig[value]) {
            const modifiers = traitConfig[value];

            if (modifiers.hp) stats.hp += modifiers.hp;
            if (modifiers.atk) stats.atk += modifiers.atk;
            if (modifiers.def) stats.def += modifiers.def;
            if (modifiers.spd) stats.spd += modifiers.spd;
            if (modifiers.crit) stats.crit += modifiers.crit;
            if (modifiers.dodge) stats.dodge += modifiers.dodge;
            if (modifiers.lifesteal) stats.lifesteal += modifiers.lifesteal;
            if (modifiers.regen) stats.regen += modifiers.regen;
        }
    }
}

/**
 * Resolves passive ability for a fighter based on collection and trait overrides.
 */
function resolvePassiveForFighter(collectionId, rawAttributes) {
    // Check trait-level overrides first
    if (rawAttributes && Array.isArray(rawAttributes)) {
        for (const attr of rawAttributes) {
            const override = TRAIT_PASSIVE_OVERRIDES[attr.value];
            if (override) return override;
        }
    }
    // Fall back to collection default
    return COLLECTION_PASSIVES[collectionId] || null;
}

/**
 * Ensures no stat exceeds the global caps or falls below floors (from balanceConfig).
 * Exported so the UI can enforce caps on final loadouts before presentation.
 */
export function clampStats(stats) {
    stats.hp = Math.min(Math.max(stats.hp, STAT_FLOORS.hp), STAT_CAPS.hp);
    stats.atk = Math.min(Math.max(stats.atk, STAT_FLOORS.atk), STAT_CAPS.atk);
    stats.def = Math.min(Math.max(stats.def, STAT_FLOORS.def), STAT_CAPS.def);
    stats.spd = Math.min(Math.max(stats.spd, STAT_FLOORS.spd), STAT_CAPS.spd);
    stats.crit = Math.min(Math.max(stats.crit, STAT_FLOORS.crit), STAT_CAPS.crit);
    stats.dodge = Math.min(Math.max(stats.dodge, STAT_FLOORS.dodge), STAT_CAPS.dodge);
    stats.lifesteal = Math.min(Math.max(stats.lifesteal, STAT_FLOORS.lifesteal), STAT_CAPS.lifesteal);
    stats.regen = Math.min(Math.max(stats.regen || 0, STAT_FLOORS.regen || 0), STAT_CAPS.regen || 15);

    // Flatten floats to 2 decimals for predictability
    stats.crit = Number(stats.crit.toFixed(2));
    stats.dodge = Number(stats.dodge.toFixed(2));
    stats.lifesteal = Number(stats.lifesteal.toFixed(2));

    return stats;
}

