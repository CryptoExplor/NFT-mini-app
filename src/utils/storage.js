/**
 * Safe storage helpers.
 *
 * Direct `localStorage` access throws in several very real situations:
 *   - Safari Private Browsing / "Block all cookies"
 *   - embedded webviews with storage partitioning disabled (Farcaster, Base App)
 *   - quota exhaustion (QuotaExceededError) once per-battle keys pile up
 *   - corrupted values (a half-written JSON blob) breaking JSON.parse
 *
 * Any of those used to throw straight through the game/battle code paths and
 * blank the page. Everything here degrades to an in-memory fallback instead.
 */

const memoryStore = new Map();

let storageAvailable = null;

function getStore() {
    if (storageAvailable === null) {
        try {
            const probe = '__storage_probe__';
            window.localStorage.setItem(probe, '1');
            window.localStorage.removeItem(probe);
            storageAvailable = true;
        } catch {
            storageAvailable = false;
            console.warn('[storage] localStorage unavailable — using in-memory fallback');
        }
    }
    return storageAvailable ? window.localStorage : null;
}

export function getItem(key, fallback = null) {
    const store = getStore();
    if (!store) return memoryStore.has(key) ? memoryStore.get(key) : fallback;

    try {
        const value = store.getItem(key);
        return value === null ? fallback : value;
    } catch {
        return fallback;
    }
}

export function setItem(key, value) {
    const store = getStore();
    if (!store) {
        memoryStore.set(key, String(value));
        return false;
    }

    try {
        store.setItem(key, String(value));
        return true;
    } catch (error) {
        // Most likely QuotaExceededError — keep the app alive.
        console.warn(`[storage] Failed to persist "${key}":`, error?.name || error);
        memoryStore.set(key, String(value));
        return false;
    }
}

export function removeItem(key) {
    memoryStore.delete(key);
    const store = getStore();
    if (!store) return;
    try {
        store.removeItem(key);
    } catch { /* ignore */ }
}

/** Read + JSON.parse without ever throwing. */
export function getJSON(key, fallback = null) {
    const raw = getItem(key, null);
    if (raw === null || raw === undefined || raw === '') return fallback;

    try {
        const parsed = JSON.parse(raw);
        return parsed === null || parsed === undefined ? fallback : parsed;
    } catch {
        console.warn(`[storage] Corrupted JSON at "${key}" — resetting`);
        removeItem(key);
        return fallback;
    }
}

/** JSON.stringify + write without ever throwing. */
export function setJSON(key, value) {
    try {
        return setItem(key, JSON.stringify(value));
    } catch (error) {
        console.warn(`[storage] Failed to serialise "${key}":`, error?.message || error);
        return false;
    }
}

/**
 * List keys that start with a prefix (safe, and works with the memory fallback).
 */
export function keysWithPrefix(prefix) {
    const store = getStore();
    if (!store) return [...memoryStore.keys()].filter((key) => key.startsWith(prefix));

    try {
        const keys = [];
        for (let i = 0; i < store.length; i++) {
            const key = store.key(i);
            if (key && key.startsWith(prefix)) keys.push(key);
        }
        return keys;
    } catch {
        return [];
    }
}

/**
 * Drop the oldest keys sharing a prefix once the count exceeds `keep`.
 * Used for unbounded per-entity keys (e.g. one marker per battle played).
 */
export function pruneKeys(prefix, keep = 200) {
    const keys = keysWithPrefix(prefix);
    if (keys.length <= keep) return 0;

    // Keys are created in chronological order, so removing the head is FIFO
    // enough for cleanup purposes.
    const doomed = keys.slice(0, keys.length - keep);
    doomed.forEach(removeItem);
    return doomed.length;
}

export const storage = {
    getItem,
    setItem,
    removeItem,
    getJSON,
    setJSON,
    keysWithPrefix,
    pruneKeys
};
