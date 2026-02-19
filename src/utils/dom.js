/**
 * Selects a DOM element.
 * @param {string} selector 
 * @returns {HTMLElement|null}
 */
export const $ = (selector) => document.querySelector(selector);

/**
 * Selects all DOM elements matching selector.
 * @param {string} selector 
 * @returns {NodeListOf<Element>}
 */
export const $$ = (selector) => document.querySelectorAll(selector);

/**
 * formats an address to 0x12..34
 * @param {string} address 
 */
export function shortenAddress(address) {
    if (!address) return '';
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/**
 * Sleeps for ms milliseconds
 * @param {number} ms 
 */
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Formats ether amount
 * @param {bigint} val 
 */
export function formatEther(val) {
    // Precision-safe BigInt → ETH string conversion (avoids Number() overflow)
    const bi = BigInt(val);
    const divisor = 10n ** 18n;
    const whole = bi / divisor;
    const remainder = bi % divisor;
    if (remainder === 0n) return whole.toString();
    const fracStr = remainder.toString().padStart(18, '0').replace(/0+$/, '');
    return `${whole}.${fracStr}`;
}

/**
 * Safe localStorage wrapper that handles errors gracefully
 */
export const safeLocalStorage = {
    getItem(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            console.warn('localStorage.getItem failed:', e);
            return null;
        }
    },
    setItem(key, value) {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (e) {
            console.warn('localStorage.setItem failed:', e);
            return false;
        }
    },
    removeItem(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (e) {
            console.warn('localStorage.removeItem failed:', e);
            return false;
        }
    }
};
