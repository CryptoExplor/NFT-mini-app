/**
 * ABI Loader
 * Centralized ABI management for all collections
 */

import ERC721Standard from './abis/ERC721Standard.js';
import sigil from './abis/sigil.js';
import baseInvaders from './abis/base-invaders.js';
import BASEHEADS_404 from './abis/BASEHEADS_404.js';
// Import more ABIs as you add different contract types:
// import FreeMint from './abis/FreeMint.js';
// import PaidMint from './abis/PaidMint.js';
// import BurnToMint from './abis/BurnToMint.js';

const ABIS = {
    'ERC721Standard': ERC721Standard,
    'sigil': sigil,
    'base-invaders': baseInvaders,
    'BASEHEADS_404': BASEHEADS_404,
    // ADD NEW ABIS HERE:
    // 'FreeMint': FreeMint,
    // 'PaidMint': PaidMint,
    // 'BurnToMint': BurnToMint,
};

/**
 * Load ABI by name
 * @param {string} abiName - Name of the ABI (must match key in ABIS object)
 * @returns {Array} ABI array
 */
export function loadABI(abiName) {
    if (!ABIS[abiName]) {
        throw new Error(`ABI not found: ${abiName}. Available: ${Object.keys(ABIS).join(', ')}`);
    }

    return ABIS[abiName];
}

/**
 * Get contract config for a collection
 * @param {Object} collection - Collection object with contractAddress, abiName, chainId
 * @returns {Object} Contract config with address, abi, chainId, mintPolicy
 */
export function getContractConfig(collection) {
    const abi = loadABI(collection.abiName);

    return {
        address: collection.contractAddress,
        abi: abi,
        chainId: collection.chainId,
        mintPolicy: collection.mintPolicy
    };
}

/**
 * Get all available ABIs
 * @returns {string[]} Array of ABI names
 */
export function getAvailableABIs() {
    return Object.keys(ABIS);
}
