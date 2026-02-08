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

    // Get the next tokenId
    let tokenId;

    // SCENARIO 1: Random ID within specific range (e.g. for Generative Art like BaseHeads)
    if (collection.tokenIdRange) {
        const { start, end } = collection.tokenIdRange;
        const range = end - start + 1;
        tokenId = Math.floor(Math.random() * range) + start;
        console.log(`🎲 Using random tokenId from range [${start}-${end}]: ${tokenId}`);
    }
    // SCENARIO 2: Sequential ID based on totalMinted (Standard)
    else {
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
            // Fallback to random within supply limit
            const max = collection.mintPolicy.maxSupply || 1_000_000_000;
            tokenId = Math.floor(Math.random() * max);
            console.log(`⚠️ Could not get totalMinted, using random tokenId: ${tokenId} (max: ${max})`);
        }
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
    const amountToBurn = BigInt(stage.amount) * 1_000_000_000_000_000_000n; // Assuming 18 decimals
    console.log(`🔥 Executing BURN mint (${stage.amount} tokens)...`);

    const tokenAddress = stage.token;
    const spenderAddress = config.address; // The NFT contract is the spender
    const userAddress = state.wallet.address;

    // Minimum ERC20 ABI for allowance and approve
    const erc20Abi = [
        {
            name: 'allowance',
            type: 'function',
            stateMutability: 'view',
            inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
            outputs: [{ name: '', type: 'uint256' }]
        },
        {
            name: 'approve',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
            outputs: [{ name: '', type: 'bool' }]
        },
        {
            name: 'balanceOf',
            type: 'function',
            stateMutability: 'view',
            inputs: [{ name: 'account', type: 'address' }],
            outputs: [{ name: '', type: 'uint256' }]
        }
    ];

    // 1. Check Balance
    const balance = await readContract(wagmiConfig, {
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [userAddress],
        chainId: config.chainId
    });

    if (balance < amountToBurn) {
        throw new Error(`Insufficient ${stage.tokenName || 'token'} balance. You have ${Number(balance) / 1e18}, need ${stage.amount}.`);
    }

    // 2. Check Allowance
    const allowance = await readContract(wagmiConfig, {
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [userAddress, spenderAddress],
        chainId: config.chainId
    });

    console.log(`Current allowance: ${allowance}, Needed: ${amountToBurn}`);

    // 3. Approve if needed
    if (allowance < amountToBurn) {
        console.log('Requesting approval...');
        // Update UI to show "Approving..." if possible, but we are inside the function
        // You might want to pass a callback for status updates in a future refactor

        const approveHash = await writeContract(wagmiConfig, {
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'approve',
            args: [spenderAddress, amountToBurn], // Approve exact amount or MaxUint256
            chainId: config.chainId
        });

        console.log(`Approval tx sent: ${approveHash}`);
        await waitForTransactionReceipt(wagmiConfig, { hash: approveHash });
        console.log('Approval confirmed!');
    }

    // 4. Execute Mint
    // Try minting function. For burn-to-mint, it's usually just 'mint' or 'burnMint'
    // The contract handles the transferFrom and burn
    const functionNames = ['mint', 'burnMint'];

    for (const funcName of functionNames) {
        try {
            console.log(`Attempting mint with function: ${funcName}`);
            const hash = await writeContract(wagmiConfig, {
                address: config.address,
                abi: config.abi,
                functionName: funcName,
                args: [tokenId], // Some burn mints might assume tokenId, others might just be amount. Assuming tokenId based on previous logic.
                chainId: config.chainId
            });
            return hash;
        } catch (e) {
            console.log(`${funcName} failed:`, e);
        }
    }

    throw new Error('No valid burn mint function found on contract');
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
