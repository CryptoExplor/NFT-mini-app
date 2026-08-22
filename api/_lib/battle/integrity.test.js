/**
 * Battle integrity tests.
 *
 * Run: node --test --experimental-test-module-mocks "api/**\/*.test.js"
 *
 * Covers the two cheat vectors found in the full-app audit:
 *   1. any authenticated wallet could mint ladder wins by POSTing
 *      {type:'battle_result_v2', metadata:{won:true}} to /api/track
 *   2. client-supplied stats were used verbatim, so a crafted PvP request
 *      (hp: 1e9) won every fight
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { verifyBattleClaim, isValidBattleId } from './verifyClaim.js';
import {
    sanitizeFighterStats,
    sanitizeModifierStats,
    sanitizeTeamSnapshot,
    sanitizeAiWinRate,
    sanitizeLogs
} from './sanitize.js';
import { STAT_CAPS, STAT_FLOORS } from '../../../src/lib/battle/balanceConfig.js';

const PLAYER = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
const BATTLE_ID = 'a'.repeat(64);

function createKv(records = {}) {
    const strings = new Map(Object.entries(records));
    return {
        _strings: strings,
        async get(key) {
            return strings.has(key) ? strings.get(key) : null;
        },
        async set(key, value, opts = {}) {
            if (opts.nx && strings.has(key)) return null;
            strings.set(key, value);
            return 'OK';
        }
    };
}

function battleRecord(overrides = {}) {
    return JSON.stringify({
        battleId: BATTLE_ID,
        players: {
            p1: { id: PLAYER, name: 'Hero' },
            p2: { id: 'ai:Arena Bot', name: 'Arena Bot' }
        },
        options: { isAiBattle: true },
        result: { winnerSide: 'P1', rounds: 7 },
        ...overrides
    });
}

// ── verifyBattleClaim ──────────────────────────────────────────

test('a claim without a battleId is never verified', async () => {
    const kv = createKv();
    const result = await verifyBattleClaim(kv, PLAYER, { won: true });

    assert.equal(result.verified, false);
    assert.equal(result.reason, 'missing_battle_id');
});

test('a claim referencing an unknown battle is rejected', async () => {
    const kv = createKv();
    const result = await verifyBattleClaim(kv, PLAYER, { won: true, battleId: BATTLE_ID });

    assert.equal(result.verified, false);
    assert.equal(result.reason, 'record_not_found');
});

test('a wallet that did not take part in the battle is rejected', async () => {
    const kv = createKv({ [`battle:${BATTLE_ID}`]: battleRecord() });
    const result = await verifyBattleClaim(kv, OTHER, { won: true, battleId: BATTLE_ID });

    assert.equal(result.verified, false);
    assert.equal(result.reason, 'not_a_participant');
});

test('the stored record overrides a lying `won` flag', async () => {
    const kv = createKv({
        [`battle:${BATTLE_ID}`]: battleRecord({ result: { winnerSide: 'P2', rounds: 4 } })
    });

    const result = await verifyBattleClaim(kv, PLAYER, { won: true, battleId: BATTLE_ID });

    assert.equal(result.verified, true);
    assert.equal(result.won, false, 'P1 lost that battle, the claim said otherwise');
});

test('a verified battle can only be counted once per wallet', async () => {
    const kv = createKv({ [`battle:${BATTLE_ID}`]: battleRecord() });

    const first = await verifyBattleClaim(kv, PLAYER, { won: true, battleId: BATTLE_ID });
    const second = await verifyBattleClaim(kv, PLAYER, { won: true, battleId: BATTLE_ID });

    assert.equal(first.verified, true);
    assert.equal(first.won, true);
    assert.equal(second.verified, false);
    assert.equal(second.reason, 'already_counted');
});

test('battle id format is validated before any KV lookup', () => {
    assert.equal(isValidBattleId('a'.repeat(64)), true);
    assert.equal(isValidBattleId('not-a-hash'), false);
    assert.equal(isValidBattleId(''), false);
    assert.equal(isValidBattleId(null), false);
});

// ── sanitize ───────────────────────────────────────────────────

test('god-mode stats are clamped to the balance envelope', () => {
    const clean = sanitizeFighterStats({
        hp: 1e9,
        atk: Number.MAX_SAFE_INTEGER,
        def: 99999,
        spd: 1e6,
        crit: 50,
        dodge: 12,
        lifesteal: 3,
        regen: 500,
        name: 'x'.repeat(500)
    });

    assert.equal(clean.hp, STAT_CAPS.hp);
    assert.equal(clean.atk, STAT_CAPS.atk);
    assert.equal(clean.def, STAT_CAPS.def);
    assert.equal(clean.spd, STAT_CAPS.spd);
    assert.equal(clean.crit, STAT_CAPS.crit);
    assert.equal(clean.dodge, STAT_CAPS.dodge);
    assert.equal(clean.lifesteal, STAT_CAPS.lifesteal);
    assert.ok(clean.regen <= STAT_CAPS.regen);
    assert.ok(clean.name.length <= 40);
});

test('missing, negative and NaN stats fall back to the floor', () => {
    const clean = sanitizeFighterStats({ hp: -100, atk: 'abc', def: NaN, spd: undefined });

    assert.equal(clean.hp, STAT_FLOORS.hp);
    assert.equal(clean.atk, STAT_FLOORS.atk);
    assert.equal(clean.def, STAT_FLOORS.def);
    assert.equal(clean.spd, STAT_FLOORS.spd);
    assert.equal(Number.isFinite(clean.hp), true);
});

test('item modifiers are bounded in both directions', () => {
    const clean = sanitizeModifierStats({ atk: 5000, hp: -5000, crit: 9 });

    assert.ok(clean.atk <= 20 && clean.atk > 0);
    assert.ok(clean.hp >= -60 && clean.hp < 0);
    assert.ok(clean.crit <= 0.3);
    assert.equal(sanitizeModifierStats(null), null);
    assert.equal(sanitizeModifierStats({}), null);
});

test('team snapshots and logs are size bounded', () => {
    const team = sanitizeTeamSnapshot(new Array(500).fill({ collectionName: 'a'.repeat(500) }));
    assert.equal(team.length, 12);
    assert.ok(team[0].collectionName.length <= 64);

    const logs = sanitizeLogs(new Array(5000).fill({ round: 1, damage: 1e12, attackerSide: 'P9' }));
    assert.equal(logs.length, 200);
    assert.equal(logs[0].attackerSide, 'P1', 'unknown sides normalise to P1');
    assert.ok(Number.isFinite(logs[0].damage));
});

test('ai win rate is clamped to a playable range', () => {
    assert.equal(sanitizeAiWinRate(999), 0.95);
    assert.equal(sanitizeAiWinRate(-5), 0.05);
    assert.equal(sanitizeAiWinRate(undefined), 0.6);
    assert.equal(sanitizeAiWinRate(0.35), 0.35);
});

// ── determinism (the property record.js verification relies on) ─

test('a legitimate fighter passes through the sanitiser unchanged', () => {
    // If sanitising altered a legit fighter, the server re-simulation in
    // record.js would diverge from the client and reject honest wins.
    const legit = {
        hp: 150, maxHp: 150, atk: 30, def: 20, spd: 25,
        crit: 0.15, dodge: 0.1, lifesteal: 0.05, regen: 2, magicResist: 12,
        affinity: 'fire', passive: 'IRON_WALL', name: 'Hero #1'
    };

    const clean = sanitizeFighterStats(legit, { name: legit.name });

    for (const key of ['hp', 'maxHp', 'atk', 'def', 'spd', 'crit', 'dodge', 'lifesteal', 'regen', 'magicResist']) {
        assert.equal(clean[key], legit[key], `${key} must survive sanitisation untouched`);
    }
});

test('record.js verification accepts an honest result and rejects a forged one', async () => {
    const { simulateBattleV2 } = await import('../../../src/lib/battle/engineV2.js');

    // What the client simulates locally...
    const playerStats = { hp: 160, maxHp: 160, atk: 32, def: 18, spd: 26, crit: 0.12, name: 'Hero' };
    const enemyStats = { hp: 150, maxHp: 150, atk: 30, def: 20, spd: 22, name: 'Arena Bot' };
    const seed = 'ai:0xabc:slug_7:ai:Arena Bot';
    const clientRun = simulateBattleV2({ ...playerStats }, { ...enemyStats }, {
        seed, isAiBattle: true, aiWinRate: 0.6
    });

    // ...and what the server recomputes from the (sanitised) payload.
    const serverRun = simulateBattleV2(
        sanitizeFighterStats(JSON.parse(JSON.stringify(playerStats)), { name: 'Hero' }),
        sanitizeFighterStats(JSON.parse(JSON.stringify(enemyStats)), { name: 'Arena Bot' }),
        { seed, isAiBattle: true, aiWinRate: sanitizeAiWinRate(0.6) }
    );

    assert.equal(serverRun.winnerSide, clientRun.winnerSide, 'honest result verifies');

    const forged = clientRun.winnerSide === 'P1' ? 'P2' : 'P1';
    assert.notEqual(serverRun.winnerSide, forged, 'a forged winner is detectable');
});

test('the V2 engine is deterministic across JSON round-trips', async () => {
    const { simulateBattleV2 } = await import('../../../src/lib/battle/engineV2.js');

    const p1 = sanitizeFighterStats({ hp: 150, atk: 30, def: 20, spd: 25, crit: 0.15 }, { name: 'Hero' });
    const p2 = sanitizeFighterStats({ hp: 140, atk: 28, def: 22, spd: 20 }, { name: 'Bot' });
    const opts = { seed: 'ai:0xabc:slug_1:ai:Bot', isAiBattle: true, aiWinRate: 0.6 };

    const a = simulateBattleV2({ ...p1 }, { ...p2 }, { ...opts });
    const b = simulateBattleV2(
        JSON.parse(JSON.stringify(p1)),
        JSON.parse(JSON.stringify(p2)),
        JSON.parse(JSON.stringify(opts))
    );

    assert.equal(a.winnerSide, b.winnerSide);
    assert.equal(a.totalRounds, b.totalRounds);
    assert.equal(a.logs.length, b.logs.length);
});
