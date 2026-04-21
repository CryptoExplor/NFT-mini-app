export const BOSS_CONFIG = {
    id: 'VOID_TITAN_001',
    name: 'The Void Titan',
    description: 'A massive entity from the Glitch Zone. Collaborate with all holders to bring it down!',
    maxHp: 2500000, // 2.5 Million
    imageUrl: 'https://emerald-glamorous-leech-291.mypinata.cloud/ipfs/Qma8yAnV3RszG6S1wH8KzX6vG7tP9jKq5vT1qV5R5mG7U1', // Temporary placeholder icon
    // Stats for the "Avatar" the player actually fights (Normalized)
    stats: {
        hp: 1500, // Much tankier than a normal player
        atk: 32,  // Hard hitting but not one-shotting
        def: 25,  // Solid defense
        spd: 20,  // Slow but steady
        crit: 0.15,
        dodge: 0.05,
        lifesteal: 0,
        regen: 5
    }
};

export const REDIS_KEYS = {
    BOSS_HP: 'arcade:boss:hp',
    BOSS_LAST_RESET: 'arcade:boss:last_reset',
    DAILY_RAID: 'arcade:user:daily_raid', // arcade:user:daily_raid:YYYY-MM-DD:wallet
    RAID_LEADERBOARD: 'arcade:leaderboard:raid'
};
