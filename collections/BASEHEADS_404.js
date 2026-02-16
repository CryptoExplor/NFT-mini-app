/**
 * BASEHEADS_404 Collection
 * Brutalist ASCII heads – Burn to Mint
 */

export default {
    // ============================================
    // REQUIRED FIELDS
    // ============================================

    name: "BASEHEADS_404",
    slug: "baseheads-404",
    description: "Brutalist ASCII heads generated fully on-chain. Minted by burning pratiksharma tokens. Terminal-native identity for Base.",
    imageUrl: "/baseheads-404.png",

    // ============================================
    // CONTRACT CONFIGURATION
    // ============================================

    chainId: 8453, // Base Mainnet
    contractAddress: "0x7DcaBf9631fc736981A702eBa20Fb430aeBa3d4c",
    abiName: "BASEHEADS_404",

    // ============================================
    // MINT CONFIGURATION
    // ============================================

    mintPolicy: {
        maxSupply: 10000,
        maxPerWallet: 5,
        stages: [
            {
                type: "BURN_ERC20",
                limit: 5,
                name: "Burn to Mint",
                token: "0x258E940dd7eF96d7a02f83c01F008Cb4cE5907c5",
                tokenName: "pratiksharma",
                amount: "500",
                decimals: 18
            }
        ]
    },

    // ============================================
    // TOKEN ID CONFIGURATION
    // ============================================

    tokenIdRange: {
        start: 0,
        end: 9999
    },

    mintMethods: {
        burn: "mint"
    },

    supplySource: {
        total: "totalMinted",
        max: "MAX_SUPPLY"
    },

    // ============================================
    // METADATA
    // ============================================

    category: ["PFP", "Generative", "ASCII", "Brutalist"],
    tags: [
        "on-chain",
        "ascii",
        "terminal",
        "404",
        "burn-to-mint",
        "identity",
        "Base"
    ],
    status: "live",
    visibility: "public",
    launchAt: "2026-02-08T00:00:00Z",

    // ============================================
    // TRAITS (UI / FILTERING)
    // ============================================

    traits: {
        Eyes: ["00", "XX", "--", "##", "@@"],
        Mouth: ["__", "~~", "==", "!!"],
        Signal: ["LOW", "MED", "HIGH", "MAX"],
        Error: ["404", "500", "403", "NULL"],
        Mood: ["IDLE", "ANGRY", "BROKEN", "GLITCH", "NULL", "OVERLOAD"],
        Noise: ["LOW", "MED", "HIGH", "MAX"],
        Border: ["SIMPLE", "DOUBLE", "BROKEN"],
        Signature: ["", "[SYS]", "[ROOT]"]
    },

    // ============================================
    // UI HINTS
    // ============================================

    ui: {
        mintLabel: "Burn 500 pratiksharma",
        soldOutLabel: "All Heads Burned",
        walletLimitLabel: "Max 5 heads per wallet",
        previewEnabled: true,
        asciiPreview: true
    },

    // ============================================
    // OPTIONAL / ECOSYSTEM
    // ============================================

    farcaster: {
        frame: true,
        shareText: [
            "I just minted my BASEHEAD_404 — signal strong, error intentional. ⚡🖥️",
            "My BASEHEAD_404 just booted on Base. Terminal-core identity unlocked.",
            "404 not found. Identity located. BASEHEAD_404 minted."
        ]
    },

    openseaUrl: "https://opensea.io/collection/baseheads-404",
    website: null,
    twitter: null,
    discord: null
};
