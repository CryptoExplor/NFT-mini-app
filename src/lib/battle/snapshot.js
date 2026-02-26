/**
 * Snapshot System (Browser-Compatible)
 * 
 * Creates a frozen hash of a fighter's stats to prevent stat-drift abuse 
 * for mutable collections (e.g. NeonRunes, ByteBeats) between the time 
 * a challenge is posted and when it is fought.
 * 
 * Uses Web Crypto API (SubtleCrypto) instead of Node.js crypto for browser compatibility.
 */

import hash from 'object-hash';

/**
 * Creates a unique deterministic hash for a set of normalized stats.
 * Uses object-hash for isomorphic support (works in Browser + Vercel Node).
 * 
 * @param {Object} normalizedStats - Output from metadataNormalizer.js
 * @returns {Promise<string>} SHA-1 hash hex string
 */
export async function createSnapshotHash(normalizedStats) {
    // object-hash guarantees deterministic hashing even if key insertion order changes
    return hash(normalizedStats, { algorithm: 'sha1' });
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
