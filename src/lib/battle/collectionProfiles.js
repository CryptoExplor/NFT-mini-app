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
        dynamicReads: ['getRuneStats'] // runePower changes over time/combinations
    },

    'mini-worlds': {
        name: 'Mini Worlds',
        role: 'ENVIRONMENT',
        idMode: 'SEQUENTIAL_1',
        statSource: 'DYNAMIC_ONCHAIN',
        allowedModes: ['v2_synergy'],
        dynamicReads: ['worldEvolution'] // Evolutions boost arena effects
    },

    'bytebeats': {
        name: 'Byte Beats',
        role: 'ITEM_BUFF',
        idMode: 'SEQUENTIAL_1',
        statSource: 'DYNAMIC_ONCHAIN',
        allowedModes: ['v2_synergy'],
        dynamicReads: ['getBeatStats'] // tempo/harmony alters stats
    },

    'neon-shapes': {
        name: 'Neon Shapes',
        role: 'ITEM_BUFF',
        idMode: 'SEQUENTIAL_1',
        statSource: 'DYNAMIC_ONCHAIN',
        allowedModes: ['v2_synergy'],
        dynamicReads: ['shapeIntensity']
    }
};

/**
 * Returns the profile configuration for a given collection ID
 */
export function getCollectionProfile(collectionId) {
    return COLLECTION_PROFILES[collectionId] || null;
}
