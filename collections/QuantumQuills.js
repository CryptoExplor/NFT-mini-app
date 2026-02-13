/**
 * Quantum Quills Collection
 * Ultra generative animated cosmic ink. Fully on-chain.
 */

export default {
    // ============================================
    // REQUIRED FIELDS
    // ============================================

    name: "Quantum Quills",
    slug: "quantum-quills",
    description: "Ultra generative Animated cosmic ink artifacts that evolve with supply. Fully on-chain generative nebula, distortion filters, and dynamic evolution.",
    imageUrl: "/quantum-quills.png",

    // ============================================
    // CONTRACT CONFIGURATION
    // ============================================

    chainId: 8453, // Base Mainnet
    contractAddress: "0xA794691e186a4D43333BBF2E73d739565b90Bab1",
    abiName: "QuantumQuills",

    // ============================================
    // MINT CONFIGURATION
    // ============================================

    mintPolicy: {
        maxSupply: 10000,
        maxPerWallet: null, // Unlimited per wallet (but first 5 are free)
        stages: [
            {
                type: "FREE",
                limit: 5,
                name: "Genesis Allocation"
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

    category: ["Art", "Generative", "Animated"],
    tags: ["on-chain", "svg", "animated", "cosmic", "Base"],
    status: "live",
    visibility: "public",
    launched: "2026-02-12",

    // ============================================
    // OPTIONAL FIELDS
    // ============================================

    farcaster: {
        frame: true,
        shareText: [
            "My Quantum Quill is writing the future of the cosmos ✒️✨",
            "Ink from another timeline. Quantum Quill activated.",
            "Cosmic ink encoded on-chain. My Quantum Quill is alive."
        ]
    },
    openseaUrl: "https://opensea.io/collection/quantumquills",
    website: null,
    twitter: null,
    discord: null
}
