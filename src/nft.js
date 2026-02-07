import { readContract, writeContract, waitForTransactionReceipt, getAccount } from '@wagmi/core';
import { parseEther } from 'viem';
import { wagmiAdapter } from './wallet.js';
import { defaultCollectionId } from './collections.js';

// ABI for Standard Mint
// Using a generic ABI that covers most Mint Policy needs. 
// Ideally this would be imported from a JSON artifact, but inline for portability here.
const MINTER_ABI = [
    { inputs: [{ name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }], name: 'mint', outputs: [], stateMutability: 'nonpayable', type: 'function' },
    { inputs: [{ name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }], name: 'mintPaid', outputs: [], stateMutability: 'payable', type: 'function' },
    { inputs: [], name: 'totalSupply', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [{ name: 'owner', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }
];

/**
 * Resolves the current mint stage for a wallet based on the policy.
 * @param {object} policy The mint policy from collections.js
 * @param {number} mintedCount Number of tokens already minted by this wallet
 */
export function resolveStage(policy, mintedCount) {
    let consumed = 0;

    // If unlimited maxPerWallet, treated as Infinity
    const maxPerWallet = policy.maxPerWallet === null ? Infinity : policy.maxPerWallet;

    if (mintedCount >= maxPerWallet) {
        return null; // Cap reached
    }

    for (const stage of policy.stages) {
        const limit = stage.limit === null ? Infinity : stage.limit;

        // Check if this stage has available room for the user's next mint (mintedCount + 1)
        // Actually, we check if the *current* mintedCount falls within this stage's range.
        // e.g. Free limit 1. mintedCount 0. consumed 0. 0 < 0 + 1? Yes. Return Free.
        // e.g. Free limit 1. mintedCount 1. consumed 0 + 1 = 1. 1 < 1? No. Next stage.

        if (mintedCount < consumed + limit) {
            return stage;
        }
        consumed += limit;
    }

    return null; // No stages left
}

/**
 * Gets live data for logic: supply, minted count for user.
 */
export async function getCollectionData(collection, walletAddress) {
    if (!walletAddress) {
        return { mintedCount: 0, totalSupply: 0 };
    }

    try {
        const config = wagmiAdapter.wagmiConfig;

        // Multicall would be better here, but doing parallel for now
        const [supply, balance] = await Promise.all([
            readContract(config, {
                address: collection.contractAddress,
                abi: MINTER_ABI,
                functionName: 'totalSupply',
            }).catch(() => 0n), // Default to 0 if fail
            readContract(config, {
                address: collection.contractAddress,
                abi: MINTER_ABI,
                functionName: 'balanceOf',
                args: [walletAddress]
            }).catch(() => 0n)
        ]);

        return {
            totalSupply: Number(supply),
            mintedCount: Number(balance)
        };

    } catch (e) {
        console.error('Error fetching collection data', e);
        return { mintedCount: 0, totalSupply: 0 };
    }
}

/**
 * Executes mint based on stage type.
 */
export async function mint(collection, stage, amount = 1) {
    const config = wagmiAdapter.wagmiConfig;
    const contractAddress = collection.contractAddress;

    if (!stage) throw new Error('No active mint stage');

    switch (stage.type) {
        case 'FREE':
            return writeContract(config, {
                address: contractAddress,
                abi: MINTER_ABI,
                functionName: 'mint',
                args: [await getAccount(config).address, 0n] // Generic mint
            });

        case 'PAID':
            return writeContract(config, {
                address: contractAddress,
                abi: MINTER_ABI,
                functionName: 'mintPaid',
                args: [await getAccount(config).address, 0n], // Generic
                value: BigInt(stage.price)
            });

        // BURN logic would go here

        default:
            throw new Error(`Unsupported stage type: ${stage.type}`);
    }
}
