# Daily Onchain NFT Launch Plan

**Goal:** release a new NFT every day, let collectors mint through both this app and OpenSea, keep metadata correctly indexed, and minimize recurring operational work.

## 1. Recommended decision

### Do this

Deploy **one SeaDrop-compatible ERC-721 collection contract** for an umbrella daily series, configure it once as an OpenSea Drop, and enforce a daily supply unlock inside the NFT contract.

```text
One contract
One OpenSea collection/drop page
One logo and banner setup
One app collection integration
Daily supply unlock enforced onchain
No daily deploy transaction
No daily cron required for release timing
```

The app and OpenSea must call the same mint path and mint from the same contract. A mint made on either surface is therefore the same NFT in the same collection.

### Do not do this by default

Do not deploy a brand-new contract and OpenSea collection every day. Separate daily collections require repeated deployment, indexing, slug discovery, item upload, schedule configuration, logo/banner setup, wallet authorization, and gas. They also fragment holders and marketplace liquidity.

If the product requirement truly means a separate OpenSea collection page every day, use the bulk-deployment fallback in Section 10.

### Option comparison

| Option | Deployments | OpenSea setup | Daily owner work | Recommendation |
|---|---:|---:|---:|---|
| One umbrella contract with onchain daily unlock | 1 | 1 collection/drop | None after setup | **Best** |
| One umbrella standard contract with owner-raised supply | 1 | 1 collection/drop | One secure supply transaction per release | Fallback if custom gate is incompatible |
| Thirty separate collections prepared monthly | 30/month | 30/month | None if all schedules are accepted in advance | Only when separate pages are mandatory |
| Deploy a separate collection every day | 365/year | 365/year | Deployment and setup every day | Do not use |

## 2. Clarify the product language

Use these terms consistently:

- **Collection:** one contract and one OpenSea collection page.
- **Daily release:** the NFT or supply tranche that becomes mintable that day.
- **Daily edition:** multiple copies of one day’s artwork.

The minimal architecture is **one collection with daily releases**, not one collection per day.

## 3. Contract model

### Recommended V1 daily series

Use ERC-721 when each mint should have a unique token ID.

Configuration:

```text
startTime       Unix timestamp, preferably 00:00 UTC
cadence         86,400 seconds
releaseCount    30, 90, or 365 days
supplyPerDay    number of NFTs unlocked each day
maxSupply       releaseCount × supplyPerDay
mintPrice       fixed or configurable before launch
walletLimit     collection or stage limit
```

Daily release ceiling:

```solidity
function releasedSupply() public view returns (uint256) {
    if (block.timestamp < startTime) return 0;
    uint256 daysOpen = ((block.timestamp - startTime) / 1 days) + 1;
    uint256 released = daysOpen * supplyPerDay;
    return released > maxSupply ? maxSupply : released;
}
```

Preserve SeaDrop’s required `mintSeaDrop(address,uint256)` interface and allowed SeaDrop address. Enforce the release ceiling in the narrowest compatible extension point (for example a pre-mint hook or supply check) so:

```text
totalSupply + quantity <= releasedSupply()
```

OpenSea’s manual-deployment guide warns custom contracts not to modify SeaDrop minting functionality. Therefore the exact hook must be proven on Base Sepolia and accepted by OpenSea’s drop flow before mainnet. If the daily guard makes the contract incompatible, fall back to a standard SeaDrop contract with a controlled supply-update transaction; do not ship an untested custom mint path.

Once compatibility is proven, the onchain guard makes the schedule automatic and trustless. A Vercel cron, GitHub Action, or owner transaction cannot accidentally release tomorrow’s supply early.

### Daily artwork mapping

For one NFT per day:

```text
dayIndex = tokenId
```

For multiple unique NFTs per day:

```text
dayIndex = tokenId / supplyPerDay
```

If the requirement is multiple copies of the exact same daily item, evaluate an ERC-1155/SelfMint pilot separately. Do not switch to ERC-1155 until OpenSea item-level minting and scheduling are verified end-to-end on Base testnet.

## 4. Metadata strategy

### Best minimal-work option: immutable final metadata

Publish final metadata before the release window and avoid reveals or mutable base URIs.

For a fully onchain NFT:

- generate token JSON in `tokenURI(tokenId)`;
- embed or generate SVG/image data onchain;
- keep traits deterministic from token ID/day;
- return `data:application/json;base64,...` or another standards-compliant URI;
- do not require daily metadata uploads.

For large artwork that is impractical onchain:

- upload images and JSON to IPFS/Arweave in a monthly batch;
- use immutable content-addressed URIs;
- set the base URI before mint begins;
- avoid centralized URLs that can disappear.

### Metadata updates

If token metadata genuinely changes:

- ERC-721 emits `MetadataUpdate(tokenId)`;
- use `BatchMetadataUpdate(fromTokenId, toTokenId)` for a range;
- use `type(uint256).max` as the end when refreshing the full collection;
- optionally call OpenSea’s Refresh NFT Metadata endpoint after the transaction.

Do not run refresh calls every day when the token URI was already final. OpenSea can index the minted token normally.

## 5. Collection logo, banner, and OpenSea setup

### Lowest-maintenance option

Implement ERC-7572 `contractURI()` and point it to immutable collection metadata:

```json
{
  "name": "Daily Onchain Series",
  "description": "One onchain release every day on Base.",
  "image": "ipfs://.../logo.png",
  "banner_image": "ipfs://.../banner.png",
  "featured_image": "ipfs://.../featured.png",
  "external_link": "https://your-app.example/daily"
}
```

Emit `ContractURIUpdated()` if this URI changes.

### Reliable OpenSea automation

OpenSea also supports API updates, but they are not API-key-only operations:

- collection/drop write endpoints require OpenSea Wallet OAuth;
- collection writes require `write:collections`;
- drop writes require `write:drops`;
- logo/banner uploads use a three-step upload-context flow;
- the returned upload token is then passed to the collection PATCH endpoint.

Build a one-time CLI command, not a browser feature:

```text
npm run daily:opensea:setup
```

It should:

1. resolve the collection slug from the deployment receipt;
2. upload the logo;
3. upload the banner;
4. patch name, description, external URL, logo token, and banner token;
5. configure the OpenSea drop stage;
6. read the collection back and verify every expected field.

Keep OpenSea branding static for the umbrella collection. Change the daily hero image in this app, not the OpenSea collection banner. Uploading a different OpenSea banner every day adds OAuth, storage, failure, and moderation risk without changing the NFT itself.

## 6. Minting on the app and OpenSea

### OpenSea surface

Create an OpenSea primary drop using the SeaDrop-compatible contract. OpenSea provides:

- a collection/drop landing page;
- start/end times and mint limits;
- a mint transaction builder;
- direct collector minting on OpenSea.

OpenSea documentation currently states that primary Drops charge a 10% platform fee. Confirm the exact fee behavior and payout configuration before committing to pricing.

### App surface

Do not duplicate mint rules in client code. The app should ask the serverless route for OpenSea drop mint transaction data:

```text
POST /api/daily?action=mint
body: { collectionSlug, minter, quantity }
```

The serverless function calls OpenSea’s Drop Mint Transaction endpoint with the private API key and returns only:

```text
to, data, value, chain
```

The user signs and submits that transaction through the existing Viem/Reown wallet connection.

This keeps:

- the OpenSea key out of the browser;
- app mint behavior identical to OpenSea;
- price, stage, and eligibility sourced from one drop configuration;
- analytics based on the actual receipt.

Do not maintain a separate app-only mint function unless different platform fees are an intentional, documented product decision.

## 7. OpenSea stage and daily onchain unlock

Use one OpenSea public stage for the series, with a start time matching the contract and an end time no more than one year later.

OpenSea controls:

- public sale visibility;
- price;
- payout address;
- per-wallet stage limit;
- overall drop supply configuration.

The NFT contract controls:

- how much supply is unlocked today;
- absolute max supply;
- token identity and metadata;
- owner-only emergency pause.

OpenSea may display remaining max supply beyond today’s unlocked tranche. The contract remains the final authority and rejects excess mints. The app should display both:

```text
Available today
Total remaining in series
Next release countdown
```

## 8. App integration

Do not create one `collections/*.js` file per day.

Add one umbrella collection configuration and a daily-release manifest:

```text
daily/
├── series.json
├── releases.json
└── generated/
    ├── previews/
    └── validation-report.json
```

Example `series.json`:

```json
{
  "slug": "daily-onchain-series",
  "chainId": 8453,
  "contractAddress": "0x...",
  "openSeaSlug": "daily-onchain-series",
  "startAt": "2026-09-01T00:00:00Z",
  "cadenceSeconds": 86400,
  "releaseCount": 365,
  "supplyPerDay": 1,
  "mintPriceWei": "0"
}
```

The app derives today’s release from `startAt` and chain time. It should not require a daily code deployment.

Add one page or section with:

- today’s preview;
- onchain release number;
- countdown to next release;
- available-today supply;
- mint button;
- OpenSea button;
- previously released gallery;
- data-saver previews using the existing NFT media helpers.

Keep this daily series outside competitive Battle roles until a deliberate profile and balance mapping are approved.

## 9. One-time and recurring workflow

### One-time setup

1. finalize series name, symbol, price, wallet limit, start time, days, and supply/day;
2. generate or finalize all onchain art/metadata logic;
3. deploy and test on Base Sepolia;
4. verify app mint and OpenSea mint use the same contract/path;
5. test day rollover using short test intervals;
6. deploy once on Base;
7. poll OpenSea deploy receipt for contract and slug;
8. configure collection metadata, logo, banner, payout, and drop stage;
9. add one app series config;
10. run a full launch dry run.

### Daily work after launch

```text
None for release timing.
```

Optional daily work:

- post social announcement;
- feature the release in the app;
- monitor mint/index status.

### Monthly work

If art is fully onchain and preconfigured: no metadata upload.

If using IPFS/Arweave batches:

- generate next month’s assets;
- upload and pin;
- validate every URI before its release window;
- never replace already released immutable metadata.

## 10. Separate collection every day — fallback plan

Choose this only when each day must have its own:

- contract address;
- OpenSea collection page and slug;
- independent holder set;
- independent logo/banner;
- independent drop schedule.

### Minimal feasible workflow

Do not deploy on launch day. Prepare a rolling 30-day batch.

For each monthly batch:

1. generate 30 contract/drop manifests;
2. build 30 deployment transactions;
3. sign and broadcast deployments in advance;
4. poll every deployment receipt until OpenSea returns contract address and slug;
5. upload each collection’s items and metadata;
6. schedule starts 24 hours apart;
7. upload/patch logos and banners;
8. generate 30 app collection config files;
9. run automated verification;
10. manually review before publication.

### Why this is not minimal

Every daily collection still requires a unique onchain deployment and OpenSea setup. A factory may reduce deployment gas, but it does not automatically guarantee OpenSea Creator Studio linkage or remove collection-level configuration.

Never place an unrestricted deployer private key in GitHub Actions or Vercel. Prefer manual/multisig signing for the monthly batch. OAuth collection metadata updates can be scripted separately.

## 11. Automation commands to build

Recommended scripts:

```text
npm run daily:validate          # validate schedule, metadata, supply and artwork
npm run daily:preview           # generate lightweight app previews
npm run daily:testnet           # Base Sepolia end-to-end checks
npm run daily:deploy            # build deployment transaction; wallet signs
npm run daily:opensea:setup     # OAuth upload + collection/drop configuration
npm run daily:verify            # contract, tokenURI, contractURI, OpenSea and app checks
```

The commands should be idempotent and write a state file containing transaction hashes, contract address, OpenSea slug, and completed steps. Re-running a command must continue from the first incomplete step instead of redeploying.

## 12. Security and operational rules

- never put OpenSea API keys or OAuth tokens behind `VITE_*` variables;
- never commit private keys, OAuth tokens, signed upload URLs, or upload fields;
- never use a hot deployer key for unattended daily contract deployments;
- use a multisig/secure owner for pause and metadata controls;
- test daily unlock boundaries with timestamp fuzzing;
- cap quantity and released supply in the contract, not only the UI;
- verify `contractURI`, `tokenURI`, royalty, payout, and SeaDrop addresses before ownership transfer;
- add ERC-4906 and ERC-7572 events/interfaces;
- pause before changing active drop supply or pricing;
- keep an emergency app disable switch that does not alter already-valid onchain mints.

## 13. Pilot before a 365-day commitment

Run a seven-release pilot on Base Sepolia with accelerated intervals, then a seven-day Base pilot.

Required checks:

- app and OpenSea mint the same contract;
- tomorrow’s supply cannot mint early;
- day rollover works without an owner transaction;
- token IDs map to the intended artwork;
- OpenSea indexes item metadata automatically;
- ERC-4906 refresh works when tested;
- collection logo/banner remain correct;
- platform fees and creator payouts match expectations;
- sold-out and missed-day behavior are acceptable;
- mobile/Farcaster wallet minting works.

Only then configure a 90- or 365-day schedule.

## 14. Final recommendation

Use **one umbrella daily collection, one deployment, one OpenSea drop, immutable prebuilt/onchain metadata, and an onchain daily supply unlock**.

This is the only option that simultaneously provides:

- minting from the app and OpenSea;
- one shared contract and collection;
- automatic daily timing;
- minimal metadata maintenance;
- one-time logo/banner setup;
- no daily deploy transaction;
- no always-on scheduler;
- the lowest long-term operational risk.

## 15. OpenSea references used

- [Create a primary drop](https://docs.opensea.io/docs/create-a-drop)
- [Deploy a SeaDrop-compatible contract manually](https://docs.opensea.io/docs/deploying-a-seadrop-compatible-contract)
- [Mint from a drop programmatically](https://docs.opensea.io/docs/mint-from-a-drop)
- [Update Creator Studio drop stages](https://docs.opensea.io/reference/save_drop_edits)
- [Modify collection metadata](https://docs.opensea.io/reference/modify_collection)
- [Upload collection images](https://docs.opensea.io/reference/upload_collection_image)
- [ERC-721 metadata update events](https://docs.opensea.io/docs/updating-metadata)
- [ERC-7572 contract-level metadata](https://docs.opensea.io/docs/contract-level-metadata)
