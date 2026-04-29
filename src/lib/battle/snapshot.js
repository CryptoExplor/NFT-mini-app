import hash from 'object-hash';

/**
 * Creates a unique deterministic hash for a set of normalized stats.
 * Uses object-hash for isomorphic support (works in Browser + Vercel Node).
 * 
 * @param {Object} normalizedStats - Output from metadataNormalizer.js
 * @returns {string} SHA-256 hash string
 */
export function createSnapshotHash(normalizedStats) {
    return hash(normalizedStats, { algorithm: 'sha256' });
}

/**
 * Specialized helper for Battle Challenges.
 * Hashes the combination of loadout choices and current stats.
 * 
 * @param {Object} loadout - The BattleLoadoutV1 object
 * @param {Object} stats - The fighter's normalized stats
 * @returns {string} SHA-256 hash string
 */
export function computeLoadoutSnapshot(loadout, stats) {
    return createSnapshotHash({
        loadout,
        stats: stats || {}
    });
}

/**
 * Validates if the current live stats still match the provided snapshot hash.
 * 
 * @param {Object} currentLiveStats - The freshly normalized stats right now
 * @param {string} previousSnapshotHash - The hash generated at the time of Challenge/Preview
 * @returns {boolean} True if stats have not drifted
 */
export function validateSnapshot(currentLiveStats, previousSnapshotHash) {
    const liveHash = createSnapshotHash(currentLiveStats);
    return liveHash === previousSnapshotHash;
}
