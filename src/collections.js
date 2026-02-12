import { base, baseSepolia } from 'viem/chains';

// Configuration for Universal Mint Policy
export const collections = {
    zorgz: {
        id: 'zorgz',
        name: 'Zorgz Legendary',
        symbol: 'ZRZ',
        description: 'A legendary definition of 8-bit art.',
        imageUrl: '/image.png', // Placeholder
        chainId: base.id, // Defaults to Base
        contractAddress: '0x1234567890123456789012345678901234567890', // REPLACE ME
        maxSupply: 10000,

        // Universal Mint Policy
        mintPolicy: {
            maxPerWallet: null, // Unlimited
            stages: [
                {
                    type: 'FREE',
                    limit: 1, // First one is free
                    name: 'Free Mint'
                },
                {
                    type: 'PAID',
                    limit: null, // Unlimited paid
                    price: 0.001 * 1e18, // 0.001 ETH
                    name: 'Public Mint'
                }
                // Example Burn Stage (commented out for now)
                /*
                {
                  type: 'BURN_ERC20',
                  limit: null,
                  token: '0xBurnTokenAddress', 
                  amount: 100n * 10n ** 18n,
                  name: 'Burn to Mint'
                }
                */
            ]
        }
    },
    // Example 16-bit collection
    OnchainSigils: {
        id: 'OnchainSigils',
        name: 'OnchainSigils',
        symbol: 'SIGIL',
        description: 'Occult on-chain sigils.',
        imageUrl: '/sigil.svg',
        chainId: base.id,
        contractAddress: '0xd243379AC0A9B700f4d9E22C7b3bFc3515150973',
        abiName: 'sigil',
        maxSupply: 10000,

        mintPolicy: {
            maxPerWallet: 1,
            stages: [
                {
                    type: 'FREE',
                    limit: 1,
                    name: 'Free Mint'
                }
            ]
        }
    },
    // Quantum Quills Collection
    QuantumQuills: {
        id: 'quantum-quills',
        name: 'Quantum Quills',
        symbol: 'QQUILL',
        description: 'Ultra generative animated cosmic ink. Fully on-chain.',
        imageUrl: '/quantum-quills.png', // Make sure to add this image to public/
        chainId: base.id,
        contractAddress: '0xA794691e186a4D43333BBF2E73d739565b90Bab1',
        abiName: 'QuantumQuills',
        maxSupply: 10000,
        mintPolicy: {
            maxPerWallet: null,
            stages: [
                {
                    type: 'FREE',
                    limit: 5, // Matches contract FREE_PER_WALLET
                    name: 'Genesis Allocation'
                },
                {
                    type: 'PAID',
                    limit: null,
                    price: 0.00005 * 1e18, // 0.00005 ETH
                    name: 'Public Mint'
                }
            ]
        }
    }
};

export const defaultCollectionId = 'QuantumQuills';





