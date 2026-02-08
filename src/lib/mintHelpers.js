/**
 * Mint Helpers
 * Universal mint logic for all collection types (FREE, PAID, BURN)
 * 
 * This is a wrapper around the existing nft.js functions,
 * adapted to work with the new collection schema.
 */

import { wagmiAdapter } from '../wallet.js';
import { state } from '../state.js';
import { getContractConfig } from '../../contracts/index.js';
import { readContract, writeContract, waitForTransactionReceipt, getBalance } from '@wagmi/core';

// ============================================
// DATA FETCHING
// ============================================

/**
 * Get on-chain data for a collection
 * @param {Object} collection - Collection object
 * @param {string} userAddress - User's wallet address
 * @returns {Object} { mintedCount, totalSupply, balanceOf }
 */
export async function getCollectionData(collection, userAddress) {
    const config = getContractConfig(collection);
    const wagmiConfig = wagmiAdapter.wagmiConfig;

    try {
        // Fetch total minted
        let totalSupply = 0;
        try {
            totalSupply = await readContract(wagmiConfig, {
                address: config.address,
                abi: config.abi,
                functionName: 'totalMinted',
                chainId: config.chainId
            });
            totalSupply = Number(totalSupply);
        } catch (e) {
            console.warn('totalMinted not available, trying totalSupply');
            try {
                totalSupply = await readContract(wagmiConfig, {
                    address: config.address,
                    abi: config.abi,
                    functionName: 'totalSupply',
                    chainId: config.chainId
                });
                totalSupply = Number(totalSupply);
            } catch (e2) {
                console.warn('Could not fetch total supply');
            }
        }

        // Fetch user's minted count
        let mintedCount = 0;
        if (userAddress) {
            try {
                mintedCount = await readContract(wagmiConfig, {
                    address: config.address,
                    abi: config.abi,
                    functionName: 'mintedBy',
                    args: [userAddress],
                    chainId: config.chainId
                });
                mintedCount = Number(mintedCount);
            } catch (e) {
                console.warn('mintedBy not available, using balanceOf');
                try {
                    mintedCount = await readContract(wagmiConfig, {
                        address: config.address,
                        abi: config.abi,
                        functionName: 'balanceOf',
                        args: [userAddress],
                        chainId: config.chainId
                    });
                    mintedCount = Number(mintedCount);
                } catch (e2) {
                    console.warn('Could not fetch minted count');
                }
            }
        }

        return {
            mintedCount,
            totalSupply,
            maxSupply: collection.mintPolicy.maxSupply
        };

    } catch (error) {
        console.error('Error fetching collection data:', error);
        return {
            mintedCount: 0,
            totalSupply: 0,
            maxSupply: collection.mintPolicy.maxSupply
        };
    }
}

// ============================================
// STAGE RESOLUTION
// ============================================

/**
 * Resolve which mint stage a user should be in
 * @param {Object} mintPolicy - Collection's mint policy
 * @param {number} mintedCount - Number of NFTs user has minted
 * @returns {Object|null} Active stage or null if no valid stage
 */
export function resolveStage(mintPolicy, mintedCount) {
    const { stages, maxPerWallet } = mintPolicy;

    // Check wallet limit
    if (maxPerWallet !== null && mintedCount >= maxPerWallet) {
        return null;
    }

    let accumulated = 0;

    for (const stage of stages) {
        const stageLimit = stage.limit ?? Infinity;
        const upperBound = accumulated + stageLimit;

        if (mintedCount < upperBound) {
            return stage;
        }

        accumulated = upperBound;
    }

    // Check if last stage has unlimited mints
    const lastStage = stages[stages.length - 1];
    if (lastStage && lastStage.limit === null) {
        return lastStage;
    }

    return null;
}

// ============================================
// MINTING
// ============================================

/**
 * Execute a mint transaction
 * @param {Object} collection - Collection object
 * @param {Object} stage - Current mint stage
 * @returns {string} Transaction hash
 */
export async function mint(collection, stage) {
    const config = getContractConfig(collection);
    const wagmiConfig = wagmiAdapter.wagmiConfig;

    // Get the next tokenId based on totalMinted
    let tokenId;
    try {
        const totalMinted = await readContract(wagmiConfig, {
            address: config.address,
            abi: config.abi,
            functionName: 'totalMinted',
            chainId: config.chainId
        });
        // The next tokenId is typically totalMinted (0-indexed) or totalMinted + 1 (1-indexed)
        // Most contracts use the minted count as the next ID
        tokenId = Number(totalMinted);
        console.log(`📊 Total minted: ${tokenId}, using as next tokenId`);
    } catch (e) {
        // Fallback to random if totalMinted fails
        tokenId = Math.floor(Math.random() * 1_000_000_000);
        console.log(`⚠️ Could not get totalMinted, using random tokenId: ${tokenId}`);
    }

    let hash;

    switch (stage.type) {
        case 'FREE':
            hash = await mintFree(config, wagmiConfig, tokenId);
            break;

        case 'PAID':
            hash = await mintPaid(config, wagmiConfig, tokenId, stage.price);
            break;

        case 'BURN_ERC20':
            hash = await mintBurn(config, wagmiConfig, tokenId, stage);
            break;

        default:
            throw new Error(`Unknown mint type: ${stage.type}`);
    }

    // Wait for confirmation
    await waitForTransactionReceipt(wagmiConfig, {
        hash,
        confirmations: 1
    });

    console.log(`✅ Mint successful! TX: ${hash}`);
    return hash;
}

/**
 * Free mint
 */
async function mintFree(config, wagmiConfig, tokenId) {
    console.log('🎁 Executing FREE mint...');

    // Try different function names
    const functionNames = ['mint', 'freeMint', 'claim'];

    for (const funcName of functionNames) {
        try {
            const hash = await writeContract(wagmiConfig, {
                address: config.address,
                abi: config.abi,
                functionName: funcName,
                args: [tokenId],
                chainId: config.chainId
            });
            return hash;
        } catch (e) {
            console.log(`${funcName} failed, trying next...`);
        }
    }

    throw new Error('No valid free mint function found on contract');
}

/**
 * Paid mint
 */
async function mintPaid(config, wagmiConfig, tokenId, price) {
    console.log(`💰 Executing PAID mint (${price / 1e18} ETH)...`);

    // Try different function names
    const functionNames = ['paidMint', 'mint', 'publicMint'];

    for (const funcName of functionNames) {
        try {
            const hash = await writeContract(wagmiConfig, {
                address: config.address,
                abi: config.abi,
                functionName: funcName,
                args: [tokenId],
                value: BigInt(price),
                chainId: config.chainId
            });
            return hash;
        } catch (e) {
            console.log(`${funcName} failed, trying next...`);
        }
    }

    throw new Error('No valid paid mint function found on contract');
}

/**
 * Burn to mint
 */
async function mintBurn(config, wagmiConfig, tokenId, stage) {
    console.log(`🔥 Executing BURN mint (${stage.amount} tokens)...`);

    // ERC20 approve + burn flow would go here
    // This is a placeholder for burn-to-mint functionality

    throw new Error('BURN_ERC20 not implemented yet. Add ERC20 approval flow.');
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get mint button text based on stage
 * @param {Object} stage - Current stage
 * @returns {string} Button text
 */
export function getMintButtonText(stage) {
    if (!stage) return 'Limit Reached';

    switch (stage.type) {
        case 'FREE':
            return 'Free Mint';
        case 'PAID':
            return `Mint (${stage.price / 1e18} ETH)`;
        case 'BURN_ERC20':
            return 'Burn to Mint';
        default:
            return 'Mint';
    }
}

/**
 * Get mint type label for collection
 * @param {Object} mintPolicy - Collection's mint policy
 * @returns {string} Label (e.g., "FREE + PAID")
 */
export function getMintTypeLabel(mintPolicy) {
    const hasFree = mintPolicy.stages.some(s => s.type === 'FREE');
    const hasPaid = mintPolicy.stages.some(s => s.type === 'PAID');
    const hasBurn = mintPolicy.stages.some(s => s.type === 'BURN_ERC20');

    if (hasFree && hasPaid) return 'FREE + PAID';
    if (hasFree && hasBurn) return 'FREE + BURN';
    if (hasFree) return 'FREE MINT';
    if (hasPaid) return 'PAID MINT';
    if (hasBurn) return 'BURN TO MINT';
    return 'MINT';
}
