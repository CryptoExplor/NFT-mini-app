export default {
    name: "PixelPets",
    slug: "pixelpets",
    description: "Adopt your on-chain companion! 8 species of cute pixel pets.",
    imageUrl: "/demo.png",

    chainId: 8453,
    contractAddress: "0x456789012345678901234567890123456789ABCD",
    abiName: "OnChainNFT",

    mintPolicy: {
        maxSupply: 8888,
        maxPerWallet: 5,
        stages: [
            {
                type: "FREE",
                limit: 1,
                name: "Free Adoption"
            },
            {
                type: "PAID",
                limit: null,
                price: 0.001 * 1e18,
                name: "Adopt More"
            }
        ]
    },

    category: ["PFP", "Cute", "Pixel Art"],
    tags: ["on-chain", "pets", "pixel", "cute", "collectible", "Base"],
    status: "Upcoming",
    visibility: "public",
    launched: "2026-02-10",
    featured: true
};
