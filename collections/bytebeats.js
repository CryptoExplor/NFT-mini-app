/**
 * ByteBeats Collection
 * Fully on-chain sound wave visualizations and rhythms
 */

export default {
    // ============================================
    // REQUIRED FIELDS
    // ============================================

    name: "ByteBeats",
    slug: "bytebeats",
    description: "Generative sound wave visualizations and rhythms. Fully on-chain audio-visual art with tempo and harmony.",
    imageUrl: "/ByteBeats.webp",
    shareImageUrl: "/ByteBeats-share.png",

    // ============================================
    // CONTRACT CONFIGURATION
    // ============================================

    chainId: 8453, // Base Mainnet
    contractAddress: "0xD6bBe0A69395F68Ee1F20aC60b7B9eb4E20e7E41", // TODO: Replace with deployed address
    abiName: "ByteBeats",

    // ============================================
    // MINT CONFIGURATION
    // ============================================

    mintPolicy: {
        maxSupply: 7777,
        maxPerWallet: 7,
        stages: [
            {
                type: "FREE",
                limit: 5,
                name: "Free Mint"
            },
            {
                type: "PAID",
                limit: 2, // Up to global maxPerWallet
                price: 0.000007 * 1e18, // 0.000007 ETH
                name: "Paid Mint"
            }
        ]
    },

    // ============================================
    // METADATA
    // ============================================

    category: ["Art", "Generative", "On-Chain"],
    tags: [
        "audio-visual",
        "on-chain",
        "music",
        "generative",
        "Base"
    ],
    status: "live",
    visibility: "public",
    launchAt: "2026-02-25T00:00:00Z",

    // ============================================
    // OPTIONAL FIELDS
    // ============================================

    featured: true,

    traits: {
        Genre: ["Synthwave", "Lo-fi", "Ambient", "Techno", "House", "Downtempo", "Chillout", "Electronic"],
        Key: ["C Major", "D Minor", "E Minor", "F Major", "G Major", "A Minor", "B Flat"],
        Energy: ["Low", "Medium", "High", "Extreme"]
    },

    ui: {
        mintLabel: "Mint Beat",
        soldOutLabel: "All Beats Minted",
        walletLimitLabel: "Max 7 Beats per wallet",
        previewEnabled: true,
        animatedPreview: false
    },

    contractActions: [
        {
            id: "amplify",
            type: "CONTRACT_CALL",
            label: "Amplify Harmony",
            description: "Increase harmony level by +5 for one Beat you own.",
            functionName: "enhanceHarmony",
            successMessage: "Harmony amplified",
            args: [
                {
                    key: "tokenId",
                    label: "Token ID",
                    type: "uint256",
                    placeholder: "e.g. 1"
                }
            ]
        },
        {
            id: "tempo-up",
            type: "CONTRACT_CALL",
            label: "Tempo +10",
            description: "Increase BPM by 10 (capped by contract rules).",
            functionName: "adjustTempo",
            successMessage: "Tempo increased",
            args: [
                {
                    key: "tokenId",
                    label: "Token ID",
                    type: "uint256",
                    placeholder: "e.g. 1"
                },
                {
                    key: "increase",
                    type: "bool",
                    value: true,
                    hidden: true
                }
            ]
        },
        {
            id: "tempo-down",
            type: "CONTRACT_CALL",
            label: "Tempo -10",
            description: "Decrease BPM by 10 (floored by contract rules).",
            functionName: "adjustTempo",
            successMessage: "Tempo decreased",
            args: [
                {
                    key: "tokenId",
                    label: "Token ID",
                    type: "uint256",
                    placeholder: "e.g. 1"
                },
                {
                    key: "increase",
                    type: "bool",
                    value: false,
                    hidden: true
                }
            ]
        },
        {
            id: "transfer",
            type: "TRANSFER",
            label: "Transfer NFT",
            description: "Send a Beat to another wallet address.",
            successMessage: "NFT transferred",
            args: [
                {
                    key: "tokenId",
                    label: "Token ID",
                    type: "uint256",
                    placeholder: "e.g. 1"
                },
                {
                    key: "to",
                    label: "Recipient Address",
                    type: "address",
                    placeholder: "0x..."
                }
            ]
        },
        {
            id: "send-to-dead",
            type: "SEND_TO_DEAD",
            label: "Send to Dead Address",
            description: "Permanently remove an NFT by sending it to 0x...dEaD.",
            successMessage: "NFT sent to dead address",
            args: [
                {
                    key: "tokenId",
                    label: "Token ID",
                    type: "uint256",
                    placeholder: "e.g. 1"
                }
            ]
        }
    ],

    farcaster: {
        frame: true,
        shareText: [
            "I just created a generative sound wave with ByteBeats. 🎵",
            "Listen to my on-chain rhythm. ByteBeats minted! 🔊",
            "My beat is now immutable. Checked in with ByteBeats. 🎧"
        ]
    },

    openseaUrl: "https://opensea.io/collection/bytebeats",
    website: null,
    twitter: null,
    discord: null
};
