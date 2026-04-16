import { signMessage } from '@wagmi/core';
import { wagmiAdapter } from '../../wallet.js';
import {
    clearAuthToken,
    downloadCSV,
    getAdminData,
    getAuthToken,
    getNonce,
    verifySignature,
} from '../api.js';

function buildAdminSiweMessage(walletAddress, chainId, nonce) {
    const domain = window.location.host;
    const origin = window.location.origin;
    const issuedAt = new Date().toISOString();

    return `${domain} wants you to sign in with your Ethereum account:\n${walletAddress}\n\nSign in to Mint Intelligence Admin\n\nURI: ${origin}\nVersion: 1\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${issuedAt}`;
}

export function hasAdminSession() {
    return Boolean(getAuthToken());
}

export function clearAdminSession() {
    clearAuthToken();
}

export function isUnauthorizedAdminResponse(data) {
    return data?.status === 401 || data?.status === 403;
}

export async function requestAdminAuth({ walletAddress, chainId = 8453 }) {
    if (!walletAddress) return { success: false, error: 'Connect wallet first' };

    try {
        const nonceData = await getNonce(walletAddress);
        const nonce = nonceData?.nonce;
        if (!nonce) return { success: false, error: 'Failed to get nonce' };

        const message = buildAdminSiweMessage(walletAddress, chainId, nonce);
        const signature = await signMessage(wagmiAdapter.wagmiConfig, { message });
        const verified = await verifySignature(message, signature);

        if (!verified?.token) {
            return { success: false, error: 'Signature verified but no token returned' };
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: error?.message || 'Admin sign-in failed' };
    }
}

export async function fetchAdminOverviewData() {
    return getAdminData('overview');
}

export async function fetchAdminDateData(action, date) {
    return getAdminData(action, date);
}

export async function exportAdminCsv(type) {
    return downloadCSV(type);
}
