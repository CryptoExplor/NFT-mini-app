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
