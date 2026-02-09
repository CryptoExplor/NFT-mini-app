import { base as baseChain, baseSepolia } from 'viem/chains';

// Override Base Mainnet RPC
const base = {
    ...baseChain,
    rpcUrls: {
        ...baseChain.rpcUrls,
        default: { http: ['https://base-mainnet.infura.io/v3/f0c6b3797dd54dc2aa91cd4a463bcc57'] },
        public: { http: ['https://base-mainnet.infura.io/v3/f0c6b3797dd54dc2aa91cd4a463bcc57'] }
    }
};

export const SUPPORTED_CHAINS = [base, baseSepolia];

export const DEFAULT_CHAIN = import.meta.env.VITE_DEFAULT_CHAIN === 'base-sepolia'
    ? baseSepolia
    : base;

export function isSupportedChain(chainId) {
    return SUPPORTED_CHAINS.some(c => c.id === chainId);
}

export function getChainConfig(chainId) {
    return SUPPORTED_CHAINS.find(c => c.id === chainId);
}

/**
 * Get chain name from ID
 */
export function getChainName(chainId) {
    const chains = {
        1: 'Ethereum',
        8453: 'Base',
        84532: 'Base Sepolia',
        10: 'Optimism',
        42161: 'Arbitrum'
    };
    return chains[chainId] || `Chain ${chainId}`;
}

/**
 * Get block explorer URL
 */
export function getExplorerUrl(chainId) {
    const explorers = {
        1: 'https://etherscan.io',
        8453: 'https://basescan.org',
        84532: 'https://sepolia.basescan.org',
        10: 'https://optimistic.etherscan.io',
        42161: 'https://arbiscan.io'
    };
    return explorers[chainId] || 'https://basescan.org';
}

/**
 * Get block explorer address URL
 */
export function getExplorerAddressUrl(chainId, address) {
    if (chainId === 8453) return `https://basescan.org/token/${address}`;
    if (chainId === 84532) return `https://sepolia.basescan.org/token/${address}`;
    return `https://etherscan.io/token/${address}`;
}
