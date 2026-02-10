import { createAppKit } from '@reown/appkit';
import { base, baseSepolia } from '@reown/appkit/networks';
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

// 3. Create Wagmi Adapter with Farcaster support
export const wagmiAdapter = new WagmiAdapter({
    projectId,
    networks,
    ssr: false
});

// 4. Create Modal with improved configuration
export const modal = createAppKit({
    adapters: [wagmiAdapter],
    networks: [base],
    projectId,
    themeMode: 'dark',
    features: {
        analytics: true,
        injected: true, // Enable injected wallet detection
        email: false,
        socials: []
    },
    themeVariables: {
        '--w3m-accent': '#6366F1',
        '--w3m-border-radius-master': '1px'
    },
    // Enhanced metadata for better detection
    metadata: {
        name: 'Base Mint App',
        description: 'Mint NFTs on Base',
        url: typeof window !== 'undefined' ? window.location.origin : 'https://base-mintapp.vercel.app',
        icons: [typeof window !== 'undefined' ? window.location.origin + '/icon.png' : 'https://base-mintapp.vercel.app/icon.png']
    },
    allWallets: 'SHOW' // Show all available wallets
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
    
    // Log available connectors for debugging
    console.log('Available connectors:', wagmiAdapter.wagmiConfig.connectors.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type
    })));
}

function handleAccountChange(account) {
    // Dispatch generic update
    document.dispatchEvent(new CustomEvent(EVENTS.WALLET_UPDATE, { detail: account }));

    // Check Chain
    if (account.isConnected && account.chainId) {
        document.dispatchEvent(new CustomEvent(EVENTS.CHAIN_UPDATE, { detail: { chainId: account.chainId } }));
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
    }
}

export function getCurrentAccount() {
    return getAccount(wagmiAdapter.wagmiConfig);
}

export async function switchToBase() {
    await switchChain(wagmiAdapter.wagmiConfig, { chainId: DEFAULT_CHAIN.id });
}



