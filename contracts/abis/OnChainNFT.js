/**
 * OnChainNFT.js - Updated ABI with totalSupply()
 * Compatible with BaseScan and your app's fallback logic
 * 
 * IMPORTANT: This ABI now includes BOTH:
 * - totalMinted (custom, returns current minted count)
 * - totalSupply() (ERC721 standard, also returns current minted count)
 * 
 * This ensures compatibility with:
 * - Your app (tries totalMinted first, falls back to totalSupply)
 * - BaseScan (expects totalSupply for ERC721)
 * - OpenSea and other marketplaces
 */

export default [
    // ============================================
    // MINT FUNCTIONS
    // ============================================
    {
        "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
        "name": "mint",
        "outputs": [],
        "stateMutability": "payable",
        "type": "function"
    },

    // ============================================
    // SUPPLY TRACKING (BOTH METHODS)
    // ============================================

    // Custom method (your app tries this first)
    {
        "inputs": [],
        "name": "totalMinted",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },

    // ERC721 standard method (your app falls back to this, BaseScan expects this)
    {
        "inputs": [],
        "name": "totalSupply",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },

    // Max supply constant
    {
        "inputs": [],
        "name": "MAX_SUPPLY",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },

    // ============================================
    // USER TRACKING
    // ============================================
    {
        "inputs": [{ "internalType": "address", "name": "", "type": "address" }],
        "name": "mintedBy",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },

    {
        "inputs": [],
        "name": "MAX_PER_WALLET",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },

    {
        "inputs": [],
        "name": "FREE_MINT_PER_WALLET",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },

    // ============================================
    // STANDARD ERC721
    // ============================================
    {
        "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }],
        "name": "balanceOf",
        "outputs": [{ "internalType": "uint256", "name": "result", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },

    {
        "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
        "name": "ownerOf",
        "outputs": [{ "internalType": "address", "name": "result", "type": "address" }],
        "stateMutability": "view",
        "type": "function"
    },

    {
        "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
        "name": "tokenURI",
        "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
        "stateMutability": "view",
        "type": "function"
    },

    {
        "inputs": [],
        "name": "name",
        "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
        "stateMutability": "view",
        "type": "function"
    },

    {
        "inputs": [],
        "name": "symbol",
        "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
        "stateMutability": "view",
        "type": "function"
    },

    {
        "inputs": [
            { "internalType": "address", "name": "to", "type": "address" },
            { "internalType": "uint256", "name": "tokenId", "type": "uint256" }
        ],
        "name": "approve",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },

    {
        "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
        "name": "getApproved",
        "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
        "stateMutability": "view",
        "type": "function"
    },

    {
        "inputs": [
            { "internalType": "address", "name": "operator", "type": "address" },
            { "internalType": "bool", "name": "approved", "type": "bool" }
        ],
        "name": "setApprovalForAll",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },

    {
        "inputs": [
            { "internalType": "address", "name": "owner", "type": "address" },
            { "internalType": "address", "name": "operator", "type": "address" }
        ],
        "name": "isApprovedForAll",
        "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
        "stateMutability": "view",
        "type": "function"
    },

    {
        "inputs": [
            { "internalType": "address", "name": "from", "type": "address" },
            { "internalType": "address", "name": "to", "type": "address" },
            { "internalType": "uint256", "name": "tokenId", "type": "uint256" }
        ],
        "name": "transferFrom",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },

    {
        "inputs": [
            { "internalType": "address", "name": "from", "type": "address" },
            { "internalType": "address", "name": "to", "type": "address" },
            { "internalType": "uint256", "name": "tokenId", "type": "uint256" }
        ],
        "name": "safeTransferFrom",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },

    {
        "inputs": [
            { "internalType": "address", "name": "from", "type": "address" },
            { "internalType": "address", "name": "to", "type": "address" },
            { "internalType": "uint256", "name": "tokenId", "type": "uint256" },
            { "internalType": "bytes", "name": "data", "type": "bytes" }
        ],
        "name": "safeTransferFrom",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },

    {
        "inputs": [{ "internalType": "bytes4", "name": "interfaceId", "type": "bytes4" }],
        "name": "supportsInterface",
        "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
        "stateMutability": "view",
        "type": "function"
    },

    // ============================================
    // EVENTS
    // ============================================
    {
        "anonymous": false,
        "inputs": [
            { "indexed": true, "internalType": "address", "name": "from", "type": "address" },
            { "indexed": true, "internalType": "address", "name": "to", "type": "address" },
            { "indexed": true, "internalType": "uint256", "name": "tokenId", "type": "uint256" }
        ],
        "name": "Transfer",
        "type": "event"
    },

    {
        "anonymous": false,
        "inputs": [
            { "indexed": true, "internalType": "address", "name": "owner", "type": "address" },
            { "indexed": true, "internalType": "address", "name": "approved", "type": "address" },
            { "indexed": true, "internalType": "uint256", "name": "tokenId", "type": "uint256" }
        ],
        "name": "Approval",
        "type": "event"
    },

    {
        "anonymous": false,
        "inputs": [
            { "indexed": true, "internalType": "address", "name": "owner", "type": "address" },
            { "indexed": true, "internalType": "address", "name": "operator", "type": "address" },
            { "indexed": false, "internalType": "bool", "name": "approved", "type": "bool" }
        ],
        "name": "ApprovalForAll",
        "type": "event"
    }
];