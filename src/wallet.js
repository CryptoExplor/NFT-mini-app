import { createAppKit } from '@reown/appkit';
import { mainnet, base, baseSepolia } from '@reown/appkit/networks';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector';
import { watchAccount, switchChain, getAccount, disconnect as wagmiDisconnect, reconnect } from '@wagmi/core';
import { EVENTS } from './state.js';
import { DEFAULT_CHAIN, SUPPORTED_CHAINS } from './utils/chain.js';

// 1. Get Project ID
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

if (!projectId || projectId === 'REPLACE_ME') {
    console.error('Missing VITE_WALLETCONNECT_PROJECT_ID in .env');
}

// 2. Configure Networks
export const networks = [DEFAULT_CHAIN, ...SUPPORTED_CHAINS];

// 3. Create Wagmi Adapter
export const wagmiAdapter = new WagmiAdapter({
    projectId,
    networks,
    connectors: [
        farcasterMiniApp()
    ]
});

// 4. Create Modal
export const modal = createAppKit({
    adapters: [wagmiAdapter],
    networks: [base],
    projectId,
    themeMode: 'dark',
    features: {
        analytics: true
    },
    themeVariables: {
        '--w3m-accent': '#6366F1',
        '--w3m-border-radius-master': '1px'
    }
});

let currentUnwatch = null;

export function initWallet() {
    // Watch for account changes
    currentUnwatch = watchAccount(wagmiAdapter.wagmiConfig, {
        onChange(account) {
            handleAccountChange(account);
        }
    });

    // Reconnect if possible
    reconnect(wagmiAdapter.wagmiConfig);
}

function handleAccountChange(account) {
    // Dispatch generic update
    document.dispatchEvent(new CustomEvent(EVENTS.WALLET_UPDATE, { detail: account }));

    // Check Chain
    if (account.isConnected && account.chainId) {
        document.dispatchEvent(new CustomEvent(EVENTS.CHAIN_UPDATE, { detail: { chainId: account.chainId } }));

        // Auto-switch if wrong chain (optional, but requested as guard)
        // We only enforce if we are definitely on a supported network list but wrong one?
        // Or strictly enforce DEFAULT_CHAIN? 
        // Let's strictly enforce if we are connected but on wrong chain.
        /*
        if (account.chainId !== DEFAULT_CHAIN.id) {
           // Ideally show UI toast/notification instead of forcing immediately to avoid annoyance loops
           console.warn('Wrong chain detected');
        }
        */
    }
}

export async function connectWallet() {
    await modal.open();
}

export async function disconnectWallet() {
    try {
        const account = getAccount(wagmiAdapter.wagmiConfig);
        console.log('Disconnecting from:', account.connector?.name);

        if (account.connector) {
            await wagmiDisconnect(wagmiAdapter.wagmiConfig, { connector: account.connector });
        } else {
            await wagmiDisconnect(wagmiAdapter.wagmiConfig);
        }
    } catch (error) {
        console.error('Failed to disconnect:', error);
        // Force reload if disconnect fails state-wise?
        // window.location.reload(); 
    }
}

export function getCurrentAccount() {
    return getAccount(wagmiAdapter.wagmiConfig);
}

export async function switchToBase() {
    await switchChain(wagmiAdapter.wagmiConfig, { chainId: DEFAULT_CHAIN.id });
}
