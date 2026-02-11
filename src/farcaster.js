/**
 * Farcaster Frame SDK Integration
 * Handles initialization and frame context for Farcaster mini-apps
 */

import { sdk } from '@farcaster/miniapp-sdk';

let context = null;
let isReady = false;

/**
 * Initialize Farcaster SDK
 * NOTE: Returns sdk and context but does NOT call ready() here
 * ready() must be called from main.js after full app initialization
 */
export async function initFarcasterSDK() {
    try {
        // Check if we're running in a Farcaster context
        if (typeof window !== 'undefined' && window.parent !== window) {
            // Get the context from SDK with timeout
            const contextPromise = sdk.context;
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Context fetch timeout')), 2000)
            );

            try {
                context = await Promise.race([contextPromise, timeoutPromise]);
            } catch (e) {
                console.warn('Farcaster context fetch failed or timed out:', e);
                // Fallback: we might still be in a frame, so return sdk anyway
                // to allow calling ready()
            }

            console.log('Farcaster SDK initialized', context);

            // If context is null, we proceed cautiously but still return sdk
            // so we can signal ready()
            return { sdk, context };
        }
    } catch (error) {
        console.warn('Not in Farcaster context or SDK failed to load:', error);
    }

    return { sdk: null, context: null };
}

/**
 * Call this AFTER your app is fully loaded
 * This tells Farcaster the frame is ready to display
 */
export function notifyReady() {
    if (sdk && !isReady) {
        try {
            sdk.actions.ready({ disableNativeGestures: true });
            isReady = true;
            console.log('Farcaster: ready() called');
        } catch (error) {
            console.error('Failed to call ready():', error);
        }
    }
}

/**
 * Get current Farcaster context
 */
export function getFarcasterContext() {
    return context;
}

/**
 * Get Farcaster SDK instance
 */
export function getFarcasterSDK() {
    return sdk;
}

/**
 * Check if running in Farcaster
 */
export function isInFarcaster() {
    return sdk !== null && context !== null;
}

/**
 * Open URL in Farcaster
 */
export async function openUrl(url) {
    if (sdk) {
        try {
            await sdk.actions.openUrl(url);
        } catch (error) {
            console.error('Failed to open URL:', error);
            window.open(url, '_blank');
        }
    } else {
        window.open(url, '_blank');
    }
}

/**
 * Close the frame
 */
export async function closeFrame() {
    if (sdk) {
        try {
            await sdk.actions.close();
        } catch (error) {
            console.error('Failed to close frame:', error);
        }
    }
}
