/**
 * Balance Config — Single Source of Truth
 * All stat caps, floors, passive cooldowns, and arena limits.
 * Centralised for easy tuning and auditability.
 */

// ── Stat Boundaries ──────────────────────────────────────────────
export const STAT_CAPS = {
    hp: 300,
    atk: 60,
    def: 60,
    spd: 60,
    crit: 0.75,
    dodge: 0.75,
    lifesteal: 0.80,
    regen: 15,
    magicResist: 90,
    damageMultiplier: 2.0,
};

export const STAT_FLOORS = {
    hp: 30,
    atk: 3,
    def: 1,
    spd: 1,
    crit: 0,
    dodge: 0,
    lifesteal: 0,
    regen: 0,
    magicResist: 0,
    damageMultiplier: 0.2,
};

// ── Combat Tuning ────────────────────────────────────────────────
export const COMBAT = {
    MAX_ROUNDS: 50,
    MIN_DAMAGE: 1,
    CRIT_MULTIPLIER: 1.5,
    DEF_DIVISOR: 2,      // rawDmg = ATK - (DEF / DEF_DIVISOR)
    RESIST_DIVISOR: 250,    // resistMultiplier = 1 - (magicResist / RESIST_DIVISOR)
    AI_WIN_RATE: 0.60,
    AI_SIMULATION_TRIES: 25,
};

// ── Passive Abilities ────────────────────────────────────────────
export const PASSIVES = {
    GHOST_STEP: {
        id: 'GHOST_STEP',
        name: 'Ghost Step',
        description: 'Phase out of reality, gaining +25% dodge for 1 turn. 2-turn cooldown.',
        cooldown: 2,
        effect: { dodgeBonus: 0.25, duration: 1 },
        triggerCondition: 'ON_DEFEND', // Activates when this fighter is the defender
    },
    IRON_WALL: {
        id: 'IRON_WALL',
        name: 'Iron Wall',
        description: 'Harden defences, reducing incoming damage by 30% for 1 turn. 3-turn cooldown.',
        cooldown: 3,
        effect: { damageReduction: 0.30, duration: 1 },
        triggerCondition: 'ON_DEFEND',
    },
    DRAIN: {
        id: 'DRAIN',
        name: 'Drain',
        description: 'Leech 20% of damage dealt as HP. 2-turn cooldown.',
        cooldown: 2,
        effect: { lifestealBonus: 0.20, duration: 1 },
        triggerCondition: 'ON_ATTACK',
    },
    BERSERKER: {
        id: 'BERSERKER',
        name: 'Berserker',
        description: 'Below 30% HP, gain +40% ATK but lose 10% DEF.',
        cooldown: 0, // Always active when condition met
        effect: { atkMultiplier: 1.40, defMultiplier: 0.90 },
        triggerCondition: 'ON_LOW_HP',
        hpThreshold: 0.30,
    },
    REGEN_BURST: {
        id: 'REGEN_BURST',
        name: 'Regen Burst',
        description: 'Heal 8% of max HP at the start of your turn. 3-turn cooldown.',
        cooldown: 3,
        effect: { healPercent: 0.08 },
        triggerCondition: 'ON_TURN_START',
    },
};

// ── Collection Passive Mapping ───────────────────────────────────
// Maps collection archetypes to their default passive ability.
export const COLLECTION_PASSIVES = {
    'base-invaders': 'GHOST_STEP',   // High-SPD glass cannon
    'baseheads-404': 'BERSERKER',    // Aggressive melee
    'base-moods': 'REGEN_BURST',  // Balanced / healing
    'void-pfps': 'GHOST_STEP',   // Ultra-fast dodge
    'quantum-quills': 'DRAIN',        // Sustain DPS
    'base-fortunes': 'IRON_WALL',    // Tanky / defensive
};

// ── Trait Passive Overrides ──────────────────────────────────────
// Specific trait values can swap a fighter's passive.
export const TRAIT_PASSIVE_OVERRIDES = {
    'GLITCHED': 'GHOST_STEP',
    'CORRUPTED': 'DRAIN',
    'OVERLOAD': 'BERSERKER',
    'Zen': 'REGEN_BURST',
    'Sad': 'IRON_WALL',
};

// ── Arena Limits ─────────────────────────────────────────────────
export const ARENA = {
    MAX_ACTIVE_CHALLENGES: 20,
    CHALLENGE_EXPIRY_MS: 3600000,  // 1 hour
    MAX_TEAM_SIZE: 3,        // V2: fighter + item + environment
};

// ── Snapshot Config ──────────────────────────────────────────────
export const SNAPSHOT = {
    HASH_ALGORITHM: 'sha256',
    DRIFT_TOLERANCE_PERCENT: 5, // Allow 5% stat drift before invalidation
};
