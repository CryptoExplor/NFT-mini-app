# Multi-NFT Battle V1 — Current-State Audit and Revised Delivery Plan

**Audit date:** 2026-08-22  
**Repository baseline:** `arena/01a02a40-nft-mini-app` / PR #7  
**Scope reviewed:** the supplied 10-task V1 plan against the current client, shared battle domain, Vercel serverless battle functions, analytics, and tests.

> The daily NFT release/marketplace initiative is tracked separately in [`daily-launch-plan.md`](./daily-launch-plan.md). It should launch as one umbrella mint series and should not expand Battle roles until the V1 battle contract is stable.

## 1. Executive assessment

The repository is **not starting from zero**. Most V1 concepts have a visible implementation, but several are scaffolds or competing implementations rather than one complete contract.

### Estimated progress

| Area | Estimated complete | Remaining |
|---|---:|---:|
| Feature/UI capability | 65% | 35% |
| Exact compliance with the supplied V1 contracts | 55% | 45% |
| Balance/mapping compliance | 40% | 60% |
| Required V1 battle tests | 20% | 80% |
| Serverless authority/readiness | 80% | 20% |
| **Overall V1 plan** | **~55%** | **~45%** |

These percentages measure the acceptance criteria in the supplied plan, not lines of code. A file existing does not count as complete when it is not wired into the live flow.

### Headline conclusion

Do **not** begin a broad file-moving refactor yet. First fix the domain-contract drift and add tests around the intended behavior. Refactoring before that would preserve the current inconsistencies in cleaner folders.

The recommended order is:

1. lock the *actual* authority and balance decisions;
2. create one runtime-validated loadout contract;
3. fix role gating, snapshot construction, and layer application;
4. make the engine deterministic by contract;
5. add the missing battle tests and balance simulations;
6. then split large files without changing behavior.

## Master ecosystem plan V2 — merge decision

The second “Web3 Gaming Ecosystem” document should **not be merged literally into the V1 implementation contract**. It is useful as a product vision, but it mixes four years of scope levels, introduces a different stat economy and team model, and assumes a different technical stack.

The best structure is:

- this document remains the executable V1 stabilization and refactor plan;
- selected V2 ideas become a gated product roadmap after V1;
- conflicting V2 rules are explicitly rejected or deferred instead of silently overriding V1.

### Master-roadmap progress against the current repository

| Master phase | Current progress | Assessment |
|---|---:|---|
| Unified Arena | ~65% | Live capability exists, but contracts, balance parity, tests, and arena effects need completion |
| Multi-NFT Synergy Layer | ~30% | Item/arena/team scaffolds exist; the documented three-active-NFT team system does not |
| Arcade / Multiverse | ~5% | Shared stats could support it, but dungeon/card modes are not implemented |
| Faction Wars & DAO | 0% | No faction contract, season economy, governance, or crafting system |
| **Complete master roadmap** | **~20%** | Appropriate: later phases should not be built before V1 retention is proven |

### What should be merged now

| V2 idea | Decision | How it enters the executable plan |
|---|---|---|
| One universal normalized stat object | Accept | Complete the shared normalizer/resolver and test it before refactoring |
| Pure portable combat logic | Accept | Keep battle domain free of DOM, storage, wallet, and network imports |
| Phased product delivery | Accept | Use release gates rather than calendar-only promises |
| Cross-collection identity and counters | Accept | Keep profiles and role rules collection-specific while engine stays collection-agnostic |
| Multi-NFT synergies | Defer to Phase 2 | Add a new `TeamCompositionV2`; do not overload V1 `teamSnapshot` |
| More game modes reusing normalized stats | Defer to Phase 3 | Begin only after the Arena contract and balance suite are stable |
| Faction competition | Defer to Phase 4 | Requires real usage, season design, anti-sybil rules, and reward policy |
| Data-driven balance guardrails | Accept | Add matchup simulator and telemetry before setting final caps |
| Live balance configuration | Accept with integrity | Keep checksum support and add schema/version validation plus rollback |
| Retention and collection-diversity metrics | Accept | Instrument canonical loadout/result payloads first |

### What should not be merged into V1

| V2 proposal | Decision | Reason |
|---|---|---|
| HP 400–1000 and ATK 50–200 schema | Reject for V1 | It forces a total rebalance and conflicts with every current cap, replay, sanitizer, and UI scale |
| BaseMoods becomes only a modifier | Reject for V1 | It conflicts with the locked V1 fighter role and current profile/passive implementation |
| Client-authoritative battle resolution | Reject | Current serverless PvP and verified AI are safer and already implemented |
| `spd + random(0,10)` using ambient randomness | Reject as written | Any variation must use the stored seeded PRNG so replay remains exact |
| 1.75x crit plus 60% crit cap | Defer to simulation | Current engine uses 1.5x; changing both multiplier and cap together creates a large burst-meta shift |
| Three active fighter NFTs in current loadout | Defer to a new schema | V1 has one fighter, one item, one arena, and a passive roster snapshot |
| MiniWorld staking and 2% rewards in Phase 1 | Defer | Adds contract, custody, reward-economy, audit, abuse, and legal scope before arena usage is proven |
| On-chain BattleResult writes in Phase 1 | Defer | Serverless replay records already provide verification without transaction friction or gas |
| Both players sign commitment transactions | Reject for current Arena | High-friction wallet prompts are unnecessary when the serverless function simulates PvP authoritatively |
| React, Phaser, RainbowKit, Alchemy migration | Reject as a feature requirement | Current stack is Vanilla JS, CSS/canvas effects, Reown AppKit, Viem, and OpenSea; stack migration does not deliver game value |
| Month 1–12 commitments | Replace with gates | Quality, player activity, audit readiness, and retention should unlock phases—not elapsed time alone |
| “Any NFT from any collection” at launch | Reword | V1 is “any supported NFT”; a safe generic adapter is a later capability |

### Unified product roadmap

#### Release 0 — Stabilize the current layered arena

This is the work defined by the rest of this document:

- canonical loadout and inventory contracts;
- one shared stat/layer resolver;
- deterministic snapshot and combat;
- serverless role/ownership validation;
- preview/server parity;
- tests and balance simulation.

**Gate to release:** all V1 definition-of-done checks in this document pass.

#### Release 1 — Unified Layered Arena

Ship and tune the product that already exists:

```text
1 active Fighter
+ 0/1 Item
+ 0/1 creator-selected Arena
+ deterministic passive roster snapshot
```

Mini Worlds is an off-chain/serverless-verified arena choice in this release. No staking or reward percentage is required.

**Gate to Release 2:**

- battle-start failure rate below 2%;
- no collection over 58% sustained win rate after a meaningful sample;
- deterministic replay mismatch rate 0%;
- at least 30% seven-day retention target or an evidence-based revised baseline;
- optional-slot telemetry is reliable.

#### Release 2 — Active Team & Synergy Mode

Create a new schema rather than mutate V1:

```text
TeamCompositionV2
- activeFighter
- support or second active NFT
- amplifier/equipment
- arena reference
- synergy IDs derived from canonical refs
- schemaVersion: 'battle-team-v2'
```

The supplied seven synergies are design candidates, not automatic launch rules. Each needs profile mapping, cap analysis, tests, and simulation. BaseMoods can gain support behavior in this mode without losing its V1 fighter identity.

**Gate to Release 3:** synergy usage, item advantage, and team diversity meet agreed targets without invalidating common NFTs.

#### Release 3 — Arcade consumers of the battle domain

Build one additional mode first, not two in parallel. Recommended first candidate: idle dungeon, because it can consume normalized stats without requiring a second real-time combat UX.

Requirements:

- mode-specific resolver separate from battle caps;
- shared canonical NFT identity/profile adapters;
- separate replay/reward integrity model;
- no imports from Arena UI components.

#### Release 4 — Factions, seasons, and optional on-chain commitments

Only begin after durable player activity. Before contracts:

- define reward source and liabilities;
- define anti-sybil rules;
- model staking custody and emergency withdrawal;
- obtain contract/security review;
- decide whether results need on-chain attestations or only periodic season roots;
- treat DAO and burn/crafting mechanics as separate audited products.

### Unified stat strategy

Do not replace the current compact combat scale with HP 400–1000 merely for presentation. Keep a stable internal normalized scale and, if larger numbers feel more exciting, apply a **display-only multiplier** in the UI.

Recommended internal V1 envelope remains:

```text
hp 30–220
atk 5–48
def 5–48
spd 5–48
crit 0–0.40
dodge 0–0.35
lifesteal 0–0.15
magicResist 0–80
regen 0–10
```

The matchup simulator may revise these values, but all consumers must move together. Never maintain one scale for preview, one for client combat, and one for server sanitization.

### Technology decision

Portability requires **pure modules**, not necessarily a TypeScript/React rewrite. The existing ESM code can be shared by browser and Vercel Node today. TypeScript may be introduced incrementally after runtime schemas and tests exist, but it is not a prerequisite for V1 correctness.

Likewise, OpenSea versus Alchemy and Reown versus RainbowKit are provider choices behind adapters. They should not be coupled to the game-domain plan.

### Smart-contract decision gate

No new gameplay contract is recommended for the current V1 milestone. Consider contracts only when the trust requirement cannot be met serverlessly:

| Proposed contract | Earliest gate |
|---|---|
| Battle result attestation | After replay model is stable and users need portable on-chain proof |
| MiniWorld staking | After arena usage is proven and reward economics/audit are approved |
| Team registry | Only if on-chain team identity creates product value beyond signed serverless loadouts |
| Faction seasons | After meaningful collection participation and anti-sybil design |
| Governance | After there is a governed asset, active community, and safe upgrade process |

---

## 2. Important correction to the original architecture plan

The supplied plan says **“Client authoritative now — server-ready contracts”** and later says no server is deployed. That is no longer true.

The app already has no dedicated/always-on server, but it **does have Vercel serverless authority**:

- `POST /api/battle?action=challenge` stores authenticated challenges;
- `POST /api/battle?action=fight` resolves PvP server-side;
- `POST /api/battle?action=record` re-simulates and verifies AI battles;
- ownership is checked server-side;
- replay/history records are persisted in Upstash/KV;
- points and competitive analytics only accept verified results.

### Recommended locked decision

Keep the current model:

> **Serverless-authoritative PvP and verified AI records, with deterministic client preview/rendering.**

Do not downgrade back to client-authoritative results. “No dedicated server” and “no server authority” are different statements.

---

## 3. Locked-decision audit

| Decision | Current state | Recommendation |
|---|---|---|
| 1v1 Fighter + Item + Arena | Implemented in UI and payloads | Keep |
| Client-authoritative Phase 1 | Superseded by serverless authority | Replace with current serverless-authoritative model |
| Roles by canonical collection slug | Partially implemented | Keep, but enforce on both client and server |
| Fighter required; item/arena optional | Implemented in UI | Keep |
| Team snapshot | Present but inconsistent | Standardize and integrate |
| Six launch collections | All six exist, but scope expanded to more collections | Add an explicit `v1Enabled` flag instead of deleting extra profiles |
| Conservative caps + diminishing returns | Partially implemented with conflicting cap tables | Unify before tuning |
| Creator arena locked for PvP | Payload is stored and challenger arena is ignored | Keep, but make the arena actually affect PvP |
| One item per side | Implemented | Keep |
| Top-20 snapshot | Client says 20; server truncates to 12 | Change V1 to **12** or update every layer to 20; recommendation: 12 |
| Canonical mapping table | Current mappings differ substantially | Reconcile against real metadata and simulation results |

### Why 12 team entries is recommended

The current server already sanitizes to 12. Twelve supports the 10+ NFT passive, reduces challenge payload size, limits forged/sanitized inputs, and is easier to display. Recommended deterministic layout:

- positions 0–2: equipped fighter, item, arena when present;
- positions 3–11: nine sorted bench NFTs;
- total hard cap: 12.

If Top-20 remains a product requirement, update `teamSnapshot.js`, `NFTSelectorModal.js`, server sanitizer, payload-size tests, replay schema, and balance simulations together. Do not leave 20 client-side and 12 server-side.

---

## 4. Ten-task implementation audit

### Task 1 — Unify collection role/rule source

**Status: 70% complete**

Already present:

- `src/lib/battle/collectionProfiles.js` exists;
- fighter/item/environment roles are defined there;
- aliases and `getRoleForSlug()` exist;
- metadata normalization and inventory consume the profiles.

Remaining:

- return `UNSUPPORTED`, not `UNKNOWN`, to match the public contract;
- export canonical role/slug sets or derive them from profiles;
- add `v1Enabled` / `allowedModes` enforcement in the UI and server;
- remove role-policy duplication from UI/server conditionals where possible;
- align the actual trait mappings with the approved mapping table;
- add profile unit tests.

Important drift:

- profiles include more than the six locked V1 collections;
- `allowedModes` says modifiers are V2-only, but the selector currently exposes them;
- mapping values differ from the supplied canonical table.

### Task 2 — Enrich inventory output

**Status: 50% complete**

Already present in `src/lib/nftInventory.js`:

- role resolution;
- `slotEligible`;
- normalized fighter/item/arena stats;
- existing display fields are preserved.

Remaining:

- add exact canonical `collectionSlug`;
- add exact string `tokenId` while retaining `nftId` for compatibility;
- resolve by contract address first, OpenSea slug second, aliases last;
- return unsupported NFTs as `role: 'UNSUPPORTED', slotEligible: false` if the UI should display them;
- stop passing whole inventory records as `SlotTokenRef` values;
- add tests for contract-based resolution and aliases.

Current risk:

The live inventory primarily exposes `engineId` and `nftId`, while battle code often reads `collectionSlug` and `tokenId`. This produces fallbacks such as `unknown_0`, weakens ownership resolution, and makes analytics fighter slugs null.

### Task 3 — Canonical normalizer and cap enforcement

**Status: 40% complete**

Already present:

- fighter, item, and arena normalization functions;
- centralized `STAT_CAPS` / `STAT_FLOORS`;
- `applyLayer()` with scale and clamping;
- passive resolution.

Remaining:

- clamp the base fighter layer immediately;
- include `magicResist`, `damageMultiplier`, and every engine-read stat in one cap function;
- use one cap table in normalizer, server sanitizer, and engine;
- remove the engine’s separate 0.75 crit/dodge, 0.8 lifesteal, and 90 resist ceilings;
- implement Neon Rune `runePower` behavior instead of a fixed +10 ATK fallback;
- implement actual Mini Worlds biome output instead of a fixed +25 HP placeholder;
- align trait values/casing with actual OpenSea metadata;
- add the missing unit tests.

Current cap drift:

| Stat | Supplied plan | Current balance config | Current engine ceiling |
|---|---:|---:|---:|
| hp | 220 | 220 | no shared final cap after synergy |
| atk | 48 | 48 | no shared final cap after synergy |
| def | 48 | 48 | no shared final cap after synergy |
| spd | 48 | 50 | no shared final cap after synergy |
| crit | 0.40 | 0.60 | 0.75 |
| dodge | 0.35 | 0.50 | 0.75 |
| lifesteal | 0.30 | 0.15 | 0.80 |
| magicResist | 80 | 80 | 90 |
| regen | 10 | 15 | unshared |

Recommended conservative starting envelope before simulation:

```text
hp 220 · atk 48 · def 48 · spd 48
crit 0.40 · dodge 0.35 · lifesteal 0.15
magicResist 80 · regen 10 · damageMultiplier 2.0
```

Lifesteal should remain at 0.15 initially rather than jump directly to 0.30; increase it only if matchup simulations show sustain is too weak.

### Task 4 — Team snapshot builder

**Status: 30% complete**

Already present:

- `teamSnapshot.js`;
- deterministic sorting helper;
- a snapshot cap;
- team bonus helper;
- snapshot hashing helpers.

Remaining:

- wire `buildTeamSnapshot()` into the selector and challenge flow;
- accept `(inventory, selectedLoadout)`;
- pin equipped slots first;
- sort Fighter → Item → Environment, then numeric token ID with lexical fallback;
- use canonical `collectionSlug` / `tokenId`;
- settle 12 versus 20 everywhere;
- implement exactly one team-passive rule table;
- ensure server recomputation/verification rather than trusting arbitrary client team rows;
- add determinism, pinning, cap, and hash tests.

Current behavior:

`NFTSelectorModal` assigns `inventory.slice(0, 20)` directly. The standalone deterministic builder is not used, equipped slots are not pinned, and the server later truncates the team to 12.

### Task 5 — Loadout builder UI

**Status: 65% complete**

Already present:

- Fighter / Item / Arena tabs;
- required fighter and optional item/arena selection;
- full loadout callback;
- role-filtered cards;
- selected slot previews;
- basic modifier display.

Remaining:

- build the deterministic team snapshot after every selection;
- show the team thumbnail strip;
- show live final stats and per-layer deltas;
- hide or disable Arena when unavailable according to the final UX choice;
- render the exact no-fighter blocking message;
- do not inject trial NFTs into empty categories for a connected wallet;
- use a controller/pure selector model so role-gating tests do not require DOM tests;
- output canonical `BattleLoadoutV1`, not raw inventory records.

Current UX defect:

For a connected wallet with no eligible fighter, trial cards are rendered as a fallback, but they are not part of `this.inventory`, so clicking them cannot select them. The user sees apparently selectable cards instead of the required explicit “You need a Fighter NFT” state.

### Task 6 — Challenge flow

**Status: 75% complete**

Already present:

- selector-to-challenge flow;
- full loadout submission;
- authenticated serverless challenge storage;
- snapshot hash storage and verification;
- deterministic PvP seed;
- server-side PvP simulation;
- creator arena is selected as the shared environment;
- replay persistence and verified analytics.

Remaining:

- strict runtime validation/canonicalization at the API boundary;
- server role gating for fighter/item/arena;
- verify item and arena ownership, not only fighter ownership;
- verify or server-rebuild the team snapshot;
- cap loadout/team payload size before KV storage;
- emit the missing challenge-posted analytics event;
- remove alias-shaped fields from newly written records.

Security note:

The snapshot hash detects stored-data drift, but it does not prove the original client supplied a legitimate item, arena, team, or stat mapping. Those inputs must be validated or recomputed serverlessly.

### Task 7 — Match preview

**Status: 60% complete**

Already present:

- fighter comparison;
- stat bars and matchup summary;
- item/arena/team layer badges;
- null optional slots do not crash.

Remaining:

- show actual item and arena slot cards/portraits for both sides;
- show explicit `None` slots;
- use the same final-stat resolver as the battle engine;
- show Base / Item / Team / Arena deltas;
- ensure the displayed stats exactly match server resolution;
- handle legacy conversion through the real read path.

### Task 8 — Engine integration and deterministic seed

**Status: 55% complete**

Already present:

- seeded PRNG module;
- deterministic PvP server seed;
- deterministic AI seed;
- server-side PvP simulation;
- AI result re-simulation;
- passive and replay logs.

Remaining:

- require a seed or PRNG; remove combat `Math.random` fallbacks;
- remove the renderer’s local random simulation fallback and require precomputed logs;
- select one and only one place to apply item/team/arena layers;
- route preview and simulation through the same resolver;
- vary AI seeds per battle while storing them for replay;
- add deterministic replay tests across many runs;
- add matchup simulation tooling.

Critical current mismatch:

- the battle page pre-applies item and arena modifiers for preview;
- the AI engine receives those final stats and the item again, so item buffs can be applied twice;
- PvP applies item server-side, but `normalizeArenaStats()` emits only `{ hp: 25 }` while the engine environment path expects a biome, so the creator arena is stored but has no actual PvP biome effect;
- preview stats and resolved stats can therefore disagree.

Visual-only randomness in particle placement is acceptable. Combat randomness is not.

### Task 9 — Legacy compatibility

**Status: 25% complete**

Already present:

- `readLegacyChallenge()` converts a legacy-looking record into a loadout shape.

Remaining:

- call it from `getActiveChallenges()`, `getChallengeById()`, board rendering, and preview entry points;
- canonicalize legacy collection names through profile aliases;
- validate converted records;
- add compatibility tests;
- decide whether localStorage challenges still exist in the supported product, because current matchmaking reads serverless KV only.

At present the compatibility function appears unused, so it does not satisfy the migration requirement.

### Task 10 — Server-ready payload alignment

**Status: 75% complete, but original task is superseded**

Already active, not merely future:

- challenge endpoint;
- fight endpoint;
- replay endpoint;
- history endpoint;
- AI record endpoint;
- authentication, ownership verification, sanitization, and KV persistence.

Remaining:

- strict shared schema validation;
- a preview/final-stat endpoint only if the UI cannot safely share the pure resolver;
- canonical error objects;
- modifier/team ownership validation;
- exact parity tests between client preview and server result.

Do not add four more top-level Vercel functions. Keep actions under the existing `/api/battle?action=...` router to preserve the function budget.

---

## 5. Highest-priority correctness risks

These should be fixed before structural refactoring.

### P0 — Layer application is not single-source

AI, PvP, and preview do not apply the same layers in the same place. This can double-apply items and omit arena effects.

**Fix:** create one pure `resolveBattleLoadout(loadout, sharedArena)` function used by preview, AI, PvP, and replay verification. The core engine receives resolved fighters only.

### P0 — Optional slots and team data are not fully authoritative

The server verifies fighter ownership but currently accepts bounded item, arena, and team values supplied by the client.

**Fix:** validate roles and ownership for item/arena; verify or rebuild team rows from canonical owned NFT references. Never calculate synergy from client-provided labels alone.

### P0 — New loadouts do not follow the documented schema

The selector stores full inventory objects with `engineId`, `nftId`, `rawAttributes`, `stats`, and UI fields. The plan requires narrow `SlotTokenRef` objects.

**Fix:** canonicalize at selection time and again at the API boundary.

### P1 — Cap rules conflict

Normalizer, engine, and server sanitizer have different ceilings.

**Fix:** all three import the same caps and the same `clampCombatStats()`.

### P1 — Team snapshot implementation is effectively disconnected

The deterministic builder is not used, client/server caps differ, and several synergy lookups fail after server sanitization drops `engineId`.

**Fix:** one canonical snapshot shape and one shared passive calculator.

### P1 — Legacy compatibility is dead code

**Fix:** wire it into read boundaries or remove the legacy promise from product documentation.

### P1 — Analytics payload is incomplete

`battle_loadout_built` often sends null fighter/item/arena slugs because the inventory lacks canonical fields. Challenge-posted and finished-v2 events from the supplied plan are absent.

**Fix:** repair canonical inventory fields first, then finalize event names and payloads.

---

## 6. Revised implementation roadmap

### Phase A — Contract and authority alignment (must happen first)

**Goal:** every layer speaks the same canonical data.

Create `src/lib/battle/contracts.js` as a pure, isomorphic module:

```js
export const BATTLE_LOADOUT_SCHEMA = 'battle-loadout-v1';
export const MAX_TEAM_SNAPSHOT = 12;

// Exports:
// toSlotTokenRef(inventoryNft)
// canonicalizeLoadout(raw)
// validateLoadout(loadout)
// assertLoadout(loadout)
```

Canonical V1 shape:

```text
fighter: SlotTokenRef (required)
item: SlotTokenRef | null
arena: SlotTokenRef | null
teamSnapshot: SlotTokenRef[] (max 12)
schemaVersion: 'battle-loadout-v1'
```

`SlotTokenRef` should contain only:

```text
collectionSlug, tokenId, attributes, imageUrl
```

Computed stats, roles, names, and UI state do not belong in the persisted token reference. They are derived from the profile and metadata.

**Acceptance gate:** malformed roles, oversized teams, raw spread objects, and alias-only new writes are rejected.

### Phase B — Role and inventory correctness

1. Add exact `collectionSlug` and `tokenId` fields in `nftInventory.js`.
2. Resolve collection by contract first.
3. Enforce `v1Enabled` and role at selection.
4. Remove connected-wallet trial fallback.
5. Add explicit no-fighter state.
6. Enforce the same roles in challenge/fight serverless handlers.
7. Verify optional-slot ownership.

**Acceptance gate:** an item cannot enter a fighter slot through UI or a crafted API request.

### Phase C — One loadout resolver

Create `src/lib/battle/loadoutResolver.js`:

```text
resolveBaseFighter(fighterRef)
resolveItem(itemRef)
resolveArena(arenaRef)
resolveTeam(teamSnapshot)
resolveBattleLoadout(loadout, sharedArena)
```

Strict order:

1. base fighter → cap;
2. item → cap;
3. team → cap;
4. shared arena → cap;
5. final canonical stats → cap.

Remove layer math from `battle.js` and from the core engine. Preview and serverless simulation call the same resolver.

**Acceptance gate:** preview stats equal simulation start stats byte-for-byte.

### Phase D — Deterministic team snapshot

1. settle max size at 12;
2. pin equipped slots;
3. deterministic role/slug/token sorting;
4. canonical passive rule table;
5. server verification/rebuild;
6. snapshot hash over canonical loadout + resolved base stats;
7. display the snapshot strip in the selector.

**Acceptance gate:** same inventory + selections produce identical serialized loadout and hash in browser and Node.

### Phase E — Deterministic engine contract

1. make `simulateBattle()` require a PRNG;
2. remove every combat fallback to `Math.random`;
3. keep visual VFX randomness isolated in renderer-only helpers;
4. require precomputed logs in renderer;
5. generate a unique stored AI seed for each match;
6. use shared seed generation for PvP;
7. verify replay parity.

**Acceptance gate:** 100 repeated runs with the same seed/loadouts produce identical logs and winner.

### Phase F — Balance and metadata mapping

Before copying the supplied mapping table verbatim:

1. inspect real OpenSea trait names and values for all six launch collections;
2. confirm Neon Rune power and Mini Worlds biome are available in metadata or define the on-chain read;
3. implement mappings in profiles only;
4. run at least 1,000 battles per ordered fighter matchup with representative item/arena combinations;
5. publish win rate, round count, crit, dodge, sustain, and timeout reports;
6. tune caps based on evidence.

**Acceptance gate:** no fighter collection exceeds 58% aggregate matchup win rate and mean rounds stay in the accepted window.

### Phase G — UX, compatibility, and analytics

1. full layer-delta preview;
2. explicit optional/none states;
3. wire legacy conversion at all read boundaries;
4. finalize analytics events:
   - `battle_loadout_built`;
   - `battle_challenge_posted_v2`;
   - `battle_started_v2`;
   - `battle_finished_v2` or retain `battle_result_v2`, but not both names for the same meaning;
5. include canonical slugs, slot flags, team size, snapshot hash, seed/battle ID, rounds, crits, and dodges.

**Acceptance gate:** analytics payloads contain no null slugs for valid loadouts.

---

## 7. Refactor plan after correctness gates

The current files should be isolated, but only after Phases A–E have tests.

### Shared battle domain

```text
src/lib/battle/
├── contracts.js             # schema, canonicalization, runtime validation
├── collectionProfiles.js    # roles and canonical mappings only
├── balanceConfig.js         # all caps/tuning constants
├── metadataNormalizer.js    # token metadata -> base/item/arena data
├── loadoutResolver.js       # applies layers exactly once
├── teamSnapshot.js          # deterministic team + passives
├── prng.js                  # required deterministic randomness
├── engine.js                # pure combat; no DOM, storage, fetch, Math.random
└── snapshot.js              # canonical hashing
```

### Client battle services

```text
src/lib/battleClient/
├── auth.js                  # SIWE/SIWF token acquisition
├── challengeApi.js          # list/post/accept
├── replayApi.js             # history/replay
├── inventory.js             # OpenSea inventory -> canonical inventory NFT
└── loadoutSession.js        # safe storage/session handling
```

### UI

```text
src/components/game/
├── LoadoutBuilderModal.js
├── LoadoutSlots.js
├── StatLayerPreview.js
├── TeamSnapshotStrip.js
├── MatchPreviewModal.js
└── ChallengeBoard.js
```

UI components render and emit actions. They do not calculate stats, roles, hashes, ownership, or battle outcomes.

### Serverless battle adapters

Keep the existing function budget:

```text
api/battle.js
api/_lib/battle/
├── challenge.js
├── fight.js
├── record.js
├── history.js
├── replay.js
├── ownership.js
├── validateLoadout.js       # wraps shared contracts
└── sanitize.js              # defense-in-depth only
```

The shared domain remains free of `window`, DOM, storage, `import.meta.env`, and network calls so both browser and Vercel Node can import it safely.

---

## 8. Required tests before V1 is called complete

### Pure unit tests

- all launch slugs resolve to the correct role;
- aliases canonicalize to the correct slug;
- unknown collection returns `UNSUPPORTED`;
- canonical loadout strips extra/raw fields;
- invalid slot roles are rejected;
- base traits map correctly;
- every layer clamps to the shared envelope;
- item/team/arena scales and order are exact;
- snapshot pinning/sorting/cap are deterministic;
- same canonical loadout creates the same hash;
- engine requires a PRNG;
- same seed creates identical full logs;
- legacy record conversion is valid and wired.

### Serverless integration tests

- crafted item-in-fighter request is rejected;
- unowned fighter/item/arena is rejected;
- oversized team is rejected, not silently trusted;
- creator arena applies to both PvP sides;
- challenger arena cannot override it;
- preview-resolved starting stats equal fight starting stats;
- duplicate/consumed challenge cannot be fought;
- AI claim mismatching server simulation is rejected.

### Balance simulation

Add a script such as:

```text
scripts/simulate-battle-balance.mjs
```

Output machine-readable JSON plus a readable table for:

- matchup win rates;
- average/p50/p95 rounds;
- timeout rate;
- crit/dodge frequency;
- item advantage;
- arena advantage;
- team advantage.

### UI scenarios

Use Playwright for the loadout modal and preview:

- no fighter blocking message;
- connected wallet never receives trial fighters;
- role tabs only show valid assets;
- optional slots toggle on/off;
- team strip is stable;
- preview shows exact final stats;
- legacy challenge displays `None` safely.

---

## 9. Definition of done

V1 is complete only when all of the following are true:

- one canonical runtime-validated loadout contract is used everywhere;
- every new loadout uses canonical slug and string token ID;
- role gates are enforced in UI and serverless handlers;
- fighter, item, arena, and team claims are verified or recomputed;
- item/team/arena layers are applied exactly once;
- preview and battle starting stats match exactly;
- team size and ordering are identical client/server;
- core combat contains no `Math.random` fallback;
- replay logs are deterministic for a fixed seed;
- arena effects work in actual PvP, not only preview;
- the supplied unit/integration tests exist and pass;
- balance simulation meets agreed thresholds;
- large-file refactoring preserves those tests without changing behavior.

---

## 10. Recommended next PR sequence

| PR | Scope | Size | Dependency |
|---|---|---:|---|
| 1 | Shared `contracts.js`, canonical inventory fields, strict role validation | M | none |
| 2 | Team snapshot integration and server verification | M | PR 1 |
| 3 | Single loadout resolver; remove double/missing layer application | L | PR 1–2 |
| 4 | Deterministic engine contract and replay tests | M | PR 3 |
| 5 | Canonical six-collection mappings + balance simulator | L | PR 3–4 |
| 6 | Loadout/preview UX completion + legacy read wiring + analytics payloads | M | PR 1–5 |
| 7 | Structural file split/refactor with no behavior changes | M | all correctness PRs |

## Final recommendation

Treat the current implementation as a strong V2 prototype with serverless integrity work already beyond the original plan. Do not rebuild it from scratch and do not revert to client authority. Complete the missing canonical contracts, validation, deterministic snapshot/layer pipeline, and tests first. Once those behaviors are locked by tests, the proposed feature/file isolation refactor becomes low-risk and worthwhile.
