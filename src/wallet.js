import { createAppKit } from '@reown/appkit';
import { mainnet, base, baseSepolia } from '@reown/appkit/networks';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector';
import { injected } from '@wagmi/connectors';
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

// 3. Create custom injected connector that detects Farcaster wallet
const farcasterInjectedConnector = injected({
    target() {
        return {
            id: 'farcaster',
            name: 'Farcaster Wallet',
            provider(window) {
                // Check for Farcaster wallet in window.ethereum providers
                if (window.ethereum?.providers) {
                    const provider = window.ethereum.providers.find(
                        (p) => p.isFarcaster || p.isFarcasterWallet
                    );
                    if (provider) return provider;
                }
                
                // Check if single provider is Farcaster
                if (window.ethereum?.isFarcaster || window.ethereum?.isFarcasterWallet) {
                    return window.ethereum;
                }
                
                // Fallback to window.farcaster if it exists
                if (window.farcaster) {
                    return window.farcaster;
                }
                
                return undefined;
            },
        };
    },
});

// 4. Create Wagmi Adapter with multiple connectors
export const wagmiAdapter = new WagmiAdapter({
    projectId,
    networks,
    connectors: [
        // Farcaster Mini App connector (for embedded frames)
        farcasterMiniApp(),
        // Custom Farcaster injected wallet connector
        farcasterInjectedConnector,
        // Standard injected connector for other wallets (MetaMask, etc.)
        injected({ target: 'metaMask' }),
        injected({ target: 'coinbaseWallet' })
    ]
});

// 5. Create Modal
export const modal = createAppKit({
    adapters: [wagmiAdapter],
    networks: [base],
    projectId,
    themeMode: 'dark',
    features: {
        analytics: true,
        injected: true, // Enable injected wallet detection
        email: false, // Disable email wallet
        socials: [] // Disable social logins
    },
    themeVariables: {
        '--w3m-accent': '#6366F1',
        '--w3m-border-radius-master': '1px'
    },
    // Metadata for better wallet detection
    metadata: {
        name: 'Base Mint App',
        description: 'Mint NFTs on Base',
        url: typeof window !== 'undefined' ? window.location.origin : 'https://base-mintapp.vercel.app',
        icons: [typeof window !== 'undefined' ? window.location.origin + '/icon.png' : 'https://base-mintapp.vercel.app/icon.png']
    },
    // Enable all wallet detection methods
    enableInjected: true,
    enableEIP6963: true,
    enableCoinbase: true,
    // Featured wallet IDs (helps with prioritization and detection)
    featuredWalletIds: [
        'farcaster', // Custom Farcaster wallet
        'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96', // MetaMask
        'fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa' // Coinbase
    ]
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
