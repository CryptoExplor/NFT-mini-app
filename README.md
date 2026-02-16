# NFT Mini App - Gamified Minting Platform

A high-performance NFT minting app for Base and Farcaster mini apps.  
It combines minting, gamification, social sharing, and analytics in one flow.

![Preview](public/image.png)

## Features

### Gamification and engagement
- Points system for mints, streaks, volume, and referrals.
- Streak badges (3, 7, 14, 30 day tiers).
- Real-time leaderboards for points, mints, and volume.

### Collection launch scheduler
- Time-based lifecycle: `hidden -> upcoming -> live`.
- Collections are hidden until `launchAt - 72h` (default reveal window).
- Upcoming collections show live countdowns on Home and Mint pages.
- Manual status overrides still work:
  - `status: "paused"`
  - `status: "sold-out"`

### Analytics and retention
- Retention cohorts (Day 1, Day 7, Day 30).
- Conversion funnel from page view to mint success.
- Wallet-level insights and mint history.

### Security and admin
- SIWE auth with JWT.
- On-chain transaction verification for mint events.
- Rate limiting protections.
- Admin export endpoints for Users, Collections, and Mints CSV.

## Quick Start

### 1. Prerequisites
- Node.js v18+
- Vercel KV (Redis)
- WalletConnect Project ID (Reown)

### 2. Install
```bash
npm install
```

### 3. Configure environment
Create `.env` in project root:

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

# Admin Access (comma-separated wallets)
VITE_ADMIN_WALLETS=0x123...,0x456...
```

### 4. Run development

Frontend only:
```bash
npm run dev
```

Full app (frontend + serverless functions):
```bash
npm run dev:full
```

## Adding Collections (Auto-Discovery)

Collections are auto-discovered from `collections/*.js` and indexed into `collections/index.js`.

### Required workflow
1. Create a new file in `collections/` with a default export object.
2. Set a unique `slug`.
3. Set `launchAt` (UTC ISO recommended), for example:
   - `launchAt: "2026-02-18T08:00:00Z"`
4. Optional: set `revealHours` (default is `72`).

### Sync index manually
```bash
npm run collections:sync
```

### Auto-sync
These scripts auto-run collection sync:
- `npm run dev`
- `npm run build`
- `npm run dev:full`

Do not edit `collections/index.js` manually. It is generated.

Legacy fallback is still supported:
- `launched: "YYYY-MM-DD"`

## Collection Status Rules

- `status: "live"`: scheduler decides hidden/upcoming/live by time.
- `status: "paused"`: forced paused.
- `status: "sold-out"`: forced sold out.

## Project Structure

- `api/`: serverless functions (tracking, auth, analytics, sharing metadata)
- `collections/`: collection configs
- `collections/index.js`: auto-generated collection map
- `scripts/`: utility scripts (including collection index generator)
- `src/lib/`: core logic (router, loader, scheduler, wallet helpers)
- `src/pages/`: UI pages (home, mint, analytics, gallery)

## Tech Stack

- Frontend: Vite, Vanilla JS, Tailwind CSS
- Web3: Reown AppKit, Wagmi, Viem, SIWE
- Backend: Vercel Serverless Functions
- Database: Vercel KV (Redis)

## License

MIT
