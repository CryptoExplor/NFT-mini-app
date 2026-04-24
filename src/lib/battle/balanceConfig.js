/**
 * Balance Config — Single Source of Truth
 * All stat caps, floors, passive cooldowns, and arena limits.
 * Centralised for easy tuning and auditability.
 */

// ── Stat Boundaries ──────────────────────────────────────────────
export const STAT_CAPS = {
    hp: 220,
    atk: 48,
    def: 48,
    spd: 50,
    crit: 0.60,
    dodge: 0.50,
    lifesteal: 0.15,
    regen: 15,
    magicResist: 80,
    damageMultiplier: 2.0,
};

export const STAT_FLOORS = {
    hp: 30,
    atk: 5,
    def: 5,
    spd: 5,
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

// ── Live Balance Overrides ───────────────────────────────────────
// Fetch balance patches from CDN without redeployment.
// Set VITE_BALANCE_CONFIG_URL in .env to enable.
// Optionally set VITE_BALANCE_CONFIG_SHA256 to require an exact payload checksum.
// Falls back to bundled defaults if fetch fails.
let _overridesApplied = false;

function normalizeExpectedSha256(value) {
    return String(value || '').trim().toLowerCase().replace(/^sha256:/, '');
}

async function sha256Hex(input) {
    const cryptoApi = globalThis?.crypto;
    if (!cryptoApi?.subtle) {
        throw new Error('crypto.subtle unavailable for balance integrity check');
    }

    const encoded = new TextEncoder().encode(input);
    const digest = await cryptoApi.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function loadBalanceOverrides() {
    if (_overridesApplied) return;
    _overridesApplied = true;

    const url = typeof import.meta !== 'undefined'
        ? import.meta.env?.VITE_BALANCE_CONFIG_URL
        : null;
    const expectedSha256 = typeof import.meta !== 'undefined'
        ? normalizeExpectedSha256(import.meta.env?.VITE_BALANCE_CONFIG_SHA256)
        : '';

    if (!url) return; // No CDN configured, use bundled values

    try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const rawConfig = await res.text();
        if (expectedSha256) {
            const actualSha256 = await sha256Hex(rawConfig);
            if (actualSha256 !== expectedSha256) {
                throw new Error('Checksum mismatch for live balance config');
            }
        }

        const overrides = JSON.parse(rawConfig);
        if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
            throw new Error('Invalid balance config payload');
        }

        // Merge STAT_CAPS overrides
        if (overrides.STAT_CAPS) {
            for (const [key, val] of Object.entries(overrides.STAT_CAPS)) {
                if (key in STAT_CAPS && typeof val === 'number' && Number.isFinite(val)) STAT_CAPS[key] = val;
            }
        }

        // Merge STAT_FLOORS overrides
        if (overrides.STAT_FLOORS) {
            for (const [key, val] of Object.entries(overrides.STAT_FLOORS)) {
                if (key in STAT_FLOORS && typeof val === 'number' && Number.isFinite(val)) STAT_FLOORS[key] = val;
            }
        }

        // Merge COMBAT overrides
        if (overrides.COMBAT) {
            for (const [key, val] of Object.entries(overrides.COMBAT)) {
                if (key in COMBAT && typeof val === 'number' && Number.isFinite(val)) COMBAT[key] = val;
            }
        }

        console.log(`[BalanceConfig] Live overrides applied from CDN${expectedSha256 ? ' (checksum verified)' : ' (unsigned)'}`);
    } catch (err) {
        console.warn('[BalanceConfig] CDN fetch failed, using bundled defaults:', err.message);
    }
}
