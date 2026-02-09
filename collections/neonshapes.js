export default {
    name: "NeonShapes",
    slug: "neonshapes",
    description: "Vibrant geometric art that glows with neon energy.",
    imageUrl: "/demo.png",

    chainId: 8453,
    contractAddress: "0x6789012345678901234567890123456789ABCDEF",
    abiName: "OnChainNFT",

    mintPolicy: {
        maxSupply: 7777,
        maxPerWallet: 7,
        stages: [
            {
                type: "FREE",
                limit: 1,
                name: "Free Mint"
            },
            {
                type: "PAID",
                limit: null,
                price: 0.0007 * 1e18,
                name: "Collect More"
            }
        ]
    },

    category: ["Art", "Abstract", "Generative"],
    tags: ["on-chain", "geometric", "neon", "abstract", "modern", "Base"],
    status: "Upcoming",
    visibility: "public",
    launched: "2026-02-10",
    featured: true
};
