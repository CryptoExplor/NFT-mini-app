import { readContract, writeContract, waitForTransactionReceipt, getAccount } from '@wagmi/core';
import { parseEther } from 'viem';
import { wagmiAdapter } from './wallet.js';
import { defaultCollectionId } from './collections.js';

// CORRECTED ABI - matches your actual contract
const MINTER_ABI = [
    {
        "inputs": [{"internalType": "uint256", "name": "tokenId", "type": "uint256"}],
        "name": "mint",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "totalMinted",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "address", "name": "owner", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"internalType": "uint256", "name": "result", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "MAX_SUPPLY",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "address", "name": "", "type": "address"}],
        "name": "mintedBy",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    }
];

/**
 * Resolves the current mint stage for a wallet based on the policy.
 */
export function resolveStage(policy, mintedCount) {
    let consumed = 0;
    const maxPerWallet = policy.maxPerWallet === null ? Infinity : policy.maxPerWallet;

    if (mintedCount >= maxPerWallet) {
        return null;
    }

    for (const stage of policy.stages) {
        const limit = stage.limit === null ? Infinity : stage.limit;
        if (mintedCount < consumed + limit) {
            return stage;
        }
        consumed += limit;
    }

    return null;
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

        const [supply, mintedByUser] = await Promise.all([
            readContract(config, {
                address: collection.contractAddress,
                abi: MINTER_ABI,
                functionName: 'totalMinted',
            }).catch(() => 0n),
            readContract(config, {
                address: collection.contractAddress,
                abi: MINTER_ABI,
                functionName: 'mintedBy',
                args: [walletAddress]
            }).catch(() => 0n)
        ]);

        return {
            totalSupply: Number(supply),
            mintedCount: Number(mintedByUser)
        };

    } catch (e) {
        console.error('Error fetching collection data', e);
        return { mintedCount: 0, totalSupply: 0 };
    }
}

/**
 * Generates a random unminted tokenId
 */
async function getRandomTokenId(collection) {
    const config = wagmiAdapter.wagmiConfig;
    
    // Get total minted to know how many tokens are available
    const totalMinted = await readContract(config, {
        address: collection.contractAddress,
        abi: MINTER_ABI,
        functionName: 'totalMinted',
    });

    if (Number(totalMinted) >= collection.maxSupply) {
        throw new Error('Collection sold out');
    }

    // Generate random tokenId between 0 and MAX_SUPPLY-1
    const randomId = Math.floor(Math.random() * collection.maxSupply);
    return BigInt(randomId);
}

/**
 * Executes mint based on stage type.
 */
export async function mint(collection, stage) {
    const config = wagmiAdapter.wagmiConfig;
    const contractAddress = collection.contractAddress;

    if (!stage) throw new Error('No active mint stage');

    // Get a random tokenId
    const tokenId = await getRandomTokenId(collection);

    switch (stage.type) {
        case 'FREE':
        case 'Free': // Handle both cases from your collections.js
            return writeContract(config, {
                address: contractAddress,
                abi: MINTER_ABI,
                functionName: 'mint',
                args: [tokenId] // FIXED: Only pass tokenId
            });

        case 'PAID':
            return writeContract(config, {
                address: contractAddress,
                abi: MINTER_ABI,
                functionName: 'mint',
                args: [tokenId],
                value: BigInt(stage.price)
            });

        default:
            throw new Error(`Unsupported stage type: ${stage.type}`);
    }
}
