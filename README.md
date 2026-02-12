# 💎 NFT Mini App - Gamified Minting Platform

A premium, high-performance NFT minting platform built for **Base** and **Farcaster Frames**. This application goes beyond simple minting by integrating a robust **Gamification Engine**, **Real-time Analytics**, and a **Retention System** directly into the experience.

![Preview](public/image.png)

## ✨ Features

### 🎮 Gamification & Engagement
- **Points System**: Users earn points for mints, daily streaks, volume, and referrals.
- **Streak Badges**: 
  - 🌟 Rising Minter (3 days)
  - 💎 Committed Collector (7 days)
  - 🔥 Streak Master (14 days)
  - 👑 Legendary Minter (30 days)
- **Leaderboards**: Real-time global and weekly leaderboards for Points, Mints, and Volume.

### 📊 Advanced Analytics
- **Retention Cohorts**: Track user retention (Day 1, 7, 30) to measure campaign quality.
- **Conversion Funnels**: Visualize drop-offs from *Wallet Connect* → *Mint Success*.
- **Wallet Insights**: Detailed user profiles including "Whale" status, total gas spent, and mint history.

### 🛡️ Security & Admin
- **SIWE Authentication**: Secure JWT-based authentication using Sign-In with Ethereum (EIP-4361).
- **Transaction Verification**: On-chain validation of mints to prevent point farming.
- **Rate Limiting**: Protection against spam and abuse.
- **Admin Panel**:
  - Export data as **CSV** (Users, Collections, Mints).
  - View daily active users and raw system stats.

## 🚀 Quick Start

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- A [Vercel KV](https://vercel.com/docs/storage/vercel-kv) database (Redis)
- A WalletConnect Project ID from [cloud.reown.com](https://cloud.reown.com/)

### 2. Installation
```bash
npm install
```

### 3. Configuration
Create a `.env` file in the root directory:

```env
# WalletConnect
VITE_WALLETCONNECT_PROJECT_ID=your_reown_project_id

# Backend (Vercel KV - Redis)
KV_URL="redis://..."
KV_REST_API_URL="https://..."
KV_REST_API_TOKEN="Ag..."
KV_REST_API_READ_ONLY_TOKEN="..."

# Security
JWT_SECRET=super_secure_random_string_here

# Admin Access (Comma-separated wallet addresses)
VITE_ADMIN_WALLETS=0x123...,0x456...
```

### 4. Development
```bash
npm run dev
```

## 🏗️ Project Structure

- `api/`: Serverless functions (Vercel) for tracking, auth, and analytics.
- `collections/`: Configuration for individual NFT drops.
- `src/lib/`: Core logic (Router, API client, Wallet connection).
- `src/pages/`: UI Components (Home, Mint, Analytics).

## 🛠️ Tech Stack

- **Frontend**: Vite, Vanilla JS, Tailwind CSS
- **Web3**: Reown AppKit, Wagmi, Viem, SIWE
- **Backend**: Vercel Serverless Functions
- **Database**: Vercel KV (Redis)
- **Analytics**: Custom event tracking pipeline with cohort analysis

## 📄 License

This project is licensed under the MIT License.
