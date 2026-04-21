import { simulateBattleV2 } from './src/lib/battle/engineV2.js';
import { createPRNG } from './src/lib/battle/prng.js';

console.log("--- BATTLE ENGINE V2 DETERMINISM AUDIT ---");

const PLAYER_CHALLENGER = {
    hp: 180, atk: 25, def: 18, spd: 14, crit: 0.1, dodge: 0.05, lifesteal: 0,
    name: 'ByteBeat #938', role: 'FIGHTER'
};

const ENEMY_DEFENDER = {
    hp: 200, atk: 15, def: 25, spd: 8, crit: 0.05, dodge: 0.15, lifesteal: 0,
    name: 'CyberPunk #111', role: 'FIGHTER'
};

const SEED = "0x9876543210DEADBEEF";

try {
    const prng1 = createPRNG(SEED);
    const fight1 = simulateBattleV2(PLAYER_CHALLENGER, ENEMY_DEFENDER, { prng: prng1 });

    const prng2 = createPRNG(SEED);
    const fight2 = simulateBattleV2(PLAYER_CHALLENGER, ENEMY_DEFENDER, { prng: prng2 });

    console.log(`FIGHT 1 WINNER: ${fight1.winnerSide} (${fight1.winner.name}) in ${fight1.totalRounds} rounds.`);
    console.log(`FIGHT 2 WINNER: ${fight2.winnerSide} (${fight2.winner.name}) in ${fight2.totalRounds} rounds.`);

    if (JSON.stringify(fight1.logs) !== JSON.stringify(fight2.logs)) {
        throw new Error("❌ FAILURE: Engine execution is not deterministic!");
    }
    console.log("✅ AUDIT PASS: Engine execution is 100% deterministic.");
    console.log("✅ AUDIT PASS: Log serialization stable.");
    
    if (!fight1.winnerSide || !fight1.logs || fight1.logs.length === 0) {
        throw new Error("❌ FAILURE: Engine V2 output shape is missing required API fields mapping!");
    }
    console.log("✅ AUDIT PASS: V2 shape standard intact.");
    
} catch (err) {
    console.error("AUDIT FAILED:", err);
    process.exit(1);
}
