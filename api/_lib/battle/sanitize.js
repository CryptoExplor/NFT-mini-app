/**
 * Server-side stat sanitisation for battles.
 *
 * Every stat block that reaches the battle endpoints comes from the client, so
 * it must be treated as hostile input: before this existed, a crafted request
 * could post `{ hp: 1e9, atk: 1e9 }` and win every PvP fight (and every AI
 * battle re-simulation) forever.
 *
 * Stats are coerced to finite numbers and clamped to the same balance envelope
 * the client-side normalizer uses (STAT_FLOORS..STAT_CAPS), so a tampered
 * payload can never exceed a legitimately obtainable fighter.
 */

import { STAT_CAPS, STAT_FLOORS } from '../../../src/lib/battle/balanceConfig.js';

const NUMERIC_STATS = ['hp', 'atk', 'def', 'spd', 'crit', 'dodge', 'lifesteal', 'regen'];

// Extra fields the combat engine reads. They are preserved (clamped) so the
// server's re-simulation sees exactly the same inputs the client did — dropping
// them would make a legitimate battle fail verification.
const EXTRA_STAT_LIMITS = {
    magicResist: { min: 0, max: 90 },
    damageMultiplier: { min: 0.2, max: STAT_CAPS.damageMultiplier ?? 2 }
};

// Item / arena modifiers are differentials, not absolutes.
const MODIFIER_LIMITS = {
    magicResist: 40,
    hp: 60,
    atk: 20,
    def: 20,
    spd: 20,
    crit: 0.3,
    dodge: 0.3,
    lifesteal: 0.15,
    regen: 10
};

const MAX_TEAM_SIZE = 12;
const MAX_STRING_LEN = 64;

function toNumber(value, fallback = 0) {
    const num = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(num) ? num : fallback;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function safeString(value, max = MAX_STRING_LEN) {
    if (typeof value !== 'string') return '';
    return value.slice(0, max);
}

/**
 * Clamp a fighter's absolute stats into the legal balance envelope.
 * @param {Object} rawStats
 * @param {{ name?: string }} [opts]
 */
export function sanitizeFighterStats(rawStats, opts = {}) {
    const source = (rawStats && typeof rawStats === 'object') ? rawStats : {};
    const clean = {};

    for (const key of NUMERIC_STATS) {
        const floor = STAT_FLOORS[key] ?? 0;
        const cap = STAT_CAPS[key] ?? 0;
        const fallback = key === 'hp' ? floor : 0;
        clean[key] = clamp(toNumber(source[key], fallback), floor, cap);
    }

    for (const [key, range] of Object.entries(EXTRA_STAT_LIMITS)) {
        if (source[key] === undefined || source[key] === null) continue;
        clean[key] = clamp(toNumber(source[key], range.min), range.min, range.max);
    }

    // maxHp drives regen/lifesteal ceilings in the engine; default it to hp.
    clean.maxHp = clamp(toNumber(source.maxHp, clean.hp), STAT_FLOORS.hp ?? 1, STAT_CAPS.hp);

    // Passthrough of non-numeric, non-exploitable descriptors only.
    clean.passive = safeString(source.passive) || null;
    clean.affinity = safeString(source.affinity) || null;
    clean.source = safeString(source.source) || null;
    clean.tokenId = safeString(String(source.tokenId ?? '')) || null;
    clean.name = safeString(opts.name || source.name || 'Fighter', 40);

    return clean;
}

/** Clamp an item/arena modifier block (differential values). */
export function sanitizeModifierStats(rawStats) {
    if (!rawStats || typeof rawStats !== 'object') return null;

    const clean = {};
    let hasValue = false;

    for (const [key, limit] of Object.entries(MODIFIER_LIMITS)) {
        if (rawStats[key] === undefined || rawStats[key] === null) continue;
        const value = clamp(toNumber(rawStats[key], 0), -limit, limit);
        if (value !== 0) hasValue = true;
        clean[key] = value;
    }

    const passive = safeString(rawStats.passive);
    if (passive) {
        clean.passive = passive;
        hasValue = true;
    }

    return hasValue ? clean : null;
}

/** Bound the team snapshot (synergy source) in size and shape. */
export function sanitizeTeamSnapshot(rawTeam) {
    if (!Array.isArray(rawTeam)) return [];

    return rawTeam.slice(0, MAX_TEAM_SIZE).map((entry) => {
        const item = (entry && typeof entry === 'object') ? entry : {};
        return {
            collectionName: safeString(item.collectionName || item.collectionSlug || ''),
            trait: safeString(item.trait || ''),
            role: safeString(item.role || ''),
            isFarcasterFollower: item.isFarcasterFollower === true
        };
    });
}

/** Clamp an AI difficulty knob into a sane range. */
export function sanitizeAiWinRate(value, fallback = 0.6) {
    const num = toNumber(value, fallback);
    return clamp(num, 0.05, 0.95);
}

/** Bound replay logs so a single battle cannot bloat KV. */
export function sanitizeLogs(rawLogs, maxEntries = 200) {
    if (!Array.isArray(rawLogs)) return [];
    return rawLogs.slice(0, maxEntries).map((log) => {
        const entry = (log && typeof log === 'object') ? log : {};
        return {
            round: Math.max(0, Math.floor(toNumber(entry.round, 0))),
            attackerSide: entry.attackerSide === 'P2' ? 'P2' : 'P1',
            targetSide: entry.targetSide === 'P1' ? 'P1' : 'P2',
            damage: Math.max(0, Math.round(toNumber(entry.damage, 0))),
            isCrit: entry.isCrit === true,
            isDodge: entry.isDodge === true,
            p1Hp: Math.round(toNumber(entry.p1Hp, 0)),
            p2Hp: Math.round(toNumber(entry.p2Hp, 0)),
            text: safeString(entry.text, 160) || undefined
        };
    });
}
