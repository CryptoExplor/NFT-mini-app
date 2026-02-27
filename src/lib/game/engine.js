/**
 * Core Game Engine
 * Pure math and logic for asynchronous auto-battles.
 * NO DOM/React dependencies.
 */

import { COMBAT, PASSIVES } from '../battle/balanceConfig.js';

function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function normalizeCombatant(rawStats, fallbackName) {
    const hp = Math.max(1, Math.floor(toNumber(rawStats?.hp ?? rawStats?.health, 100)));

    return {
        name: rawStats?.name || fallbackName,
        side: rawStats?.side || null,
        hp,
        maxHp: Math.max(1, Math.floor(toNumber(rawStats?.maxHp, hp))),
        atk: Math.max(1, Math.floor(toNumber(rawStats?.atk ?? rawStats?.attack, 10))),
        def: Math.max(1, Math.floor(toNumber(rawStats?.def ?? rawStats?.defense, 10))),
        spd: Math.max(1, Math.floor(toNumber(rawStats?.spd ?? rawStats?.speed, 10))),
        crit: clamp(toNumber(rawStats?.crit ?? rawStats?.critChance, 0.05), 0, 0.75),
        dodge: clamp(toNumber(rawStats?.dodge, 0), 0, 0.75),
        lifesteal: clamp(toNumber(rawStats?.lifesteal, 0), 0, 0.8),
        regen: Math.max(0, Math.floor(toNumber(rawStats?.regen, 0))),
        magicResist: clamp(toNumber(rawStats?.magicResist, 0), 0, 90),
        damageMultiplier: Math.max(0.2, toNumber(rawStats?.damageMultiplier, 1)),
        affinity: typeof rawStats?.affinity === 'string' ? rawStats.affinity.toLowerCase() : null,
        image: rawStats?.image || ''
    };
}

function parseBiome(environmentStats) {
    if (!environmentStats) return null;
    if (typeof environmentStats === 'string') return environmentStats;

    if (typeof environmentStats.biome === 'string') {
        return environmentStats.biome;
    }

    if (environmentStats.environment && typeof environmentStats.environment.biome === 'string') {
        return environmentStats.environment.biome;
    }

    if (Array.isArray(environmentStats.attributes)) {
        const biomeTrait = environmentStats.attributes.find((trait) => String(trait?.trait_type || '').toLowerCase() === 'biome');
        if (biomeTrait?.value) return String(biomeTrait.value);
    }

    return null;
}

const BIOME_RULES = {
    'desert dunes': {
        atk: 3,
        spd: 1,
        damageMultiplier: 1.06,
        affinityBonus: { fire: 1.12 }
    },
    'ocean coast': {
        def: 3,
        dodge: 0.04,
        affinityBonus: { water: 1.08 }
    },
    'forest valley': {
        regen: 2,
        def: 2
    },
    'snowy tundra': {
        def: 5,
        spd: -2
    },
    'sunset plains': {
        crit: 0.05,
        atk: 2
    },
    'mystic fog': {
        dodge: 0.08,
        crit: -0.03
    },
    'starry night': {
        crit: 0.04,
        magicResist: 10
    },
    'mountain peak': {
        def: 4,
        atk: 1
    }
};

function applyItemSynergy(fighterStats, itemStats) {
    const fighter = normalizeCombatant(fighterStats, fighterStats?.name || 'Fighter');
    if (!itemStats) return fighter;

    const statMultiplier = Math.max(0.5, toNumber(itemStats.statMultiplier, 1));
    const runePower = clamp(toNumber(itemStats.runePower ?? itemStats.power, 0), 0, 200);
    const runeMultiplier = runePower > 0 ? Math.min(1.35, 1 + (runePower / 400)) : 1;

    fighter.atk = Math.max(1, Math.round((fighter.atk + toNumber(itemStats.atk ?? itemStats.attack, 0)) * statMultiplier * runeMultiplier));
    fighter.def = Math.max(1, Math.round((fighter.def + toNumber(itemStats.def ?? itemStats.defense, 0)) * (1 + runePower / 700)));
    fighter.spd = Math.max(1, Math.round(fighter.spd + toNumber(itemStats.spd ?? itemStats.speed, 0)));
    fighter.regen = Math.max(0, fighter.regen + Math.floor(toNumber(itemStats.regen, 0)));
    fighter.dodge = clamp(fighter.dodge + toNumber(itemStats.dodge, 0), 0, 0.75);
    fighter.crit = clamp(fighter.crit + toNumber(itemStats.crit ?? itemStats.critChance, 0) + Math.min(0.15, runePower / 1000), 0, 0.75);
    fighter.lifesteal = clamp(fighter.lifesteal + toNumber(itemStats.lifesteal, 0), 0, 0.8);
    fighter.magicResist = clamp(fighter.magicResist + toNumber(itemStats.magicResist, 0), 0, 90);

    return fighter;
}

export function applyEnvironmentEffects(fighterStats, environmentStats) {
    const fighter = normalizeCombatant(fighterStats, fighterStats?.name || 'Fighter');
    const biome = parseBiome(environmentStats);
    if (!biome) return fighter;

    const rule = BIOME_RULES[String(biome).toLowerCase()];
    if (!rule) return fighter;

    fighter.atk = Math.max(1, fighter.atk + Math.floor(toNumber(rule.atk, 0)));
    fighter.def = Math.max(1, fighter.def + Math.floor(toNumber(rule.def, 0)));
    fighter.spd = Math.max(1, fighter.spd + Math.floor(toNumber(rule.spd, 0)));
    fighter.regen = Math.max(0, fighter.regen + Math.floor(toNumber(rule.regen, 0)));
    fighter.crit = clamp(fighter.crit + toNumber(rule.crit, 0), 0, 0.75);
    fighter.dodge = clamp(fighter.dodge + toNumber(rule.dodge, 0), 0, 0.75);
    fighter.magicResist = clamp(fighter.magicResist + toNumber(rule.magicResist, 0), 0, 90);
    fighter.damageMultiplier *= Math.max(0.2, toNumber(rule.damageMultiplier, 1));

    if (fighter.affinity && rule.affinityBonus && rule.affinityBonus[fighter.affinity]) {
        fighter.damageMultiplier *= Math.max(0.5, toNumber(rule.affinityBonus[fighter.affinity], 1));
    }

    fighter.damageMultiplier = Number(fighter.damageMultiplier.toFixed(3));
    return fighter;
}

/**
 * V2 Feature Placeholder
 * Mutates base fighter stats if additional item/environment slots are provided.
 */
export function applyV2Synergies(fighterStats, itemStats, environmentStats, teamSynergies = []) {
    let base = applyItemSynergy(fighterStats, itemStats);
    base = applyEnvironmentEffects(base, environmentStats);
    return applyTeamSynergies(base, teamSynergies);
}

/**
 * Calculates buffs based on the player's broader ecosystem holdings (wallet inventory).
 */
export function applyTeamSynergies(fighter, team = []) {
    if (!team || team.length === 0) return fighter;

    // Tally up traits and collections
    const glitchedCount = team.filter(t => typeof t.trait === 'string' && t.trait.toUpperCase() === 'GLITCHED').length;
    const corruptedCount = team.filter(t => typeof t.trait === 'string' && t.trait.toUpperCase() === 'CORRUPTED').length;

    const runes = team.filter(t => t.engineId === 'NeonRunes' || t.collectionName === 'neon-runes');
    const hasBasehead = fighter.name.includes('BASEHEADS') || fighter.name.includes('BaseHead');

    // Check Mood Ring (Distinct Moods)
    const distinctMoods = new Set(
        team.filter(t => t.engineId === 'BaseMoods' || t.collectionName === 'base-moods')
            .map(t => t.trait)
    );

    // 1. Faction Alliances
    if (glitchedCount >= 3) {
        fighter.spd += 20;
        fighter.dodge = clamp(fighter.dodge + 0.10, 0, 0.75);
    }
    if (corruptedCount >= 3) {
        fighter.lifesteal = clamp(fighter.lifesteal + 0.15, 0, 0.8);
    }

    // 2. Cross-Collection: NeonRunes buff BaseHeads
    if (hasBasehead && runes.length > 0) {
        // Find the strongest rune
        let maxPower = 0;
        for (const rune of runes) {
            const attrs = rune.rawAttributes || rune.rawMetadata || [];
            const p = attrs.find(a => String(a.trait_type).toLowerCase() === 'power');
            let powerVal = p ? parseInt(p.value, 10) : 50;
            if (!isNaN(powerVal) && powerVal > maxPower) maxPower = powerVal;
        }
        fighter.atk += Math.floor(maxPower / 10);
    }

    // 3. Mood Ring
    if (distinctMoods.size >= 3) {
        fighter.hp += 15;
        fighter.atk += 15;
        fighter.def += 15;
        fighter.spd += 15;
    }

    return fighter;
}

/**
 * Executes a single turn in combat.
 * 
 * @param {Object} attacker - Normalized fighter stats
 * @param {Object} defender - Normalized fighter stats 
 * @param {Function} prng - A seeded pseudorandom number generator (e.g. from seedrandom)
 * @param {Object} turnContext - Runtime modifiers (environment/synergy)
 * @returns {Object} Turn result log
 */
export function executeTurn(attacker, defender, prng, turnContext = {}) {
    const critChance = clamp((attacker.crit || 0.05) + toNumber(turnContext.critBonus, 0), 0, 0.95);
    const dodgeChance = clamp((defender.dodge || 0) + toNumber(turnContext.dodgeBonus, 0), 0, 0.95);

    const isCrit = prng() < critChance;
    const isDodge = prng() < dodgeChance;

    if (isDodge) {
        return {
            attacker: attacker.name,
            target: defender.name,
            attackerSide: attacker.side || null,
            targetSide: defender.side || null,
            damage: 0,
            isCrit: false,
            isDodge: true,
            healing: 0,
            defenderRemainingHp: defender.hp
        };
    }

    // Core Damage Formula: Atk - (Def / 2), then apply multipliers.
    const attackMultiplier = Math.max(0.2, toNumber(turnContext.attackMultiplier, 1));
    const defenseMultiplier = Math.max(0.2, toNumber(turnContext.defenseMultiplier, 1));
    const resistMultiplier = 1 - (clamp(defender.magicResist || 0, 0, 90) / 250);
    const damageMultiplier = Math.max(0.2, toNumber(turnContext.damageMultiplier, attacker.damageMultiplier || 1));

    let rawDamage = (attacker.atk * attackMultiplier) - ((defender.def * defenseMultiplier) * 0.5);
    if (rawDamage < 1) rawDamage = 1; // Minimum damage
    rawDamage *= resistMultiplier;
    rawDamage *= damageMultiplier;

    // Crit multiplier
    if (isCrit) {
        rawDamage *= COMBAT.CRIT_MULTIPLIER;
    }

    const finalDamage = Math.floor(rawDamage);
    defender.hp -= finalDamage;

    // Lifesteal calculation (clamped to maxHp to prevent overheal exploit)
    let healing = 0;
    if (attacker.lifesteal && attacker.lifesteal > 0) {
        healing = Math.floor(finalDamage * attacker.lifesteal);
        attacker.hp = Math.min(attacker.maxHp || attacker.hp + healing, attacker.hp + healing);
    }

    return {
        attacker: attacker.name,
        target: defender.name,
        attackerSide: attacker.side || null,
        targetSide: defender.side || null,
        damage: finalDamage,
        isCrit,
        isDodge,
        healing,
        defenderRemainingHp: Math.max(0, defender.hp)
    };
}

/**
 * Simulates a full auto-battle start to finish.
 * 
 * @param {Object} playerFighter 
 * @param {Object} enemyFighter 
 * @param {Function} prng - Seeded pseudo-random generator
 * @param {Object} options - Optional multi-NFT slots and environment payload
 * @returns {Object} Full battle log and winner
 */
export function simulateBattle(playerFighter, enemyFighter, prng, options = {}) {
    let rng = prng;
    let battleOptions = options || {};

    if (typeof prng !== 'function') {
        rng = Math.random;
        battleOptions = prng || {};
    }

    // AI Win Rate Injection
    if (battleOptions.isAiBattle && battleOptions.aiWinRate !== undefined) {
        const targetAiWin = Math.random() < (battleOptions.aiWinRate ?? COMBAT.AI_WIN_RATE);
        const enemyName = enemyFighter?.name || 'Opponent';
        let bestResult = null;

        for (let i = 0; i < COMBAT.AI_SIMULATION_TRIES; i++) {
            const result = _simulateBattleCore(playerFighter, enemyFighter, Math.random, battleOptions);
            const aiWon = result.winner === enemyName || result.winner === enemyFighter?.name;
            bestResult = result;
            if (aiWon === targetAiWin) return result;
        }

        return bestResult;
    }

    return _simulateBattleCore(playerFighter, enemyFighter, rng, battleOptions);
}

/**
 * Resolves a passive ability ID to its full config object.
 */
function resolvePassive(passiveId) {
    if (!passiveId) return null;
    if (typeof passiveId === 'object') return passiveId; // Already resolved
    return PASSIVES[passiveId] || null;
}

function _simulateBattleCore(playerFighter, enemyFighter, prng, options = {}) {
    let rng = prng;
    let battleOptions = options || {};

    if (typeof prng !== 'function') {
        rng = Math.random;
        battleOptions = prng || {};
    }

    const p1Base = normalizeCombatant(playerFighter, playerFighter?.name || 'Player');
    const p2Base = normalizeCombatant(enemyFighter, enemyFighter?.name || 'Opponent');
    p1Base.side = 'P1';
    p2Base.side = 'P2';

    // Apply V2 slot synergies/environment before combat starts.
    const p1 = applyV2Synergies(p1Base, battleOptions.playerItem || null, battleOptions.environment || null, battleOptions.playerTeam || []);
    const p2 = applyV2Synergies(p2Base, battleOptions.enemyItem || null, battleOptions.environment || null, battleOptions.enemyTeam || []);
    p1.side = 'P1';
    p2.side = 'P2';
    p1.maxHp = Math.max(1, p1.maxHp || p1.hp);
    p2.maxHp = Math.max(1, p2.maxHp || p2.hp);

    const logs = [];

    // ── Passive Ability State ──
    const passiveState = {
        P1: { cooldownRemaining: 0, passive: resolvePassive(battleOptions.playerPassive) },
        P2: { cooldownRemaining: 0, passive: resolvePassive(battleOptions.enemyPassive) },
    };

    // Determine initiative (higher speed goes first)
    let p1GoesFirst = p1.spd > p2.spd;
    if (p1.spd === p2.spd) {
        p1GoesFirst = rng() > 0.5;
    }

    let currentAttacker = p1GoesFirst ? p1 : p2;
    let currentDefender = p1GoesFirst ? p2 : p1;

    let round = 1;
    let winner = null;
    let winnerSide = null;

    while (p1.hp > 0 && p2.hp > 0 && round <= COMBAT.MAX_ROUNDS) {
        const turnEvents = [];

        // ── Regen phase ──
        if (p1.regen > 0) p1.hp = Math.min(p1.maxHp, p1.hp + p1.regen);
        if (p2.regen > 0) p2.hp = Math.min(p2.maxHp, p2.hp + p2.regen);

        // ── Passive resolution ──
        const atkSide = currentAttacker.side;
        const defSide = currentDefender.side;
        const atkPassiveState = passiveState[atkSide];
        const defPassiveState = passiveState[defSide];

        // Tick cooldowns
        if (atkPassiveState.cooldownRemaining > 0) atkPassiveState.cooldownRemaining--;
        if (defPassiveState.cooldownRemaining > 0) defPassiveState.cooldownRemaining--;

        // Build turn context with potential passive modifiers
        const turnContext = { damageMultiplier: currentAttacker.damageMultiplier || 1 };

        // Attacker passives
        if (atkPassiveState.passive && atkPassiveState.cooldownRemaining === 0) {
            const p = atkPassiveState.passive;

            if (p.triggerCondition === 'ON_ATTACK') {
                turnContext.lifestealBonus = p.effect.lifestealBonus || 0;
                atkPassiveState.cooldownRemaining = p.cooldown;
                turnEvents.push({ type: 'passive', side: atkSide, passive: p.id, name: p.name });
            }

            if (p.triggerCondition === 'ON_LOW_HP' && currentAttacker.hp / currentAttacker.maxHp <= (p.hpThreshold || 0.3)) {
                turnContext.attackMultiplier = (turnContext.attackMultiplier || 1) * (p.effect.atkMultiplier || 1);
                turnContext.defenseMultiplier = (turnContext.defenseMultiplier || 1) * (p.effect.defMultiplier || 1);
                turnEvents.push({ type: 'passive', side: atkSide, passive: p.id, name: p.name });
            }

            if (p.triggerCondition === 'ON_TURN_START') {
                const healAmt = Math.floor(currentAttacker.maxHp * (p.effect.healPercent || 0));
                if (healAmt > 0) {
                    currentAttacker.hp = Math.min(currentAttacker.maxHp, currentAttacker.hp + healAmt);
                    turnEvents.push({ type: 'passive', side: atkSide, passive: p.id, name: p.name, healing: healAmt });
                }
                atkPassiveState.cooldownRemaining = p.cooldown;
            }
        }

        // Defender passives
        if (defPassiveState.passive && defPassiveState.cooldownRemaining === 0) {
            const p = defPassiveState.passive;

            if (p.triggerCondition === 'ON_DEFEND') {
                if (p.effect.dodgeBonus) turnContext.dodgeBonus = (turnContext.dodgeBonus || 0) + p.effect.dodgeBonus;
                if (p.effect.damageReduction) turnContext.damageReduction = p.effect.damageReduction;
                defPassiveState.cooldownRemaining = p.cooldown;
                turnEvents.push({ type: 'passive', side: defSide, passive: p.id, name: p.name });
            }
        }

        const turnResult = executeTurn(currentAttacker, currentDefender, rng, turnContext);

        // Apply lifesteal bonus from passive (on top of base lifesteal)
        if (turnContext.lifestealBonus && turnResult.damage > 0 && !turnResult.isDodge) {
            const bonusHeal = Math.floor(turnResult.damage * turnContext.lifestealBonus);
            currentAttacker.hp = Math.min(currentAttacker.maxHp, currentAttacker.hp + bonusHeal);
            turnResult.healing = (turnResult.healing || 0) + bonusHeal;
        }

        // Apply damage reduction from passive
        if (turnContext.damageReduction && turnResult.damage > 0 && !turnResult.isDodge) {
            const reduced = Math.floor(turnResult.damage * turnContext.damageReduction);
            currentDefender.hp += reduced; // Give back reduced amount
            turnResult.damage -= reduced;
            turnResult.defenderRemainingHp = Math.max(0, currentDefender.hp);
            turnResult.damageReduced = reduced;
        }

        logs.push({ round, ...turnResult, passiveEvents: turnEvents });

        if (currentDefender.hp <= 0) {
            winner = currentAttacker.name;
            winnerSide = currentAttacker.side;
            break;
        }

        // Swap roles
        const temp = currentAttacker;
        currentAttacker = currentDefender;
        currentDefender = temp;

        round++;
    }

    if (!winner) {
        const p1Ratio = p1.hp / p1.maxHp;
        const p2Ratio = p2.hp / p2.maxHp;
        winner = p1Ratio > p2Ratio ? p1.name : p2.name;
        winnerSide = p1Ratio > p2Ratio ? 'P1' : 'P2';
    }

    return {
        winner,
        winnerSide,
        totalRounds: logs.length || round,
        logs
    };
}

/**
 * Summarizes the replay log into a smaller payload.
 */
export function summarizeReplay(battleResult) {
    const logs = Array.isArray(battleResult?.logs) ? battleResult.logs : [];

    return {
        winner: battleResult?.winner || null,
        winnerSide: battleResult?.winnerSide || null,
        totalRounds: battleResult?.totalRounds || logs.length,
        totalDamageP1: logs.filter((l) => l.attackerSide === 'P1').reduce((sum, l) => sum + (l.damage || 0), 0),
        totalDamageP2: logs.filter((l) => l.attackerSide === 'P2').reduce((sum, l) => sum + (l.damage || 0), 0)
    };
}
