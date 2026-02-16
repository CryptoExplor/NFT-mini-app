/**
 * BaseFortunes Collection
 * Daily wisdom and fortune NFTs generated fully on-chain.
 */

export default {
    // ============================================
    // REQUIRED FIELDS
    // ============================================

    name: "BaseFortunes",
    slug: "base-fortunes",
    description: "On-chain fortune cards with daily wisdom, lucky numbers, and category traits. Mint your personalized fortune on Base.",
    imageUrl: "/basefortunes.png",
    shareImageUrl: "/basefortunes-share.png",

    // ============================================
    // CONTRACT CONFIGURATION
    // ============================================

    chainId: 8453, // Base Mainnet
    contractAddress: "0xa73b738c823213Cd670640151Bd58C9c296f8F86", // TODO: replace after deployment
    abiName: "BaseFortunes",

    // ============================================
    // MINT CONFIGURATION
    // ============================================

    mintPolicy: {
        maxSupply: 10000,
        maxPerWallet: 10,
        stages: [
            {
                type: "FREE",
                limit: 1,
                name: "Daily Free Fortune"
            },
            {
                type: "PAID",
                limit: 9,
                price: 9000000000000, // 0.000009 ETH
                name: "Public Mint"
            }
        ]
    },

    // ============================================
    // METADATA
    // ============================================

    category: ["Art", "Generative", "Utility", "On-Chain"],
    tags: ["fortune", "daily", "wisdom", "on-chain", "base"],
    status: "live",
    visibility: "public",
    launchAt: "2026-02-18T08:00:00Z",

    // ============================================
    // OPTIONAL FIELDS
    // ============================================

    farcaster: {
        frame: true,
        shareText: [
            "My BaseFortune just dropped on-chain. Fortune favors the bold.",
            "Minted a BaseFortune. Daily wisdom now lives forever on Base.",
            "New on-chain fortune unlocked. BaseFortunes feels lucky today."
        ]
    },

    openseaUrl: "https://opensea.io/collection/basefortunes",
    website: null,
    twitter: null,
    discord: null
};
