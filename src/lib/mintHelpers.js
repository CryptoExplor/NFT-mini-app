/**
 * Mint Helpers
 * Universal mint logic for all collection types (FREE, PAID, BURN)
 * 
 * This is a wrapper around the existing nft.js functions,
 * adapted to work with the new collection schema.
 */

import { wagmiAdapter, DATA_SUFFIX } from '../wallet.js';
import { state } from '../state.js';
import { getContractConfig } from '../../contracts/index.js';
import { readContract, writeContract, waitForTransactionReceipt, getBalance } from '@wagmi/core';
import { encodePacked, keccak256, encodeFunctionData } from 'viem';
import { cache } from '../utils/cache.js';

// ============================================
// EIP-5792 BATCH TRANSACTION SUPPORT
// ============================================

/**
 * Check if the connected wallet supports EIP-5792 (wallet_sendCalls).
 * Caches the result for the current session.
 */
let _batchCapability = null;
async function supportsBatchCalls() {
    if (_batchCapability !== null) return _batchCapability;
    try {
        const provider = await wagmiAdapter?.wagmiConfig?.connector?.getProvider?.();
        if (!provider?.request) {
            _batchCapability = false;
            return false;
        }

        const capabilities = await provider.request({
            method: 'wallet_getCapabilities',
        });

        // Check if any chain supports atomicBatch
        const chainCaps = capabilities?.[`0x${(8453).toString(16)}`] || capabilities?.['0x2105'] || {};
        _batchCapability = !!chainCaps?.atomicBatch?.supported;
        console.log(`EIP-5792 batch support: ${_batchCapability}`);
        return _batchCapability;
    } catch {
        _batchCapability = false;
        return false;
    }
}

/**
 * Send batched calls via EIP-5792 wallet_sendCalls.
 * @param {Array<{to: string, data: string, value?: string}>} calls
 * @returns {string} Bundle ID or transaction hash
 */
async function sendBatchedCalls(calls) {
    const provider = await wagmiAdapter.wagmiConfig.connector.getProvider();
    const chainId = `0x${(8453).toString(16)}`;

    const result = await provider.request({
        method: 'wallet_sendCalls',
        params: [{
            version: '1.0',
            chainId,
            from: state.wallet.address,
            calls: calls.map(c => ({
                to: c.to,
                data: c.data,
                value: c.value || '0x0',
            })),
        }],
    });

    return result;
}

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
    const cacheKey = `col_data_${collection.slug}_${userAddress || 'anon'}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

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

        const data = {
            mintedCount,
            totalSupply,
            maxSupply: collection.mintPolicy.maxSupply
        };

        // Cache for 30 seconds
        cache.set(cacheKey, data, 30000);

        return data;

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
 * Fetch the next available tokenId
 */
export async function fetchNextTokenId(collection, config, wagmiConfig) {
    if (collection.tokenIdRange) {
        const { start, end } = collection.tokenIdRange;
        const range = end - start + 1;
        return Math.floor(Math.random() * range) + start;
    }

    try {
        const totalMinted = await readContract(wagmiConfig, {
            address: config.address,
            abi: config.abi,
            functionName: 'totalMinted',
            chainId: config.chainId
        });
        return Number(totalMinted);
    } catch (e) {
        const max = collection.mintPolicy.maxSupply || 1_000_000_000;
        return Math.floor(Math.random() * max);
    }
}

/**
 * Execute a mint transaction
 * @param {Object} collection - Collection object
 * @param {Object} stage - Current mint stage
 * @returns {string} Transaction hash
 */
export async function mint(collection, stage) {
    const config = getContractConfig(collection);
    const wagmiConfig = wagmiAdapter.wagmiConfig;

    const tokenId = await fetchNextTokenId(collection, config, wagmiConfig);

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
/**
 * Helper to determine if a function expects quantity or tokenId
 */
function getMintArgs(abi, functionName, tokenId) {
    const abiItem = abi.find(item => item.name === functionName && item.type === 'function');
    if (!abiItem || !abiItem.inputs || abiItem.inputs.length === 0) {
        return [];
    }

    const firstInputName = abiItem.inputs[0].name.toLowerCase();

    // Heuristic: If first arg is 'quantity' or 'amount', use 1. Otherwise use tokenId.
    if (firstInputName.includes('quantity') || firstInputName.includes('amount')) {
        return [1]; // Mint 1
    }

    return [tokenId];
}

/**
 * Free mint
 */
async function mintFree(config, wagmiConfig, tokenId) {
    console.log('🎁 Executing FREE mint...');

    const functionNames = ['mint', 'freeMint', 'claim'];

    for (const funcName of functionNames) {
        // Check if function exists in ABI
        const exists = config.abi.some(item => item.name === funcName && item.type === 'function');
        if (!exists) continue;

        try {
            const args = getMintArgs(config.abi, funcName, tokenId);

            const hash = await writeContract(wagmiConfig, {
                address: config.address,
                abi: config.abi,
                functionName: funcName,
                args: args,
                chainId: config.chainId,
                dataSuffix: DATA_SUFFIX
            });
            return hash;
        } catch (e) {
            // STOP if user explicitly rejected the transaction
            if (e.name === 'UserRejectedRequestError' || e.message.includes('User rejected')) {
                throw e;
            }
            console.log(`${funcName} failed, trying next...`, e.shortMessage || e.message);
        }
    }

    throw new Error('No valid free mint function found on contract');
}

/**
 * Paid mint
 */
async function mintPaid(config, wagmiConfig, tokenId, price) {
    console.log(`💰 Executing PAID mint (${Number(price) / 1e18} ETH)...`);

    const functionNames = ['paidMint', 'mint', 'publicMint'];

    for (const funcName of functionNames) {
        // Check if function exists in ABI
        const exists = config.abi.some(item => item.name === funcName && item.type === 'function');
        if (!exists) continue;

        try {
            const args = getMintArgs(config.abi, funcName, tokenId);

            const hash = await writeContract(wagmiConfig, {
                address: config.address,
                abi: config.abi,
                functionName: funcName,
                args: args,
                value: BigInt(price),
                chainId: config.chainId,
                dataSuffix: DATA_SUFFIX
            });
            return hash;
        } catch (e) {
            // STOP if user explicitly rejected the transaction
            if (e.name === 'UserRejectedRequestError' || e.message.includes('User rejected')) {
                throw e;
            }
            console.log(`${funcName} failed, trying next...`, e.shortMessage || e.message);
        }
    }

    throw new Error('No valid paid mint function found on contract');
}

/**
 * Burn to mint
 * Supports EIP-5792 batch transactions when available.
 */
async function mintBurn(config, wagmiConfig, tokenId, stage) {
    const decimals = stage.decimals || 18;
    const amountToBurn = BigInt(stage.amount) * (10n ** BigInt(decimals)); // Respect decimals
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

    // 3. If approval needed, try EIP-5792 batching (approve + mint in one step)
    if (allowance < amountToBurn) {
        const canBatch = await supportsBatchCalls();

        if (canBatch) {
            console.log('⚡ Using EIP-5792 batch: approve + mint in single call');

            // Encode approve calldata
            const approveData = encodeFunctionData({
                abi: erc20Abi,
                functionName: 'approve',
                args: [spenderAddress, amountToBurn],
            });

            // Try each possible mint function name
            const functionNames = ['mint', 'burnMint'];
            for (const funcName of functionNames) {
                try {
                    const mintData = encodeFunctionData({
                        abi: config.abi,
                        functionName: funcName,
                        args: [tokenId],
                    });

                    // Batch approve + mint into one wallet_sendCalls
                    const bundleId = await sendBatchedCalls([
                        { to: tokenAddress, data: approveData },
                        { to: config.address, data: mintData },
                    ]);

                    console.log(`✅ Batched approve+mint sent, bundle: ${bundleId}`);
                    return bundleId;
                } catch (e) {
                    if (e.name === 'UserRejectedRequestError' || e.message?.includes('User rejected')) {
                        throw e;
                    }
                    console.log(`Batched ${funcName} failed:`, e);
                }
            }

            // If batch failed for all functions, fall through to sequential
            console.warn('Batch failed, falling back to sequential approve → mint');
        }

        // Sequential fallback: approve first, then mint
        console.log('Requesting approval...');
        const approveHash = await writeContract(wagmiConfig, {
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'approve',
            args: [spenderAddress, amountToBurn],
            chainId: config.chainId,
            dataSuffix: DATA_SUFFIX
        });

        console.log(`Approval tx sent: ${approveHash}`);
        await waitForTransactionReceipt(wagmiConfig, { hash: approveHash });
        console.log('Approval confirmed!');
    }

    // 4. Execute Mint (sequential — either allowance was sufficient or approve just confirmed)
    const functionNames = ['mint', 'burnMint'];

    for (const funcName of functionNames) {
        try {
            console.log(`Attempting mint with function: ${funcName}`);
            const hash = await writeContract(wagmiConfig, {
                address: config.address,
                abi: config.abi,
                functionName: funcName,
                args: [tokenId],
                chainId: config.chainId,
                dataSuffix: DATA_SUFFIX
            });
            return hash;
        } catch (e) {
            if (e.name === 'UserRejectedRequestError' || e.message?.includes('User rejected')) {
                throw e;
            }
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
            return `Mint (${Number(BigInt(stage.price)) / 1e18} ETH)`;
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

/**
 * Verify if an address is on the allowlist using Merkle proofs
 */
export async function verifyAllowlist(address, proof, merkleRoot) {
    if (!proof || !merkleRoot) return false;

    // WARNING: This is a mock implementation that always returns true.
    // In production, use a library like merkletreejs to verify Merkle proofs.
    console.warn('[verifyAllowlist] Using mock implementation — always returns true. Implement proper Merkle proof verification for production.');
    const leaf = keccak256(address);
    return true;
}

/**
 * Store a successful transaction in localStorage
 */
export function storeTransaction(tx) {
    const transactions = JSON.parse(localStorage.getItem('nft_transactions') || '[]');
    transactions.unshift({
        ...tx,
        timestamp: Date.now()
    });
    localStorage.setItem('nft_transactions', JSON.stringify(transactions.slice(0, 50)));
}

/**
 * Get stored transactions from localStorage
 */
export function getStoredTransactions() {
    return JSON.parse(localStorage.getItem('nft_transactions') || '[]');
}
