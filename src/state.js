/**
 * Simple centralized state management
 */

export const state = {
    platform: {
        inMiniApp: false,
        host: 'web', // 'web' | 'base' | 'farcaster' | 'unknown-miniapp'
        clientFid: null
    },
    wallet: {
        address: null,
        chainId: null,
        isConnected: false,
        connector: null
    },
    collection: null, // Current active collection config
    minting: {
        isMinting: false,
        txHash: null,
        error: null,
        success: false
    },
    mintPolicyState: {
        activeStage: null, // 'FREE', 'PAID', 'BURN_ERC20', etc.
        mintedCount: 0,
        totalSupply: 0,
        maxSupply: 0,
        isSoldOut: false
    },
    ui: {
        loading: true,
        view: 'home' // 'home', 'mint'
    }
};

// Simple event bus for state updates
export const EVENTS = {
    WALLET_UPDATE: 'wallet:update',
    CHAIN_UPDATE: 'wallet:chain',
    STATE_UPDATE: 'state:update',
    MINT_START: 'mint:start',
    MINT_SUCCESS: 'mint:success',
    MINT_ERROR: 'mint:error'
};

export function updateState(path, value) {
    // Simple deep set with auto-creation of missing intermediates
    const keys = path.split('.');
    let current = state;
    for (let i = 0; i < keys.length - 1; i++) {
        if (current[keys[i]] === undefined || current[keys[i]] === null) {
            current[keys[i]] = {};
        }
        current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;

    document.dispatchEvent(new CustomEvent(EVENTS.STATE_UPDATE, { detail: { path, value, state } }));
}
