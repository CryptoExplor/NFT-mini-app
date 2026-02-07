/**
 * Farcaster Frame SDK Integration
 * Handles initialization and frame context for Farcaster mini-apps
 */

import { sdk } from '@farcaster/miniapp-sdk';

let context = null;
let isReady = false;

/**
 * Initialize Farcaster SDK
 * NOTE: Do NOT call ready() here - it should be called after full app init
 */
export async function initFarcasterSDK() {
    try {
        // Check if we're running in a Farcaster context
        if (typeof window !== 'undefined' && window.parent !== window) {
            // Get the context from SDK
            context = await sdk.context;
            
            console.log('Farcaster SDK initialized', context);
            
            // DO NOT call ready() yet - let main.js call it after everything loads
            
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
            sdk.actions.ready();
            isReady = true;
            console.log('Farcaster: ready() called');
        } catch (error) {
            console.error('Failed to call ready():', error);
        }
    }
}

/**
 * Check if the mini app is currently installed
 */
export function isAppInstalled() {
    if (!context) return false;
    
    // Check if the app is in the user's installed apps
    // The SDK context will have information about installation status
    return context.client?.added === true;
}

/**
 * Prompt user to add the mini app to their Farcaster client
 * Should be called after successful wallet connection
 */
export async function addMiniApp() {
    if (sdk && sdk.actions && sdk.actions.addMiniApp) {
        try {
            await sdk.actions.addMiniApp();
            console.log('Add mini app prompt shown');
            return true;
        } catch (error) {
            console.log('Add mini app prompt declined or failed:', error);
            return false;
        }
    } else {
        console.warn('addMiniApp not available - not in Farcaster context');
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
