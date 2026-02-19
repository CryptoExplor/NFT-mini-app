import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector';
import { watchAccount, switchChain, getAccount, disconnect as wagmiDisconnect, reconnect, connect as wagmiConnect } from '@wagmi/core';
import { EVENTS, state as globalState } from './state.js';
import { DEFAULT_CHAIN, SUPPORTED_CHAINS } from './utils/chain.js';

// 1. Get Project ID
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

if (!projectId || projectId === 'REPLACE_ME') {
    console.error('Missing VITE_WALLETCONNECT_PROJECT_ID in .env');
}

// 2. Configure Networks
export const networks = [DEFAULT_CHAIN, ...SUPPORTED_CHAINS];

// 3. Configure Base Builder Code (ERC-8021)
// Using pre-encoded string provided by builder: bc_rqj8aj3n
export const DATA_SUFFIX = '0x62635f72716a38616a336e0b0080218021802180218021802180218021';

// 4. Create Wagmi Adapter with Farcaster support and Builder Code
export const wagmiAdapter = new WagmiAdapter({
    projectId,
    networks,
    ssr: false,
    dataSuffix: DATA_SUFFIX,
    connectors: [farcasterMiniApp()]
});

let currentUnwatch = null;
let modalInstancePromise = null;

async function getWalletModal() {
    if (!modalInstancePromise) {
        modalInstancePromise = (async () => {
            const [{ createAppKit }, { base }] = await Promise.all([
                import('@reown/appkit'),
                import('@reown/appkit/networks')
            ]);

            return createAppKit({
                adapters: [wagmiAdapter],
                networks: [base],
                projectId,
                themeMode: 'dark',
                features: {
                    analytics: true,
                    injected: true,
                    email: false,
                    socials: []
                },
                themeVariables: {
                    '--w3m-accent': '#6366F1',
                    '--w3m-border-radius-master': '1px'
                },
                metadata: {
                    name: 'Base Mint App',
                    description: 'Mint NFTs on Base',
                    url: typeof window !== 'undefined' ? window.location.origin : 'https://base-mintapp.vercel.app',
                    icons: [typeof window !== 'undefined' ? window.location.origin + '/icon.png' : 'https://base-mintapp.vercel.app/icon.png']
                },
                allWallets: 'SHOW'
            });
        })();
    }

    return modalInstancePromise;
}

function normalizeConnectorLabel(connector) {
    return `${connector?.id || ''} ${connector?.name || ''}`.toLowerCase();
}

function getPreferredMiniAppConnectors() {
    const connectors = wagmiAdapter.wagmiConfig.connectors || [];
    const host = globalState.platform?.host || 'web';

    const isBaseConnector = (connector) => {
        const label = normalizeConnectorLabel(connector);
        return connector?.id === 'baseAccount' ||
            label.includes('base account') ||
            label.includes('coinbase');
    };

    const isMiniAppConnector = (connector) => {
        const label = normalizeConnectorLabel(connector);
        return connector?.id === 'farcaster' ||
            connector?.id === 'farcasterMiniApp' ||
            label.includes('farcaster') ||
            label.includes('miniapp');
    };

    const baseConnectors = connectors.filter(isBaseConnector);
    const miniAppConnectors = connectors.filter(isMiniAppConnector);
    const ordered = host === 'base'
        ? [...baseConnectors, ...miniAppConnectors]
        : [...miniAppConnectors, ...baseConnectors];

    const seen = new Set();
    return ordered.filter((connector) => {
        const key = `${connector?.id || ''}:${connector?.name || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export async function connectMiniAppWalletSilently() {
    if (!globalState.platform?.inMiniApp) return false;

    const connectors = getPreferredMiniAppConnectors();
    if (!connectors.length) return false;

    for (const connector of connectors) {
        try {
            const result = await wagmiConnect(wagmiAdapter.wagmiConfig, { connector });
            if (result?.accounts?.[0]) {
                console.log(`✅ Connected via ${connector.name || connector.id || 'mini app connector'}`);
                return true;
            }
        } catch (error) {
            console.debug(`Mini app connect skipped for ${connector.name || connector.id || 'unknown connector'}:`, error?.message || error);
        }
    }

    return false;
}

export async function initWallet() {
    console.log('🔌 Initializing wallet connection...');

    // 1. Get initial account state FIRST (synchronously)
    const initialAccount = getAccount(wagmiAdapter.wagmiConfig);
    console.log('Initial account state:', {
        address: initialAccount.address,
        isConnected: initialAccount.isConnected,
        chainId: initialAccount.chainId,
        connector: initialAccount.connector?.name
    });

    // 2. Update global state immediately with initial state
    handleAccountChange(initialAccount);

    // 3. Watch for future account changes
    currentUnwatch = watchAccount(wagmiAdapter.wagmiConfig, {
        onChange(account) {
            console.log('📱 Account changed:', {
                address: account.address,
                isConnected: account.isConnected,
                chainId: account.chainId,
                connector: account.connector?.name
            });
            handleAccountChange(account);
        }
    });

    // 4. Try to reconnect if there's a previous session (async, but we don't block)
    try {
        const reconnectResult = await reconnect(wagmiAdapter.wagmiConfig);
        console.log('✅ Reconnected:', reconnectResult);

        // After reconnect, get the latest account state
        const updatedAccount = getAccount(wagmiAdapter.wagmiConfig);
        if (updatedAccount.address !== initialAccount.address ||
            updatedAccount.isConnected !== initialAccount.isConnected) {
            console.log('🔄 Account state updated after reconnect');
            handleAccountChange(updatedAccount);
        }
    } catch (error) {
        console.warn('⚠️ Reconnect failed (this is normal if no previous session):', error);
    }

    // Log available connectors for debugging
    console.log('Available connectors:', wagmiAdapter.wagmiConfig.connectors.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type
    })));
}

function handleAccountChange(account) {
    const wasConnected = globalState.wallet.isConnected;

    // Update global state
    globalState.wallet = {
        address: account.address,
        chainId: account.chainId,
        isConnected: account.isConnected,
        connector: account.connector
    };

    // Track wallet connect event (only on genuinely new user-initiated connection)
    // Skip auto-reconnects on page refresh by checking sessionStorage
    if (account.isConnected && !wasConnected && account.address) {
        const trackedKey = `wallet_tracked_${account.address.toLowerCase()}`;
        if (!sessionStorage.getItem(trackedKey)) {
            sessionStorage.setItem(trackedKey, '1');
            import('./lib/api.js').then(({ trackWalletConnect }) => {
                trackWalletConnect(account.address);
            }).catch(() => { });
        }
    }

    // Dispatch generic update event
    document.dispatchEvent(new CustomEvent(EVENTS.WALLET_UPDATE, { detail: account }));

    // Dispatch chain update if connected
    if (account.isConnected && account.chainId) {
        document.dispatchEvent(new CustomEvent(EVENTS.CHAIN_UPDATE, { detail: { chainId: account.chainId } }));
    }
}

export async function connectWallet() {
    const connected = await connectMiniAppWalletSilently();
    if (connected) return;
    const modal = await getWalletModal();
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
