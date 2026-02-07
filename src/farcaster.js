/**
 * Farcaster Frame SDK Integration
 * Handles initialization and frame context for Farcaster mini-apps
 */

import { sdk } from '@farcaster/miniapp-sdk';

let context = null;

/**
 * Initialize Farcaster SDK
 */
export async function initFarcasterSDK() {
    try {
        // Check if we're running in a Farcaster context
        if (typeof window !== 'undefined' && window.parent !== window) {
            // Get the context from SDK
            context = await sdk.context;
            
            console.log('Farcaster SDK initialized', context);
            
            // CRITICAL: Call ready() to tell Farcaster the app is loaded
            sdk.actions.ready();
            
            return { sdk, context };
        }
    } catch (error) {
        console.warn('Not in Farcaster context or SDK failed to load:', error);
    }
    
    return { sdk: null, context: null };
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
