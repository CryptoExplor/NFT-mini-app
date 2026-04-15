/**
 * Seeded PRNG — Deterministic Random Number Generator
 *
 * Uses mulberry32 algorithm for fast, reproducible randomness.
 * Given the same seed string, produces the identical sequence of numbers.
 *
 * Usage:
 *   const rng = createPRNG('my-seed-string');
 *   rng(); // 0.123456...
 *   rng(); // 0.789012...
 *
 * For battle determinism:
 *   const seed = generateBattleSeed(challengeId, playerId, enemyId);
 *   const rng = createPRNG(seed);
 *   simulateBattle(player, enemy, rng, options);
 */

/**
 * Hash a string to a 32-bit unsigned integer.
 * Uses FNV-1a for fast, well-distributed hashing.
 *
 * @param {string} str - Input string to hash
 * @returns {number} 32-bit unsigned integer
 */
function hashStringToSeed(str) {
    let hash = 0x811c9dc5; // FNV offset basis
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193); // FNV prime
    }
    return hash >>> 0; // Ensure unsigned 32-bit
}

/**
 * Mulberry32 PRNG — fast, high-quality 32-bit generator.
 * Period: 2^32. Passes PractRand and SmallCrush.
 *
 * @param {number} seed - 32-bit unsigned integer seed
 * @returns {Function} () => number in [0, 1)
 */
function mulberry32(seed) {
    let state = seed | 0;
    return function () {
        state = (state + 0x6D2B79F5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Create a seeded PRNG function from a string seed.
 *
 * @param {string} seedString - Any string (challenge ID, combined IDs, etc.)
 * @returns {Function} () => number in [0, 1) — drop-in replacement for Math.random
 */
export function createPRNG(seedString) {
    if (!seedString || typeof seedString !== 'string') {
        throw new Error('PRNG requires a non-empty string seed');
    }
    const numericSeed = hashStringToSeed(seedString);
    return mulberry32(numericSeed);
}

/**
 * Generate a deterministic battle seed from match parameters.
 * Same inputs always produce the same seed string.
 *
 * @param {string} challengeId - Unique challenge identifier
 * @param {string} playerId - Player's fighter identifier (e.g., "BASE_INVADERS_42")
 * @param {string} enemyId - Enemy's fighter identifier
 * @returns {string} Deterministic seed string for createPRNG()
 */
export function generateBattleSeed(challengeId, playerId, enemyId) {
    // Sort player/enemy IDs to ensure same seed regardless of who is "player" vs "enemy"
    const [a, b] = [playerId, enemyId].sort();
    return `battle:${challengeId}:${a}:${b}`;
}
