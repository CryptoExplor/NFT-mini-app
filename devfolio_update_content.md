# Devfolio Update — NFT Battle Arena V2

Go to: **https://devfolio.co/projects/nft-battle-arena-e763** → Click **Edit** → Update each section below.

---

## 📝 About (copy this into the "About" field)

```
NFT Battle Arena is a cross-collection NFT battle game on Base where any NFT from any collection becomes a playable fighter with real combat utility.

V2 brings strategic depth: players build full loadouts — pick a Fighter, equip an Item buff, and choose an Arena modifier — creating thousands of tactical combinations. Your entire wallet inventory is scanned for team synergies, rewarding long-term collectors with passive stat boosts.

All PvP matches are cryptographically secured. Players authenticate via SIWE (Sign-In with Ethereum), and combat is resolved entirely server-side using Vercel KV with atomic operations. A custom seeded PRNG engine (mulberry32 + FNV-1a hashing) ensures every battle is 100% deterministic and reproducible for replays and anti-cheat verification.

Key features:
• Universal stat normalization across 12+ Base NFT collections
• Multi-NFT loadouts (Fighter + Item + Arena) with diminishing returns
• 5 passive abilities with cooldown-based trigger systems
• Cinematic battle renderer with particles, screen shake, and damage numbers
• Server-authoritative PvP with SIWE + JWT authentication
• Deterministic seeded PRNG for reproducible battle outcomes
• Anti-drift snapshot hashing (SHA-256) for mutable NFT protection
• Live balance configuration via CDN for real-time meta-tuning
• V2 analytics pipeline tracking loadouts, battles, and results
• Farcaster Mini App native integration
```

---

## 📝 The Problem It Solves (copy this into that field)

```
Most NFT collections become static PFPs with zero utility after minting. NFT Battle Arena solves this by giving every NFT on Base real combat utility through metadata normalization — no matter the collection, no matter the traits.

V2 goes further by solving three critical problems:

1. Single-NFT Boredom: Players now deploy full strategic loadouts (Fighter + Item + Arena), making every battle a tactical decision rather than a coin flip.

2. Client-Side Cheating: All PvP combat is resolved server-side via Vercel Serverless Functions. Players authenticate with SIWE, stats are snapshot-hashed at challenge time, and battles run on a deterministic seeded PRNG — making manipulation impossible.

3. Balance Stagnation: A live balance config system fetches stat cap overrides from a CDN, allowing real-time meta-tuning without redeployment. No more waiting for a code push to fix a broken build.
```

---

## 📝 Challenges We Ran Into (copy this into that field)

```
• Metadata normalization across 12+ collections with wildly different trait structures — each collection needed custom mapping logic while keeping the system extensible via a data-driven collection profiles architecture.

• Balancing combat stats so no single collection dominates — implemented stat caps, floors, diminishing returns on buff layers (Items: 100%, Arena: 80%, Team: 60%), and configurable guardrails.

• Making battles feel cinematic in vanilla JavaScript without heavy game engines — built a custom animation system with CSS keyframes for screen shake, crit bursts, dodge ghosts, floating damage numbers, and particle effects.

• Deterministic replay system — implemented a seeded PRNG (mulberry32 + FNV-1a) to ensure the same battle inputs always produce identical outputs for server-side verification and future spectator mode.

• Server-side PvP without WebSockets — built an atomic challenge/fight system using Vercel KV hash operations to prevent race conditions during concurrent challenge acceptance.

• SIWE authentication flow — integrated Sign-In with Ethereum using the `siwe` npm package with `jose` JWT tokens (1h expiry, 5min nonce TTL) for stateless, secure API authentication.

• Browser compatibility — replaced Node.js crypto with Web Crypto API (SHA-256) for stat snapshots, and handled Farcaster miniapp connector nuances across Base and Warpcast hosts.
```

---

## 📝 Technologies Used (add these tags if not already present)

Current tags: `Solidity`, `JavaScript`, `ethers.js`, `Tailwind CSS`, `Vercel`, `Vite`, `BASE`

**Add these new tags** (if Devfolio allows):
- `SIWE` or `Sign-In with Ethereum`
- `Redis` (for Vercel KV)
- `JWT`
- `viem` (replace ethers.js — we actually use viem, not ethers)
- `wagmi`

> **Note:** Remove `ethers.js` tag if possible — the project uses `viem` v2, not ethers.

---

## 📝 Links (verify these are correct)

| Link | URL |
|------|-----|
| Live App | https://base-mintapp.vercel.app |
| Farcaster Mini App | https://farcaster.xyz/miniapps/YE6YuWN74WWI/base-mint-app |
| Base App Store | https://base.app/app/base-mintapp.vercel.app |
| GitHub | *(add if you've pushed to public repo)* |
