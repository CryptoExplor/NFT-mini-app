/**
 * Farcaster Frame SDK Integration
 * Handles initialization and frame context for Farcaster mini-apps
 */

import { sdk } from '@farcaster/miniapp-sdk';

let context = null;
let isReady = false;

/**
 * Initialize Farcaster SDK
 * Returns sdk and context but does NOT call ready()
 * ready() must be called from main.js after full app initialization
 */
export async function initFarcasterSDK() {
    try {
        // Check if we're running in a Farcaster context
        if (typeof window === 'undefined') {
            console.log('Not in browser environment');
            return { sdk: null, context: null };
        }

        // More robust Farcaster detection
        const isInFrame = window.parent !== window;
        const hasFarcasterSDK = typeof sdk !== 'undefined' && sdk !== null;

        if (!isInFrame || !hasFarcasterSDK) {
            console.log('Not in Farcaster context');
            return { sdk: null, context: null };
        }

        // Get the context from SDK with timeout
        const contextPromise = sdk.context;
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('SDK context timeout')), 5000)
        );

        context = await Promise.race([contextPromise, timeoutPromise]);
        
        console.log('✅ Farcaster SDK initialized', {
            client: context?.client?.name,
            user: context?.user?.fid,
            location: context?.location
        });
        
        return { sdk, context };

    } catch (error) {
        console.warn('⚠️ Not in Farcaster context or SDK failed to load:', error.message);
        return { sdk: null, context: null };
    }
}

/**
 * Call this AFTER your app is fully loaded
 * This tells Farcaster the frame is ready to display
 */
export function notifyReady(options = {}) {
    if (!sdk || isReady) {
        console.log('SDK not available or already ready');
        return false;
    }

    try {
        sdk.actions.ready({ 
            disableNativeGestures: true,
            ...options 
        });
        isReady = true;
        console.log('✅ Farcaster: ready() called');
        return true;
    } catch (error) {
        console.error('❌ Failed to call ready():', error);
        return false;
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
 * Prompt user to add mini app (with better error handling)
 */
export async function promptAddMiniApp() {
    if (!sdk || !sdk.actions?.addMiniApp) {
        console.warn('addMiniApp not available');
        return false;
    }

    try {
        await sdk.actions.addMiniApp();
        console.log('✅ addMiniApp prompt shown');
        return true;
    } catch (error) {
        // User declined or error occurred
        console.log('ℹ️ addMiniApp prompt declined or failed:', error.message);
        return false;
    }
}

/**
 * Open URL in Farcaster
 */
export async function openUrl(url) {
    if (sdk && sdk.actions?.openUrl) {
        try {
            await sdk.actions.openUrl(url);
            return true;
        } catch (error) {
            console.error('Failed to open URL via SDK:', error);
        }
    }
    
    // Fallback
    window.open(url, '_blank');
    return false;
}

/**
 * Close the frame
 */
export async function closeFrame() {
    if (sdk && sdk.actions?.close) {
        try {
            await sdk.actions.close();
            return true;
        } catch (error) {
            console.error('Failed to close frame:', error);
        }
    }
    return false;
}
