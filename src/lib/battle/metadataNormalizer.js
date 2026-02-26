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

    return clampStats(stats);
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
 */
function clampStats(stats) {
    stats.hp = Math.min(Math.max(stats.hp, STAT_FLOORS.hp), STAT_CAPS.hp);
    stats.atk = Math.min(Math.max(stats.atk, STAT_FLOORS.atk), STAT_CAPS.atk);
    stats.def = Math.min(Math.max(stats.def, STAT_FLOORS.def), STAT_CAPS.def);
    stats.spd = Math.min(Math.max(stats.spd, STAT_FLOORS.spd), STAT_CAPS.spd);
    stats.crit = Math.min(Math.max(stats.crit, STAT_FLOORS.crit), STAT_CAPS.crit);
    stats.dodge = Math.min(Math.max(stats.dodge, STAT_FLOORS.dodge), STAT_CAPS.dodge);
    stats.lifesteal = Math.min(Math.max(stats.lifesteal, STAT_FLOORS.lifesteal), STAT_CAPS.lifesteal);

    // Flatten floats to 2 decimals for predictability
    stats.crit = Number(stats.crit.toFixed(2));
    stats.dodge = Number(stats.dodge.toFixed(2));
    stats.lifesteal = Number(stats.lifesteal.toFixed(2));

    return stats;
}

