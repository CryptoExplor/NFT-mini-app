/**
 * Farcaster Frame SDK Integration
 * Handles initialization and frame context for Farcaster mini-apps
 */

import { sdk } from '@farcaster/miniapp-sdk';

const MINIAPP_HOSTS = {
    WEB: 'web',
    BASE: 'base',
    FARCASTER: 'farcaster',
    UNKNOWN: 'unknown-miniapp'
};
const BASE_APP_CLIENT_FID = 309857;

let context = null;
let isReady = false;
let inMiniApp = false;
let miniAppHost = MINIAPP_HOSTS.WEB;
let miniAppClientFid = null;

function resetMiniAppState() {
    context = null;
    inMiniApp = false;
    miniAppHost = MINIAPP_HOSTS.WEB;
    miniAppClientFid = null;
}

function resolveMiniAppHost(ctx) {
    const clientFid = Number(ctx?.client?.clientFid);
    if (!Number.isFinite(clientFid)) {
        return { host: MINIAPP_HOSTS.UNKNOWN, clientFid: null };
    }
    if (clientFid === BASE_APP_CLIENT_FID) {
        return { host: MINIAPP_HOSTS.BASE, clientFid };
    }
    return { host: MINIAPP_HOSTS.FARCASTER, clientFid };
}

/**
 * Initialize Farcaster SDK
 * NOTE: Returns sdk and context but does NOT call ready() here
 * ready() must be called from main.js after full app initialization
 */
export async function initFarcasterSDK() {
    try {
        if (typeof window === 'undefined') {
            return { sdk: null, context: null, inMiniApp: false, host: MINIAPP_HOSTS.WEB, clientFid: null };
        }

        // Prefer SDK runtime check over frame heuristics.
        if (typeof sdk?.isInMiniApp === 'function') {
            inMiniApp = await sdk.isInMiniApp();
        } else {
            inMiniApp = window.parent !== window;
        }

        if (!inMiniApp) {
            resetMiniAppState();
            return { sdk: null, context: null, inMiniApp: false, host: MINIAPP_HOSTS.WEB, clientFid: null };
        }

        context = await sdk.context;
        const resolved = resolveMiniAppHost(context);
        miniAppHost = resolved.host;
        miniAppClientFid = resolved.clientFid;

        console.log('Farcaster SDK initialized', context);
        console.log('Context details:', {
            host: miniAppHost,
            clientFid: miniAppClientFid,
            client: context.client,
            user: context.user,
            location: context.location
        });

        // DO NOT call ready() here - main.js will call it after everything loads
        return { sdk, context, inMiniApp, host: miniAppHost, clientFid: miniAppClientFid };
    } catch (error) {
        resetMiniAppState();
        console.warn('Not in Farcaster context or SDK failed to load:', error);
    }

    return { sdk: null, context: null, inMiniApp: false, host: MINIAPP_HOSTS.WEB, clientFid: null };
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
 * Check if running in a Farcaster Mini App host (Warpcast/Base/etc).
 */
export function isInFarcaster() {
    return inMiniApp;
}

/**
 * Check if running in any Mini App host.
 */
export function isInMiniApp() {
    return inMiniApp;
}

/**
 * Returns host identifier: web | base | farcaster | unknown-miniapp
 */
export function getMiniAppHost() {
    return miniAppHost;
}

/**
 * Client FID from Mini App context (when available).
 */
export function getMiniAppClientFid() {
    return miniAppClientFid;
}

/**
 * True when app is running inside Base App Mini App host.
 */
export function isInBaseApp() {
    return miniAppHost === MINIAPP_HOSTS.BASE;
}

/**
 * True when app is running in a non-Base Farcaster client (e.g. Warpcast).
 */
export function isInFarcasterClient() {
    return miniAppHost === MINIAPP_HOSTS.FARCASTER;
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
