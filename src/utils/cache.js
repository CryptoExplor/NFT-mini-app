
/**
 * Advanced Caching System
 * Supports in-memory and persistent (localStorage) caching with TTL
 */

const APP_PREFIX = 'nft_app_';

class CacheSystem {
    constructor() {
        this.memoryCache = new Map();
    }

    /**
     * Set a value in cache
     * @param {string} key - Cache key
     * @param {any} value - Value to store
     * @param {number} ttl - Time to live in milliseconds
     * @param {boolean} persistent - Whether to store in localStorage
     */
    set(key, value, ttl = 60000, persistent = false) {
        const entry = {
            value,
            expiry: Date.now() + ttl
        };

        // Store in memory
        this.memoryCache.set(key, entry);

        // Store in localStorage if requested
        if (persistent) {
            try {
                localStorage.setItem(APP_PREFIX + key, JSON.stringify(entry));
            } catch (e) {
                console.warn('Cache: localStorage set failed', e);
            }
        }
    }

    /**
     * Get a value from cache
     * @param {string} key - Cache key
     * @returns {any|null} Value or null if not found or expired
     */
    get(key) {
        // 1. Check memory cache first
        let entry = this.memoryCache.get(key);

        // 2. Check localStorage if not in memory
        if (!entry) {
            try {
                const stored = localStorage.getItem(APP_PREFIX + key);
                if (stored) {
                    entry = JSON.parse(stored);
                }
            } catch (e) {
                console.warn('Cache: localStorage get failed', e);
            }
        }

        if (!entry) return null;

        // Check expiry
        if (Date.now() > entry.expiry) {
            this.delete(key);
            return null;
        }

        return entry.value;
    }

    /**
     * Delete a key from cache
     */
    delete(key) {
        this.memoryCache.delete(key);
        try {
            localStorage.removeItem(APP_PREFIX + key);
        } catch (e) { }
    }

    /**
     * Clear all cached data
     */
    clear() {
        this.memoryCache.clear();
        // Only clear our app's keys from localStorage
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith(APP_PREFIX)) {
                localStorage.removeItem(key);
            }
        });
    }

    /**
     * Cleanup expired items from localStorage
     */
    cleanup() {
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith(APP_PREFIX)) {
                try {
                    const entry = JSON.parse(localStorage.getItem(key));
                    if (entry && entry.expiry && Date.now() > entry.expiry) {
                        localStorage.removeItem(key);
                    }
                } catch (e) {
                    localStorage.removeItem(key);
                }
            }
        });
    }
}

export const cache = new CacheSystem();

// Run cleanup once on load
if (typeof window !== 'undefined') {
    setTimeout(() => cache.cleanup(), 5000);
}
