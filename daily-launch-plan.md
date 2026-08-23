# Daily ERC-721 Collection Launch Plan

**Confirmed product requirement:** every day launches a **new ERC-721 collection with a new manually deployed contract**, matching the current style of this app. Each collection must be mintable from both this app and OpenSea.

This requirement replaces the earlier umbrella-contract recommendation.

## 1. Best approach under this requirement

Do not deploy on the same day as launch. Manually deploy collections in a rolling batch, then let onchain start times activate one collection per day.

### Recommended rollout

```text
Pilot: deploy 7 collections in advance
Stable operation: deploy 30 collections once per month
Each collection: independent ERC-721 contract
Each contract: independent OpenSea collection/drop page
Launch times: exactly 24 hours apart
App deployment: once per batch, not once per day
```

This preserves a separate contract and OpenSea identity for every collection while minimizing repetitive daily work.

### Do not use

```text
Deploy contract in the morning
Wait for OpenSea indexing
Configure logo/banner/drop
Update the app
Launch later the same day
```

Same-day deployment is fragile because indexing, collection-slug creation, metadata ingestion, wallet authorization, or image uploads can be delayed.

## 2. Contract standard

A normal ERC-721 contract will appear and trade on OpenSea, but it will not automatically provide a primary mint button on OpenSea.

To mint on both surfaces, every new daily contract should use the same audited **SeaDrop-compatible ERC-721 template**.

Start from OpenSea’s `ERC721SeaDrop` implementation and preserve:

- `mintSeaDrop(address minter, uint256 quantity)`;
- the allowed SeaDrop deployment for Base;
- public-drop and presale update functions;
- creator payout configuration;
- mint statistics and maximum supply behavior.

Verify the current official SeaDrop address for Base before deployment. Do not copy an address from another network without checking the official SeaDrop deployment list.

### Daily contract constructor/configuration

Each deployment needs:

```text
name
symbol
maxSupply
mintStart
mintEnd (optional; zero means open until sold out)
mintPrice
maxPerWallet
baseURI or onchain renderer configuration
contractURI
owner / multisig
allowed SeaDrop address
```

### Recommended launch behavior

Default:

- collection N opens at its scheduled `mintStart`;
- it remains mintable until sold out;
- the next collection opens 24 hours later;
- older collections remain visible and mintable if supply remains.

If every collection must be available for only 24 hours, set and enforce `mintEnd`. Decide this before contract deployment because it changes collector experience and unsold-supply policy.

### Enforce timing onchain

Do not rely only on app visibility or OpenSea stage dates. The contract must reject early minting.

```solidity
require(block.timestamp >= mintStart, "Mint not started");
if (mintEnd != 0) require(block.timestamp < mintEnd, "Mint ended");
```

Preserve SeaDrop’s required mint interface. Implement timing through a tested compatible hook or extension point. OpenSea’s manual-deployment documentation warns custom contracts not to modify SeaDrop minting behavior, so Base Sepolia compatibility testing is mandatory.

## 3. One reusable contract codebase

Do not create a new Solidity implementation for every daily collection.

Use one audited template and change constructor/configuration values only.

Recommended structure:

```text
contract-sol/
├── src/
│   ├── DailyERC721SeaDrop.sol
│   ├── DailyOnchainRenderer.sol
│   └── interfaces/
├── script/
│   ├── DeployDailyBatch.s.sol
│   └── VerifyDailyBatch.s.sol
├── test/
│   ├── DailyERC721SeaDrop.t.sol
│   ├── MintSchedule.t.sol
│   ├── Metadata.t.sol
│   └── SeaDropCompatibility.t.sol
└── deployments/
    ├── base-sepolia.json
    └── base.json
```

Every deployed contract should have identical verified bytecode except immutable/constructor inputs when possible.

## 4. Manual deployment without daily work

“Manual deployment” should mean you control and sign deployments—not that you repeat the entire process every day.

### Seven-day pilot

1. Prepare seven collection manifests.
2. Deploy seven contracts on Base Sepolia.
3. Set accelerated launch intervals for testing.
4. Confirm app mint and OpenSea mint for each contract.
5. Deploy seven contracts on Base with real daily start times.
6. Configure all seven OpenSea pages.
7. Publish one app build containing all seven scheduled collections.

### Monthly steady state

Once the pilot is stable:

1. Prepare 30 manifests and artwork packages.
2. Run one deployment script that builds/broadcasts 30 transactions.
3. Sign deployments with the owner wallet or multisig process.
4. Verify every contract on Basescan.
5. Configure all 30 OpenSea collections/drop stages.
6. Generate all 30 app collection files.
7. deploy the app once.
8. Run an automated verification report.

No contract deployment is required on the individual launch days.

### Do not use an unattended hot wallet

Never store a deployer private key in:

- GitHub Actions;
- Vercel environment variables;
- repository files;
- browser code;
- generated deployment manifests.

Use a hardware wallet, secure signer, or multisig-approved batch. OpenSea OAuth metadata operations can be automated separately from onchain deployment signing.

## 5. Per-collection manifest

Create one source-of-truth manifest per daily collection.

```text
daily/
├── manifests/
│   ├── 2026-09-01.json
│   ├── 2026-09-02.json
│   └── ...
├── artwork/
│   ├── 2026-09-01/
│   └── ...
├── generated/
│   ├── collections/
│   ├── opensea/
│   └── reports/
└── batch-state.json
```

Example:

```json
{
  "releaseDate": "2026-09-01",
  "launchAt": "2026-09-01T00:00:00Z",
  "name": "Daily Signal 001",
  "symbol": "DS001",
  "slug": "daily-signal-001",
  "description": "The first Daily Signal on Base.",
  "maxSupply": 100,
  "maxPerWallet": 2,
  "priceWei": "0",
  "mintEnd": null,
  "tokenMetadataMode": "onchain",
  "logoPath": "daily/artwork/2026-09-01/logo.png",
  "bannerPath": "daily/artwork/2026-09-01/banner.png",
  "shareImagePath": "daily/artwork/2026-09-01/share.png",
  "contractAddress": null,
  "openSeaSlug": null,
  "deploymentTx": null
}
```

The deployment and OpenSea scripts update only generated/batch state. The original manifest remains the intended configuration.

## 6. Metadata strategy

### Token metadata

For the current fully onchain NFT style:

- generate JSON from `tokenURI(tokenId)`;
- generate or embed SVG/image data onchain;
- keep attributes deterministic;
- return standards-compliant `data:application/json` metadata;
- avoid daily metadata upload jobs.

If art is too large for onchain storage, upload immutable assets to IPFS/Arweave before the monthly deployment batch.

### Collection metadata

Implement ERC-7572 `contractURI()` for every collection:

```json
{
  "name": "Daily Signal 001",
  "description": "The first Daily Signal on Base.",
  "image": "ipfs://.../logo.png",
  "banner_image": "ipfs://.../banner.png",
  "featured_image": "ipfs://.../featured.png",
  "external_link": "https://your-app.example/mint/daily-signal-001"
}
```

Even when token art is fully onchain, using immutable IPFS assets for large marketplace branding is reasonable.

### Metadata changes

If metadata changes after deployment:

- emit ERC-721 `MetadataUpdate(tokenId)`;
- emit `BatchMetadataUpdate(fromTokenId, toTokenId)` for ranges;
- emit `ContractURIUpdated()` after collection metadata changes;
- optionally call OpenSea’s refresh endpoint.

Prefer final metadata before launch. Automatic refresh should be a recovery tool, not the normal daily workflow.

## 7. OpenSea collection setup

Each daily contract needs its own OpenSea collection/drop configuration.

### Required sequence

1. Deploy the SeaDrop-compatible ERC-721 contract manually.
2. Verify it on Basescan.
3. Wait for or trigger OpenSea contract indexing/import.
4. resolve the OpenSea collection slug for the contract.
5. upload logo and banner.
6. patch collection name, description, external URL, logo, and banner.
7. configure creator payout, supply, price, limits, start, and end.
8. publish/verify the drop page.
9. verify mint transaction generation before launch.

### Logo and banner automation

OpenSea supports automation, but collection writes require more than an API key:

- Wallet OAuth with `write:collections` for collection edits;
- Wallet OAuth with `write:drops` for drop stages;
- a three-step upload-context flow for logo and banner;
- short-lived upload URLs/fields that must never be logged or persisted.

Create a CLI script:

```text
npm run daily:opensea:setup -- --batch 2026-09
```

For each deployed contract it should:

1. resolve/store the OpenSea slug;
2. request logo upload context;
3. upload logo bytes;
4. request banner upload context;
5. upload banner bytes;
6. PATCH collection metadata with returned tokens;
7. configure the drop stage;
8. GET the collection/drop and verify the result.

OpenSea branding remains unique per daily collection, but setup is performed in a monthly batch rather than daily.

## 8. Mint from both app and OpenSea

Both surfaces must use the same contract and SeaDrop stage.

### OpenSea

Collectors use that daily collection’s OpenSea Drop page.

### This app

Add an OpenSea-drop mint provider instead of trying to call the existing custom `mint/freeMint/claim` ABI path.

Collection configuration:

```js
{
  mintProvider: 'opensea-drop',
  openSeaSlug: 'daily-signal-001',
  contractAddress: '0x...',
  launchAt: '2026-09-01T00:00:00Z'
}
```

App flow:

```text
1. User presses Mint.
2. Browser calls /api/daily?action=mint.
3. Serverless function calls OpenSea Build Drop Mint Transaction.
4. It returns to/data/value/chain only.
5. Existing Viem/Reown wallet submits the transaction.
6. App waits for receipt and records analytics.
```

This keeps the OpenSea API key server-side and makes app/OpenSea stage behavior consistent.

OpenSea documentation currently states a 10% fee for primary Drops. Verify current fee recipient, payout, and whether the app-generated SeaDrop path has identical economics before final pricing.

## 9. App publication with minimal work

The current app auto-discovers `collections/*.js`. Use that mechanism rather than redesigning the registry immediately.

Add a generator:

```text
scripts/generate-daily-collections.mjs
```

It reads deployed manifests and produces:

```text
collections/daily-signal-001.js
collections/daily-signal-002.js
...
```

Each generated collection includes its future `launchAt`. The existing collection scheduling logic can show it as upcoming and activate it at the correct time.

Monthly app workflow:

```bash
npm run daily:collections:generate -- --batch 2026-09
npm run collections:sync
npm test
npm run build
```

Then deploy the app once for the whole batch.

### Battle role policy

New daily collections should initially be mint/gallery-only:

```text
battleRole: UNSUPPORTED
```

Do not automatically add a new fighter profile every day. Add battle support only through a tested generic profile or a deliberate balance batch.

## 10. Automation scripts

Recommended commands:

```text
npm run daily:manifest:validate
npm run daily:artwork:validate
npm run daily:deploy:testnet
npm run daily:deploy:base
npm run daily:verify:contracts
npm run daily:opensea:setup
npm run daily:collections:generate
npm run daily:verify:launches
```

### Idempotent batch state

`daily/batch-state.json` should record:

```text
manifest hash
deployment transaction
contract address
Basescan verification status
OpenSea slug
logo upload complete
banner upload complete
drop configuration complete
app config generated
final verification status
```

Re-running any command continues from incomplete steps and never redeploys a completed collection.

## 11. Automated verification report

Before the monthly app deployment, verify every daily collection:

### Contract

- correct name/symbol;
- correct owner;
- correct SeaDrop address;
- exact max supply;
- correct mint start/end;
- correct price and wallet limit;
- early mint reverts;
- mint during window succeeds;
- token URI returns valid JSON;
- contract URI returns valid JSON;
- ERC-4906 support exists;
- source is verified on Basescan.

### OpenSea

- contract indexed;
- collection slug resolved;
- correct logo and banner;
- correct description and external URL;
- drop page visible;
- correct start/end, price, payout, limit, and supply;
- mint transaction builder returns the expected contract;
- test mint receipt is indexed.

### App

- collection appears as upcoming before launch;
- mint disabled before `launchAt`;
- collection activates at launch time;
- app transaction target matches OpenSea target;
- success analytics and gallery update;
- OpenSea and explorer links are correct;
- mobile/Farcaster wallet flow succeeds.

Output:

```text
daily/generated/reports/2026-09-launch-report.json
daily/generated/reports/2026-09-launch-report.md
```

Do not publish the batch when any collection has a red verification result.

## 12. Seven-collection pilot

Before committing to 30 or 365 contracts:

### Base Sepolia

- deploy seven contracts with short test intervals;
- configure seven test collection/drop pages if supported;
- test all app/OpenSea mint paths;
- test metadata and branding updates;
- test failed/re-run automation.

### Base mainnet

- deploy seven real collections seven days ahead;
- keep supply and price conservative;
- monitor indexing latency and platform fees;
- measure manual time spent per collection;
- document any OpenSea OAuth/upload failures.

Move to monthly 30-contract batches only when the seven-day pilot requires no same-day emergency fixes.

## 13. Required decisions before implementation

Provide these defaults once; the manifest generator handles the rest:

1. collection naming pattern;
2. symbol pattern;
3. first launch date and UTC time;
4. max supply per daily collection;
5. mint price;
6. max per wallet;
7. mint remains open or closes after 24 hours;
8. fully onchain SVG or IPFS/Arweave art;
9. shared or unique logo/banner template;
10. owner wallet or multisig;
11. creator payout address;
12. royalty policy;
13. seven-day or thirty-day first batch.

## 14. Recommended implementation sequence

### PR A — Contract template and testnet deployment

- SeaDrop-compatible ERC-721 template;
- timing guard;
- onchain metadata/renderer;
- `contractURI`;
- ERC-4906;
- Foundry tests and deployment scripts.

### PR B — Daily manifest and config generator

- schema validation;
- artwork/branding validation;
- generated collection files;
- batch state and reports.

### PR C — OpenSea batch setup CLI

- OAuth login/token use;
- collection slug resolution;
- logo/banner upload flow;
- collection PATCH;
- drop stage configuration;
- read-back verification.

### PR D — App OpenSea-drop mint provider

- grouped `/api/daily?action=mint` serverless action;
- transaction builder client;
- mint page integration;
- receipt analytics;
- upcoming/daily schedule UX.

### PR E — Seven-release pilot fixes

- Base Sepolia and Base verification;
- indexing/metadata recovery;
- operational runbook;
- monthly batch readiness.

## 15. Final recommendation

Given the confirmed requirement, use:

```text
New ERC-721 contract for every daily collection
+ one reusable SeaDrop-compatible implementation
+ manual deployment in 7/30-contract advance batches
+ onchain mint start time per contract
+ automated OpenSea logo/banner/drop setup
+ generated app collection files
+ one app deployment per batch
```

This keeps the independent daily collection model while reducing daily work to monitoring and promotion rather than deployment and configuration.

## 16. OpenSea references

- [Create a primary drop](https://docs.opensea.io/docs/create-a-drop)
- [Deploy a SeaDrop-compatible contract manually](https://docs.opensea.io/docs/deploying-a-seadrop-compatible-contract)
- [Mint from a drop programmatically](https://docs.opensea.io/docs/mint-from-a-drop)
- [Update Creator Studio drop stages](https://docs.opensea.io/reference/save_drop_edits)
- [Modify collection metadata](https://docs.opensea.io/reference/modify_collection)
- [Upload collection images](https://docs.opensea.io/reference/upload_collection_image)
- [ERC-721 metadata update events](https://docs.opensea.io/docs/updating-metadata)
- [ERC-7572 contract-level metadata](https://docs.opensea.io/docs/contract-level-metadata)
