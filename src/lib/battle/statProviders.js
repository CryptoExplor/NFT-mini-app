/**
 * Stat providers (compatibility shim)
 *
 * This module used to export a `verifyOwnership()` that logged a message and
 * returned `true` unconditionally, under a comment reading "CRITICAL MVP
 * FUNCTION: Do not trust client-side ownership". It was never imported, but a
 * stub that always says "yes" is a trap waiting to be wired into a security
 * check.
 *
 * Real ownership verification now lives server-side in
 * `api/_lib/battle/ownership.js` (on-chain ownerOf/balanceOf with an OpenSea
 * inventory fallback, KV-cached), and is enforced when posting a challenge,
 * defending a fight and recording an AI battle.
 */

/**
 * @deprecated Ownership cannot be verified from the browser — the answer would
 * be attacker-controlled. Use the server-side check instead.
 * @throws {Error} always
 */
export async function verifyOwnership() {
    throw new Error(
        'verifyOwnership() was removed from the client: ownership is verified server-side ' +
        '(api/_lib/battle/ownership.js). A client-side check can always be bypassed.'
    );
}

/**
 * Dynamic on-chain stat reads were never implemented; collections currently
 * derive stats from metadata via metadataNormalizer.js.
 * @returns {Promise<Object>} always an empty object
 */
export async function fetchDynamicStats() {
    return {};
}
