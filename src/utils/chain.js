import { base, baseSepolia } from 'viem/chains';

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
