export default {
    name: "BaseMoods",
    slug: "basemoods",
    description: "Express yourself on-chain. Cute emotional faces with 10 different moods.",
    imageUrl: "/demo.png", // Add this image to /public/

    chainId: 8453, // Base Mainnet
    contractAddress: "0x5C5a38168517B610fe06b00c07a2D45BBB10c2e8", // DUMMY - Update when deployed
    abiName: "OnChainNFT",

    mintPolicy: {
        maxSupply: 10000,
        maxPerWallet: 10,
        stages: [
            {
                type: "FREE",
                limit: 2,
                name: "Free Mint"
            },
            {
                type: "PAID",
                limit: null,
                price: 0.0005 * 1e18, // 0.0005 ETH
                name: "Paid Mint"
            }
        ]
    },

    category: ["PFP", "Generative", "Fun"],
    tags: ["on-chain", "emotions", "cute", "expressive", "Base"],
    status: "Upcoming",
    visibility: "public",
    launched: "2026-02-10",
    featured: true,

    farcaster: {
        frame: true,
        shareText: "I just minted my mood on Base! 😊"
    }
};
