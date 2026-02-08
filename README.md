# 💎 NFT Mini App - Multi-Collection Minting Platform

A premium, high-performance NFT minting platform built with Vite, Vanilla JS, and Reown AppKit. Designed for the Base network, this application allows you to manage and mint multiple NFT collections from a single, stunning interface, optimized for Farcaster Mini-apps.

![Preview](public/image.png)

## ✨ Features

- **Multi-Collection Support**: Easily add and manage multiple NFT collections via configuration files.
- **SPA Routing**: Seamless client-side navigation between a beautiful home grid and dynamic mint pages.
- **Dynamic Minting Logic**: Supports various mint types (FREE, PAID) and resolves active stages automatically.
- **On-Chain Data**: Real-time tracking of supply, user mint counts, and wallet limits.
- **Legendary UI**: Professional dark-mode design with "Aurora" effects, glassmorphism, and smooth animations.
- **AppKit Integration**: Powered by Reown for a seamless wallet connection experience.
- **Farcaster Optimized**: Ready to be deployed as a Farcaster Mini-app with built-in SDK support.

## 🚀 Quick Start

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- A WalletConnect Project ID (Get one at [cloud.reown.com](https://cloud.reown.com/))

### 2. Installation
```bash
# Install dependencies
npm install
```

### 3. Configuration
Create a `.env` file in the root directory:
```env
VITE_WALLETCONNECT_PROJECT_ID=your_project_id_here
```

### 4. Development
```bash
npm run dev
```

## 🏗️ How to Add a New Collection

Adding a collection is purely configuration-driven. No need to touch core logic.

1.  **ABI**: Place your contract ABI in `contracts/abis/your-collection.js` as an `export default [...]`.
2.  **Register ABI**: In `contracts/index.js`, import and add your ABI to the `ABIS` object.
3.  **Collection Config**: Create a new file in `collections/your-slug.js` (use `collections/_TEMPLATE.js` as a guide).
4.  **Load Collection**: In `src/lib/loadCollections.js`, import your config and add it to the `COLLECTIONS_MAP`.

The app will automatically:
- Create a card on the homepage.
- Generate a dynamic mint page at `/mint/your-slug`.
- Handle on-chain data and transaction logic.

## 📂 Project Structure

- `collections/`: Individual collection configuration files.
- `contracts/`: ABIs and centralized contract loader.
- `src/lib/`: Core logic (routing, collection loading, minting helpers).
- `src/pages/`: Page components (Home and Mint).
- `src/utils/`: Shared utility functions.

## 🛠️ Tech Stack
- **Framework**: Vite + Vanilla JavaScript
- **Web3**: Reown AppKit, Wagmi, Viem
- **Styling**: Tailwind CSS + Custom CSS
- **Network**: Base (Mainnet & Sepolia)
- **Farcaster**: @farcaster/miniapp-sdk

## 📄 License
This project is licensed under the MIT License.
