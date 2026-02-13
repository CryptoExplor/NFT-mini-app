/**
 * VOID PFPS Collection
 * Cold abstract void faces rendered fully on-chain.
 */

export default {
    // ============================================
    // REQUIRED FIELDS
    // ============================================

    name: "VOID PFPs",
    slug: "void-pfps",
    description: "Cold abstract void faces rendered fully on-chain. Negative space. Distortion. Fracture. Glow.",
    imageUrl: "/void-pfps.png", // Ensure this image exists in public/ or update path

    // ============================================
    // CONTRACT CONFIGURATION
    // ============================================

    chainId: 8453, // Base Mainnet
    contractAddress: "0x3Fe053d29BebBAe4F711aa56325dE46Fa7a1Dd64", // TODO: Replace with deployed address
    abiName: "void-pfps", // TODO: Ensure ABI is added to contracts/abis/ and exported in contracts/index.js

    // ============================================
    // MINT CONFIGURATION
    // ============================================

    mintPolicy: {
        maxSupply: 10000,
        maxPerWallet: null, // Unlimited total (but free limit applies)
        stages: [
            {
                type: "FREE",
                limit: 5,
                name: "Free Claim"
            },
            {
                type: "PAID",
                limit: null,
                price: 0.00005 * 1e18, // 0.00005 ETH
                name: "Public Mint"
            }
        ]
    },

    // ============================================
    // METADATA
    // ============================================

    category: ["Art", "Generative", "On-Chain", "PFP"],
    tags: ["void", "abstract", "minimalist", "svg", "base"],
    status: "live",
    visibility: "public",
    launched: "2026-02-13",

    // ============================================
    // OPTIONAL FIELDS
    // ============================================

    featured: false,
    farcaster: {
        frame: true,
        shareText: [
            "I stepped into the void. VOID_PFPS minted. ⚫",
            "Minimal. Cold. On-chain. My VOID_PFPS exists in silence.",
            "Negative space. Fracture. Glow. VOID_PFPS now lives on Base."
        ]
    },
    openseaUrl: "https://opensea.io/collection/void-pfps",
    website: null,
    twitter: null,
    discord: null
}
