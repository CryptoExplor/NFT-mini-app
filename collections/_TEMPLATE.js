/**
 * Collection Schema Template
 * Copy this file for each new collection
 * 
 * Usage: cp collections/_TEMPLATE.js collections/my-collection.js
 */

export default {
    // ============================================
    // REQUIRED FIELDS
    // ============================================

    // Display name
    name: "Collection Name",

    // URL slug (must be unique, lowercase, hyphenated)
    slug: "collection-slug",

    // Description (1-2 sentences)
    description: "Brief description of what makes this collection special.",

    // Collection image (relative to public folder or absolute URL)
    imageUrl: "/collection-image.png",

    // ============================================
    // CONTRACT CONFIGURATION
    // ============================================

    // Chain ID (8453 = Base, 84532 = Base Sepolia, 1 = Ethereum)
    chainId: 8453,

    // Contract address (0x...)
    contractAddress: "0x1234567890123456789012345678901234567890",

    // ABI reference (must match filename in contracts/abis/)
    abiName: "ERC721Standard",

    // ============================================
    // MINT CONFIGURATION
    // ============================================

    mintPolicy: {
        // Max supply (total NFTs that can be minted)
        maxSupply: 10000,

        // Max per wallet (null = unlimited)
        maxPerWallet: 5,

        // Mint stages (executed in order based on user's mint count)
        stages: [
            // FREE MINT STAGE
            {
                type: "FREE",        // Type: FREE, PAID, BURN_ERC20
                limit: 1,            // First 1 is free (null = unlimited)
                name: "Free Mint"
            },

            // PAID MINT STAGE (after free is used)
            {
                type: "PAID",
                limit: null,         // Unlimited paid mints
                price: 0.001 * 1e18, // 0.001 ETH in wei
                name: "Public Mint"
            }

            // BURN TO MINT (optional example)
            /*
            {
              type: "BURN_ERC20",
              limit: null,
              token: "0xBurnTokenAddress",
              amount: 100n * 10n ** 18n,  // 100 tokens
              name: "Burn to Mint"
            }
            */
        ]
    },

    // ============================================
    // METADATA
    // ============================================

    // Categories for filtering
    category: ["PFP", "Art"],

    // Tags for search
    tags: ["generative", "on-chain"],

    // Manual status override: "live" | "sold-out" | "paused"
    // Runtime scheduler will compute hidden/upcoming/live from launchAt.
    status: "live",

    // Visibility: "public" | "private"
    visibility: "public",

    // Launch datetime (UTC ISO recommended).
    // Collection is hidden until 72h before launch, then shown as upcoming with countdown.
    launchAt: "2026-02-01T18:00:00Z",

    // Optional reveal window (hours) before launchAt. Default: 72
    revealHours: 72,

    // Backward-compatible fallback if launchAt is omitted (YYYY-MM-DD)
    launched: "2026-02-01",

    // ============================================
    // OPTIONAL FIELDS
    // ============================================

    // Optional contract interactions shown on the mint page.
    // Useful when each contract exposes different holder actions.
    // By default, TRANSFER + SEND_TO_DEAD actions are auto-enabled if ABI supports transfer.
    // Set includeDefaultContractActions: false to disable those defaults.
    includeDefaultContractActions: true,

    // Auto-load eligible custom write functions from ABI as CONTRACT_CALL actions.
    // Set false to disable ABI auto-discovery.
    autoLoadContractFunctions: true,

    // Optional: include payable ABI functions in auto-discovery.
    // Payable actions get a Native Value (ETH) input automatically.
    // autoLoadPayableContractFunctions: false,

    // Optional allowlist: only auto-load these function names.
    // autoLoadContractFunctionNames: ["merge", "combine", "amplify"],

    // Optional denylist: skip these names even if otherwise eligible.
    // autoExcludeContractFunctionNames: ["dangerousFunction"],

    // Optional cap for auto-loaded function argument count (default: 4).
    // autoLoadContractFunctionMaxInputs: 4,

    contractActions: [
        {
            id: "custom-action",
            type: "CONTRACT_CALL", // CONTRACT_CALL | TRANSFER | SEND_TO_DEAD
            label: "Run Custom Action",
            description: "Call a collection-specific contract function.",
            functionName: "customFunction",
            successMessage: "Action completed",
            // Optional payable native value support:
            // value: "1000000000000000", // static wei (0.001 ETH)
            // value: { eth: "0.001" },   // static ETH
            // value: {
            //   inputKey: "__nativeValue",
            //   unit: "eth",
            //   label: "Native Value (ETH)",
            //   placeholder: "e.g. 0.001",
            //   required: false
            // },
            // Optional ERC20 approval flow before this action:
            // approvalRequired: {
            //   tokenAddress: "0xTokenAddress",
            //   spender: "0xSpenderAddress", // default: this collection contract
            //   amount: "10",                // token units (uses decimals)
            //   // amountWei: "10000000000000000000", // raw token amount
            //   // amountInputKey: "__approvalAmount", // user input amount
            //   decimals: 18,
            //   amountLabel: "Approval Amount",
            //   amountPlaceholder: "e.g. 10",
            //   required: true,
            //   resetToZeroFirst: false
            // },
            args: [
                {
                    key: "tokenId",
                    label: "Token ID",
                    type: "uint256",
                    placeholder: "e.g. 1"
                }
                // Optional static arg example:
                // { key: "enabled", type: "bool", value: true, hidden: true }
            ]
        },
        {
            id: "transfer",
            type: "TRANSFER",
            label: "Transfer NFT",
            description: "Transfer NFT to another wallet."
            // Optional args override:
            // args: [{ key: "tokenId", type: "uint256" }, { key: "to", type: "address" }]
        },
        {
            id: "burn",
            type: "SEND_TO_DEAD",
            label: "Send to Dead Address",
            description: "Burn by transferring to 0x...dEaD."
        }
    ],

    // Farcaster frame URL
    farcaster: null,

    // Social links
    website: "https://collection.xyz",
    twitter: "https://twitter.com/collection",
    discord: "https://discord.gg/collection"
}
