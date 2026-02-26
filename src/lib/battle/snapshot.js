/**
 * Snapshot System (Browser-Compatible)
 * 
 * Creates a frozen hash of a fighter's stats to prevent stat-drift abuse 
 * for mutable collections (e.g. NeonRunes, ByteBeats) between the time 
 * a challenge is posted and when it is fought.
 * 
 * Uses Web Crypto API (SubtleCrypto) instead of Node.js crypto for browser compatibility.
 */

/**
 * Creates a unique deterministic hash for a set of normalized stats.
 * @param {Object} normalizedStats - Output from metadataNormalizer.js
 * @returns {Promise<string>} SHA-256 hash hex string
 */
export async function createSnapshotHash(normalizedStats) {
    // Stringify deterministically (keys sorted) to ensure same stats = same hash
    const sortedKeys = Object.keys(normalizedStats).sort();
    const statString = sortedKeys.map(k => `${k}:${normalizedStats[k]}`).join('|');

    const encoder = new TextEncoder();
    const data = encoder.encode(statString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    // Convert ArrayBuffer to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validates if the current live stats still match the provided snapshot hash.
 * 
 * @param {Object} currentLiveStats - The freshly normalized stats right now
 * @param {string} previousSnapshotHash - The hash generated at the time of Challenge/Preview
 * @returns {Promise<boolean>} True if stats have not drifted
 */
export async function validateSnapshot(currentLiveStats, previousSnapshotHash) {
    const liveHash = await createSnapshotHash(currentLiveStats);
    return liveHash === previousSnapshotHash;
}
