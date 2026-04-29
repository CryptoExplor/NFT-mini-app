/**
 * NFT Game Ecosystem Capability Matrix
 * 
 * Defines the strict rules, static behaviors, and dynamic reads for every 
 * whitelisted collection allowed in the Battle Arena.
 */

export const COLLECTION_PROFILES = {
    // ============================================
    // V1 CHARACTERS
    // Primary fighters that go in slot 1
    // ============================================

    'base-invaders': {
        name: 'Base Invaders',
        role: 'FIGHTER',
        idMode: 'USER_CHOSEN', // Non-sequential IDs
        statSource: 'STATIC_METADATA',
        allowedModes: ['global_ranked_async'],
        baseStats: { hp: 100, atk: 12, def: 12, spd: 12 },
        passive: 'GHOST_STEP',
        engineAlias: ['BASE_INVADERS', 'base_invaders'],
        traitsMap: {
            'Faction': { 'GLITCHED': { spd: 15, dodge: 0.1 }, 'CORRUPTED': { lifesteal: 0.15 }, 'OG': { hp: 20 } },
            'Body': { 'Heavy': { def: 10, spd: -5 }, 'Slim': { spd: 10, hp: -10 }, 'Cracked': { atk: 5, def: -5 } }
        }
    },

    'baseheads-404': {
        name: 'BaseHeads 404',
        role: 'FIGHTER',
        idMode: 'USER_CHOSEN', // Non-sequential
        statSource: 'STATIC_METADATA',
        allowedModes: ['global_ranked_async'],
        baseStats: { hp: 90, atk: 15, def: 8, spd: 10 },
        passive: 'BERSERKER',
        engineAlias: ['BASEHEADS_404', 'baseheads_404'],
        traitsMap: {
            'Mood': { 'ANGRY': { atk: 8 }, 'IDLE': { hp: 15 }, 'OVERLOAD': { atk: 12, def: -5 } },
            'Noise': { 'MAX': { crit: 0.2 }, 'HIGH': { crit: 0.1 } },
            'Error': { '404': { dodge: 0.15 }, '500': { atk: 10, def: -10 } }
        }
    },

    'base-moods': {
        name: 'BaseMoods',
        role: 'FIGHTER',
        idMode: 'USER_CHOSEN',
        statSource: 'STATIC_METADATA',
        allowedModes: ['global_ranked_async'],
        baseStats: { hp: 100, atk: 10, def: 10, spd: 10 },
        passive: 'REGEN_BURST',
        engineAlias: ['BaseMoods', 'base_moods'],
        traitsMap: {
            'Mood': {
                'Happy': { hp: 20 }, 'Angry': { atk: 15 }, 'Chill': { def: 15 },
                'Excited': { spd: 15 }, 'Zen': { regen: 5 }, 'Sad': { def: 20, atk: -5 }
            }
        }
    },

    'void-pfps': {
        name: 'Void PFPs',
        role: 'FIGHTER',
        idMode: 'SEQUENTIAL_0', // ERC721A
        statSource: 'STATIC_METADATA',
        allowedModes: ['global_ranked_async'],
        baseStats: { hp: 70, atk: 18, def: 5, spd: 20 },
        passive: 'GHOST_STEP',
        engineAlias: ['VOID_PFPS', 'void_pfps'],
        traitsMap: {
            'Distortion': { 'High': { dodge: 0.2 }, 'Low': { atk: 5 } }
        }
    },

    // ============================================
    // V1.5 CHARACTERS
    // Additional allowed fighters
    // ============================================

    'quantum-quills': {
        name: 'Quantum Quills',
        role: 'FIGHTER',
        idMode: 'SEQUENTIAL_0',
        statSource: 'DYNAMIC_GLOBAL_STAGE', // Relies on supply stage
        allowedModes: ['global_ranked_async'],
        baseStats: { hp: 80, atk: 20, def: 5, spd: 15 },
        passive: 'DRAIN',
        engineAlias: ['QuantumQuills', 'quantum_quills'],
        dynamicReads: ['getCurrentStage'] // Must read from contract to define global power multiplier
    },

    'base-fortunes': {
        name: 'Base Fortunes',
        role: 'FIGHTER',
        idMode: 'SEQUENTIAL_1',
        statSource: 'STATIC_METADATA',
        allowedModes: ['global_ranked_async'],
        baseStats: { hp: 100, atk: 10, def: 10, spd: 10 },
        passive: 'IRON_WALL',
        engineAlias: ['BaseFortunes', 'base_fortunes'],
        traitsMap: {
            'Rarity': { 'Legendary': { atk: 10, hp: 10 }, 'Rare': { atk: 5, hp: 5 } }
        }
    },

    'base-gods': {
        name: 'Base Gods',
        role: 'FIGHTER',
        idMode: 'USER_CHOSEN',
        statSource: 'STATIC_METADATA',
        allowedModes: ['global_ranked_async'],
        baseStats: { hp: 110, atk: 22, def: 15, spd: 10 },
        passive: 'DIVINE',
        engineAlias: ['BaseGods', 'base_gods'],
        traitsMap: {
            'Deity': {
                'Zeus': { atk: 5, crit: 0.1 },
                'Hades': { lifesteal: 0.1, atk: 3 },
                'Poseidon': { hp: 20, def: 5 },
                'Athena': { def: 10, spd: 5 },
                'Ares': { atk: 10, def: -5 }
            },
            'Aura': {
                'Gold': { crit: 0.15 },
                'Purple': { regen: 5 },
                'Celestial': { dodge: 0.1 }
            }
        }
    },

    // ============================================
    // V2 MODIFIERS
    // Items / Environments (Not allowed in V1 rank)
    // ============================================

    'neon-runes': {
        name: 'Neon Runes',
        role: 'ITEM_BUFF',
        idMode: 'SEQUENTIAL_1',
        statSource: 'DYNAMIC_ONCHAIN',
        allowedModes: ['v2_synergy'], // Locked behind V2
        engineAlias: ['neon-runes', 'neonrunes', 'Neon Runes'],
        dynamicReads: ['getRuneStats'] // runePower changes over time/combinations
    },

    'mini-worlds': {
        name: 'Mini Worlds',
        role: 'ENVIRONMENT',
        idMode: 'SEQUENTIAL_1',
        statSource: 'DYNAMIC_ONCHAIN',
        allowedModes: ['v2_synergy'],
        engineAlias: ['mini-worlds', 'miniworlds', 'Mini Worlds', 'mini-worlds-base'],
        dynamicReads: ['worldEvolution'] // Evolutions boost arena effects
    },

    'bytebeats': {
        name: 'Byte Beats',
        role: 'ITEM_BUFF',
        idMode: 'SEQUENTIAL_1',
        statSource: 'DYNAMIC_ONCHAIN',
        allowedModes: ['v2_synergy'],
        engineAlias: ['bytebeats', 'byte-beats', 'Byte Beats', 'bytebeats-base'],
        dynamicReads: ['getBeatStats'] // tempo/harmony alters stats
    },

    'neon-shapes': {
        name: 'Neon Shapes',
        role: 'ITEM_BUFF',
        idMode: 'SEQUENTIAL_1',
        statSource: 'DYNAMIC_ONCHAIN',
        allowedModes: ['v2_synergy'],
        engineAlias: ['neon-shapes', 'neonshapes', 'Neon Shapes'],
        dynamicReads: ['shapeIntensity']
    }
};

/**
 * Returns the profile configuration for a given collection ID
 */
export function getCollectionProfile(collectionId) {
    if (!collectionId) return null;
    const searchId = collectionId.toLowerCase();

    // 1. Direct match (case-insensitive)
    for (const key of Object.keys(COLLECTION_PROFILES)) {
        if (key.toLowerCase() === searchId) {
            return COLLECTION_PROFILES[key];
        }
    }

    // 2. Alias match (case-insensitive)
    for (const [key, profile] of Object.entries(COLLECTION_PROFILES)) {
        if (profile.engineAlias) {
            const hasAlias = profile.engineAlias.some(alias => alias.toLowerCase() === searchId);
            if (hasAlias) return profile;
        }
    }

    return null;
}

/**
 * Returns the V2 Role (FIGHTER, ITEM_BUFF, ENVIRONMENT) for a given collection slug.
 * Used by wallet.js to categorize inventory items.
 */
export function getRoleForSlug(slug) {
    const profile = getCollectionProfile(slug);
    return profile ? profile.role : 'UNKNOWN';
}
