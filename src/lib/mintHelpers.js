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
import { encodePacked, keccak256, encodeFunctionData, getAddress, isAddress, parseUnits } from 'viem';
import { cache } from '../utils/cache.js';
import { storage } from '../utils/storage.js';

// ============================================
// EIP-5792 BATCH TRANSACTION SUPPORT
// ============================================

/**
 * Check if the connected wallet supports EIP-5792 (wallet_sendCalls).
 * Caches capability per chain ID for the current session.
 */
const _batchCapabilityByChain = new Map();

function toHexChainId(chainId) {
    return `0x${Number(chainId).toString(16)}`;
}

async function getWalletProvider(wagmiConfig) {
    const connector = wagmiConfig?.connector;
    const provider = await connector?.getProvider?.();
    if (!provider?.request) {
        throw new Error('Wallet provider does not support request()');
    }
    return provider;
}

function hasAtomicBatchSupport(capabilityEntry) {
    if (!capabilityEntry || typeof capabilityEntry !== 'object') return false;
    if (capabilityEntry?.atomicBatch?.supported === true) return true;
    if (capabilityEntry?.atomicBatch === true) return true;
    return false;
}

async function supportsBatchCalls(wagmiConfig, chainId) {
    const cacheKey = String(chainId);
    if (_batchCapabilityByChain.has(cacheKey)) {
        return _batchCapabilityByChain.get(cacheKey);
    }

    try {
        const provider = await getWalletProvider(wagmiConfig);
        const capabilities = await provider.request({
            method: 'wallet_getCapabilities'
        });

        const hexChainId = toHexChainId(chainId);
        const chainCaps = capabilities?.[hexChainId];
        let supported = hasAtomicBatchSupport(chainCaps);

        // Some wallets return capabilities keyed differently; accept any supported chain as fallback.
        if (!supported && capabilities && typeof capabilities === 'object') {
            for (const entry of Object.values(capabilities)) {
                if (hasAtomicBatchSupport(entry)) {
                    supported = true;
                    break;
                }
            }
        }

        _batchCapabilityByChain.set(cacheKey, supported);
        console.log(`EIP-5792 batch support (${hexChainId}): ${supported}`);
        return supported;
    } catch {
        _batchCapabilityByChain.set(cacheKey, false);
        return false;
    }
}

/**
 * Robust user-rejection detection. `e.message` can be undefined on provider
 * errors, and `e.message.includes(...)` then threw inside the catch block.
 */
function isUserRejection(error) {
    if (!error) return false;
    if (error.name === 'UserRejectedRequestError') return true;
    if (error.code === 4001) return true;
    const message = String(error.shortMessage || error.message || '').toLowerCase();
    return message.includes('user rejected') || message.includes('user denied');
}

function isTxHash(value) {
    return typeof value === 'string' && /^0x[a-fA-F0-9]{64}$/.test(value);
}

function extractTxHashFromValue(value, visited = new Set()) {
    if (isTxHash(value)) return value;
    if (!value || typeof value !== 'object') return null;
    if (visited.has(value)) return null;
    visited.add(value);

    if (Array.isArray(value)) {
        for (const entry of value) {
            const found = extractTxHashFromValue(entry, visited);
            if (found) return found;
        }
        return null;
    }

    const preferredKeys = [
        'transactionHash',
        'txHash',
        'hash',
        'receipt',
        'receipts',
        'result'
    ];

    for (const key of preferredKeys) {
        if (key in value) {
            const found = extractTxHashFromValue(value[key], visited);
            if (found) return found;
        }
    }

    for (const nested of Object.values(value)) {
        const found = extractTxHashFromValue(nested, visited);
        if (found) return found;
    }

    return null;
}

function extractBundleId(sendCallsResult) {
    if (typeof sendCallsResult === 'string') return sendCallsResult;
    if (!sendCallsResult || typeof sendCallsResult !== 'object') return null;
    return (
        sendCallsResult.id ||
        sendCallsResult.bundleId ||
        sendCallsResult.callBundleId ||
        sendCallsResult.result?.id ||
        sendCallsResult.result?.bundleId ||
        null
    );
}

function parseBatchStatus(rawStatus) {
    if (typeof rawStatus === 'string') {
        return rawStatus.toLowerCase();
    }
    if (typeof rawStatus === 'number') {
        if (rawStatus >= 400) return 'failed';
        if (rawStatus >= 200) return 'confirmed';
        return 'pending';
    }
    return 'pending';
}

async function waitForBatchedTxHash(provider, bundleId, options = {}) {
    const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : 120000;
    const pollMs = Number.isFinite(Number(options.pollMs)) ? Number(options.pollMs) : 1500;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        let statusResult;
        try {
            statusResult = await provider.request({
                method: 'wallet_getCallsStatus',
                params: [bundleId]
            });
        } catch (error) {
            if (isTxHash(bundleId)) {
                return bundleId;
            }
            throw new Error(`wallet_getCallsStatus unavailable for bundle ${bundleId}: ${error?.message || error}`);
        }

        const hash = extractTxHashFromValue(statusResult);
        if (hash) return hash;

        const status = parseBatchStatus(
            statusResult?.status !== undefined
                ? statusResult.status
                : statusResult?.result?.status
        );

        if (
            status.includes('failed') ||
            status.includes('revert') ||
            status.includes('reject') ||
            status.includes('error') ||
            status.includes('cancel')
        ) {
            throw new Error(`Batched calls failed (bundle ${bundleId})`);
        }

        await new Promise((resolve) => setTimeout(resolve, pollMs));
    }

    if (isTxHash(bundleId)) return bundleId;
    throw new Error(`Timed out waiting for batched calls result (${bundleId})`);
}

/**
 * Send batched calls via EIP-5792 wallet_sendCalls and resolve to a transaction hash.
 * @param {Array<{to: string, data: string, value?: string}>} calls
 * @param {Object} options
 * @param {number} options.chainId
 * @param {string} options.fromAddress
 * @param {Object} options.wagmiConfig
 * @returns {Promise<string>} Transaction hash
 */
async function sendBatchedCalls(calls, options = {}) {
    const { chainId, fromAddress, wagmiConfig } = options;
    const provider = await getWalletProvider(wagmiConfig);

    const sendResult = await provider.request({
        method: 'wallet_sendCalls',
        params: [{
            version: '1.0',
            chainId: toHexChainId(chainId),
            from: fromAddress,
            calls: calls.map((call) => ({
                to: call.to,
                data: call.data,
                value: call.value || '0x0'
            }))
        }]
    });

    const immediateHash = extractTxHashFromValue(sendResult);
    if (immediateHash) return immediateHash;

    const bundleId = extractBundleId(sendResult);
    if (!bundleId) {
        throw new Error('wallet_sendCalls did not return a bundle id or transaction hash');
    }

    return waitForBatchedTxHash(provider, bundleId);
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
/**
 * @param {Object} collection
 * @param {Object} stage
 * @param {{ onHash?: (hash: string) => void }} [hooks]
 *        onHash fires the moment the transaction is broadcast, BEFORE waiting
 *        for the receipt — the tx_sent funnel step used to be reported only
 *        after confirmation, so reverted/dropped transactions never appeared
 *        between mint_click and mint_success.
 */
export async function mint(collection, stage, hooks = {}) {
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

    if (typeof hooks.onHash === 'function') {
        try {
            hooks.onHash(hash);
        } catch (err) {
            console.warn('onHash hook failed (non-fatal):', err?.message || err);
        }
    }

    // Wait for confirmation
    const receipt = await waitForTransactionReceipt(wagmiConfig, {
        hash,
        confirmations: 1
    });

    // A mined-but-reverted transaction is NOT a successful mint.
    if (receipt?.status && receipt.status !== 'success') {
        throw new Error('Transaction reverted on-chain');
    }

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

    // ABI inputs are often unnamed (`{ "name": "", "type": "uint256" }`) or the
    // key is missing entirely — `.name.toLowerCase()` threw a TypeError and
    // aborted the whole mint before any wallet request.
    const firstInput = abiItem.inputs[0] || {};
    const firstInputName = String(firstInput.name || '').toLowerCase();

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
            if (isUserRejection(e)) {
                throw e;
            }
            console.log(`${funcName} failed, trying next...`, e?.shortMessage || e?.message || e);
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
            if (isUserRejection(e)) {
                throw e;
            }
            console.log(`${funcName} failed, trying next...`, e?.shortMessage || e?.message || e);
        }
    }

    throw new Error('No valid paid mint function found on contract');
}

/**
 * Burn to mint
 * Supports EIP-5792 batch transactions when available.
 */
async function mintBurn(config, wagmiConfig, tokenId, stage) {
    const decimals = Number.isFinite(Number(stage.decimals)) ? Number(stage.decimals) : 18;
    // parseUnits handles fractional amounts ("0.5"); the old
    // `BigInt(stage.amount) * 10n ** decimals` threw SyntaxError on anything
    // that was not an integer string.
    let amountToBurn;
    try {
        amountToBurn = parseUnits(String(stage.amount ?? '0'), decimals);
    } catch {
        throw new Error(`Invalid burn amount configured for this stage: ${stage.amount}`);
    }
    if (amountToBurn <= 0n) {
        throw new Error('Burn amount must be greater than zero');
    }
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
        const held = Number(balance) / 10 ** decimals;
        throw new Error(`Insufficient ${stage.tokenName || 'token'} balance. You have ${held}, need ${stage.amount}.`);
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
        const canBatch = await supportsBatchCalls(wagmiConfig, config.chainId);

        if (canBatch) {
            console.log('Using EIP-5792 batch: approve + mint in one wallet request');

            // Encode approve calldata
            const approveData = encodeFunctionData({
                abi: erc20Abi,
                functionName: 'approve',
                args: [spenderAddress, amountToBurn],
            });

            // Try each possible mint function name
            const functionNames = ['mint', 'burnMint'];
            for (const funcName of functionNames) {
                const exists = config.abi.some((item) => item.name === funcName && item.type === 'function');
                if (!exists) continue;

                try {
                    const mintArgs = getMintArgs(config.abi, funcName, tokenId);
                    const mintData = encodeFunctionData({
                        abi: config.abi,
                        functionName: funcName,
                        args: mintArgs,
                    });

                    // Batch approve + mint into one wallet_sendCalls request
                    const batchTxHash = await sendBatchedCalls([
                        { to: tokenAddress, data: approveData },
                        { to: config.address, data: mintData },
                    ], {
                        chainId: config.chainId,
                        fromAddress: userAddress,
                        wagmiConfig
                    });

                    console.log(`Batched approve+mint sent, tx hash: ${batchTxHash}`);
                    return batchTxHash;
                } catch (e) {
                    if (isUserRejection(e)) {
                        throw e;
                    }
                    console.log(`Batched ${funcName} failed:`, e?.shortMessage || e?.message || e);
                }
            }

            // If batch failed for all functions, fall through to sequential
            console.warn('Batch failed, falling back to sequential approve then mint');
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
        const exists = config.abi.some((item) => item.name === funcName && item.type === 'function');
        if (!exists) continue;

        try {
            console.log(`Attempting mint with function: ${funcName}`);
            const mintArgs = getMintArgs(config.abi, funcName, tokenId);
            const hash = await writeContract(wagmiConfig, {
                address: config.address,
                abi: config.abi,
                functionName: funcName,
                args: mintArgs,
                chainId: config.chainId,
                dataSuffix: DATA_SUFFIX
            });
            return hash;
        } catch (e) {
            if (isUserRejection(e)) {
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

let ethPriceCache = null;
let lastEthPriceFetch = 0;

async function getEthPriceUsd() {
    const now = Date.now();
    if (ethPriceCache && now - lastEthPriceFetch < 300000) {
        return ethPriceCache; // 5 min cache
    }
    try {
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
        const data = await res.json();
        if (data?.ethereum?.usd) {
            ethPriceCache = data.ethereum.usd;
            lastEthPriceFetch = now;
            return ethPriceCache;
        }
    } catch (e) {
        console.warn('Could not fetch ETH price', e);
    }
    return ethPriceCache || 0;
}

/**
 * Get mint button text based on stage
 * @param {Object} stage - Current stage
 * @returns {Promise<string>} Button text
 */
export async function getMintButtonText(stage) {
    if (!stage) return 'Limit Reached';

    switch (stage.type) {
        case 'FREE':
            return 'Free Mint';
        case 'PAID':
            const ethValue = Number(BigInt(stage.price)) / 1e18;
            const ethPrice = await getEthPriceUsd();
            if (ethPrice > 0) {
                const usdValue = (ethValue * ethPrice).toFixed(2);
                return `Mint $${usdValue} (${ethValue} ETH)`;
            }
            return `Mint (${ethValue} ETH)`;
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
    if (!Array.isArray(proof) || proof.length === 0 || !merkleRoot || !isAddress(address)) return false;

    try {
        const normalizedAddress = getAddress(address);
        const normalizedRoot = String(merkleRoot).toLowerCase();
        if (!/^0x[a-f0-9]{64}$/.test(normalizedRoot)) return false;
        let computedHash = keccak256(encodePacked(['address'], [normalizedAddress]));

        for (const sibling of proof) {
            const normalizedSibling = String(sibling || '').toLowerCase();
            if (!/^0x[a-f0-9]{64}$/.test(normalizedSibling)) return false;

            // Byte-wise ordering (OpenZeppelin's commutative hashing). String
            // localeCompare() is locale sensitive and could order hex digits
            // differently under a non-C collation.
            const [left, right] = computedHash < normalizedSibling
                ? [computedHash, normalizedSibling]
                : [normalizedSibling, computedHash];
            computedHash = keccak256(`0x${left.slice(2)}${right.slice(2)}`);
        }

        return computedHash === normalizedRoot;
    } catch (error) {
        console.warn('[verifyAllowlist] Verification failed:', error?.message || error);
        return false;
    }
}

/**
 * Store a successful transaction in localStorage
 */
export function storeTransaction(tx) {
    const stored = storage.getJSON('nft_transactions', []);
    const transactions = Array.isArray(stored) ? stored : [];
    transactions.unshift({
        ...tx,
        timestamp: Date.now()
    });
    storage.setJSON('nft_transactions', transactions.slice(0, 50));
}

/**
 * Get stored transactions from localStorage
 */
export function getStoredTransactions() {
    const stored = storage.getJSON('nft_transactions', []);
    return Array.isArray(stored) ? stored : [];
}
