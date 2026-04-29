/**
 * Daily Boss Simulation Engine
 * Generates a unique "World Boss" every 24 hours.
 */

export const BOSS_CONFIGS = [
    {
        name: "Zeus (Base God)",
        collection: "base-gods",
        // WARN-03 fix: external URLs 404'd; use an existing local placeholder until real assets exist
        imageUrl: "/image.png",
        stats: { hp: 150, atk: 35, def: 20, spd: 15 },
        passive: "DIVINE",
        biome: "biome-divine"
    },
    {
        name: "Void Sovereign",
        collection: "void-pfps",
        imageUrl: "/image.png",
        stats: { hp: 120, atk: 25, def: 25, spd: 30 },
        passive: "GHOST_STEP",
        biome: "biome-void"
    },
    {
        name: "Iron Titan",
        collection: "void-pfps",
        imageUrl: "/image.png",
        stats: { hp: 200, atk: 20, def: 40, spd: 5 },
        passive: "IRON_WALL",
        biome: "biome-volcano"
    }
];

function getBossVictoryKey(bossId, playerId = 'anonymous') {
    return `boss_win_${String(playerId || 'anonymous').toLowerCase()}_${bossId}`;
}

export function getDailyBoss() {
    // Deterministic seed based on date
    const day = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    const index = day % BOSS_CONFIGS.length;
    
    const boss = BOSS_CONFIGS[index];
    
    return {
        ...boss,
        id: `boss_${day}`,
        isBoss: true,
        isAi: true, // Use AI logic for simulation
        // Bosses are tougher than regular fighters
        dominancePercentile: 88 + (day % 10) 
    };
}

export function checkBossVictory(bossId, playerId = 'anonymous') {
    return !!localStorage.getItem(getBossVictoryKey(bossId, playerId));
}

export function recordBossVictory(bossId, playerId = 'anonymous') {
    localStorage.setItem(getBossVictoryKey(bossId, playerId), Date.now().toString());
    // In a real app, this would be a server-side record
}
