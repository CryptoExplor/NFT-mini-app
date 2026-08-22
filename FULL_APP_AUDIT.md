# FULL APPLICATION AUDIT — bugs, errors & fixes

**Date:** 2026-08-22
**Scope:** the entire application, not just analytics —
entry/bootstrap (`src/main.js`, `src/lib/router.js`, `src/state.js`), wallet & auth
(`src/wallet.js`, `src/farcaster.js`, `api/_lib/auth/*`, `api/_lib/authMiddleware.js`),
mint flow (`src/pages/mint.js`, `src/lib/mintHelpers.js`, `src/lib/contractActions.js`),
battle/arena (`src/pages/battle.js`, `src/lib/game/*`, `src/lib/battle/*`,
`api/_lib/battle/*`), gallery/home, shared utils, all serverless routes,
PWA layer (`public/sw.js`, manifest), build/deploy config (`vite.config.js`,
`vercel.json`, `index.html`) and the collection/ABI configs.

**Method:** file-by-file read of every module in the request path, plus:
`node --check` on every JS file, `npm run build`, a served-build smoke test of
all routes, targeted runtime experiments (engine determinism, sanitiser
round-trips, ISO-week/TZ behaviour), an asset-reference existence sweep, and a
new automated test suite (`npm test` → 45 checks).

The analytics subsystem was audited and fixed separately — see
[`ANALYTICS_AUDIT.md`](./ANALYTICS_AUDIT.md). This document covers everything else,
and **every issue listed here is now fixed** unless explicitly marked
*Recommendation*.

Severity: **P0** exploitable / data-destroying · **P1** broken behaviour or
security weakness · **P2** robustness, correctness-in-edge-cases, hygiene.

---

## P0 — Anyone could mint unlimited arena wins

**Where:** `api/track.js` → `api/_lib/events.js:handleBattleResultV2`

The arena ladder, battle points and rank were written from a *self-reported*
event. A single authenticated request was enough to become #1:

```bash
curl -X POST /api/track -H 'Authorization: Bearer <any valid JWT>' \
     -d '{"type":"battle_result_v2","wallet":"0x…","metadata":{"won":true}}'
```

Nothing tied that claim to a battle that ever happened. The rate limiter
(20/min) was the only bound — ~28 800 fabricated wins per day per wallet.

**Fix** — wins are now only counted for a battle the *server* produced and stored:

* new `api/_lib/battle/verifyClaim.js`:
  1. the event must carry a `battleId` that exists in KV (`battle:<sha256>`),
  2. the claiming wallet must be a participant of that record,
  3. **the outcome is read from the record** — a lying `won:true` is overwritten
     with the truth,
  4. `(battleId, wallet)` is reserved with `SET NX`, so a battle can never be
     counted twice (no replay farming).
* `handleBattleResultV2` only writes wallet-level wins/points/ladder when
  `metadata.ladderVerified === true`.
* `fight.js` (server-simulated PvP) passes `ladderVerified: true` directly and
  reserves both participants' claim keys.
* Unverifiable claims return `202 {counted:false, reason}` instead of being
  silently trusted — legitimate clients simply retry-free continue, cheats never land.

## P0 — PvP fights were decided by client-supplied stats

**Where:** `api/_lib/battle/fight.js`

The defender's `defenderLoadout.fighter.stats` went straight into the combat
simulation with **no validation at all** (the attacker's snapshot hash only
proved the numbers had not changed *since posting*, not that they were sane).
`{"hp":1e9,"atk":1e9}` won every PvP match, forever.

**Fix** — new `api/_lib/battle/sanitize.js`, applied to *both* sides before the
simulation: every stat is coerced to a finite number and clamped into the same
`STAT_FLOORS…STAT_CAPS` envelope the client normalizer uses; item/arena
modifiers are bounded differentials; team snapshots are capped at 12 entries.
Verified by test: a legitimate fighter passes through **unchanged**, a crafted
one is clamped to the cap.

## P0 — AI battle results were taken on trust (and could bloat storage)

**Where:** `api/_lib/battle/record.js`

`POST /api/battle?action=record` stored whatever `result.winnerSide` the client
sent, together with an **unbounded** `logs` array (a single request could push
megabytes into KV, twice, plus into two 50-entry history lists).

**Fix** — the server now re-runs the battle itself:

* stats/modifiers sanitised, `aiWinRate` clamped, `seed` length-checked,
* the deterministic V2 engine re-simulates the fight and a mismatching claim is
  rejected with `422 RESULT_MISMATCH`,
* the **server's own** logs are stored, capped at 200 sanitised entries,
* 40 records/hour/wallet rate limit, returning `429` with `Retry-After`.

Determinism (the property this relies on) is asserted in the test suite,
including across a JSON round-trip, so honest results always verify.
The client (`matchmaking.js` / `battle.js`) now sends `aiWinRate` so the
reproduction is exact.

---

## P1 — Broken behaviour

| # | Issue | Detail | Fix |
|---|---|---|---|
| 1 | **Missing `/placeholder.png` caused an image-error loop** | 4 components used `onerror="this.src='/placeholder.png'"` but the file did not exist; the fallback 404s, fires `onerror` again, reassigns `src`, and loops — a network-request storm on any broken NFT image | Added a themed `public/placeholder.png` **and** `this.onerror=null` before the reassignment in all 4 places |
| 2 | **Service worker offline fallback always threw** | `return caches.match('/offline.html') \|\| new Response(...)` — `caches.match()` returns a *Promise* (always truthy), so the fallback resolved to `undefined` and `respondWith()` threw; `/offline.html` did not exist either | Awaited properly, falls back to the cached `index.html`, then to a real 503 `Response` |
| 3 | **Service worker cached the whole internet** | `networkFirst` cached *every* response including cross-origin/opaque ones (RPC, OpenSea, IPFS, WalletConnect) with no size bound | Only same-origin `basic` responses are cached, dynamic cache trimmed to 60 entries (FIFO), cache version bumped to `v2` so the broken v1 caches are evicted |
| 4 | **`sw.js` message handler crashed** | `event.data.action` throws a TypeError for any message with `null`/non-object data (DevTools, other libs) | Type-guarded, `event.ports?.[0]?` optional |
| 5 | **A single missing asset broke SW install** | `cache.addAll()` rejects atomically | Per-asset `cache.add().catch()` |
| 6 | **Unnamed ABI inputs crashed the mint** | `getMintArgs` did `abiItem.inputs[0].name.toLowerCase()`; ABIs frequently have `"name": ""` or no `name` key → TypeError *before* any wallet request | Null-safe read with `String(input.name \|\| '')` |
| 7 | **`e.message.includes()` inside catch blocks** | Provider errors without a `message` threw a *second* error inside the error handler, hiding the real failure | Central `isUserRejection()` helper (`name`, EIP-1193 `code 4001`, `shortMessage`/`message`) |
| 8 | **Fractional burn amounts crashed** | `BigInt(stage.amount) * 10n ** decimals` throws `SyntaxError` for `"0.5"` | `parseUnits(amount, decimals)` with a friendly error; balance message now respects token decimals |
| 9 | **Reverted transactions were reported as successful mints** | `mint()` never checked `receipt.status` | Throws `Transaction reverted on-chain` when status ≠ success |
| 10 | **`tx_sent` was tracked after confirmation** | The funnel step fired only on success, so it could never exceed `mint_success` and every failed tx was invisible between `mint_click` and `mint_success` | `mint()` takes an `onHash` hook, fired at broadcast time; the page reports `tx_sent` there (and shows "waiting for confirmation") |
| 11 | **Dominance pill always read 0 points** | `arenaRenderer` read `arena_points_<addr>` while `points.js` writes `arena_points_v2_<addr>` | Uses `getPlayerPoints()` |
| 12 | **`localStorage` access crashed the app** | ~30 unguarded `localStorage` + `JSON.parse` call sites across the game modules. Safari Private Mode / partitioned webviews throw on *access*; a corrupt value throws on parse; quota exhaustion throws on write | New `src/utils/storage.js` (availability probe, in-memory fallback, non-throwing `getJSON`/`setJSON`, `pruneKeys`), adopted across points, conversion, tournament, dailyBoss, distributionEngine, BattleLeaderboard, ChallengeBoard and mintHelpers |
| 13 | **Unbounded storage growth → guaranteed quota crash** | `addPlayerPoints` wrote a `reward_claimed_<battleId>` key per battle and never removed any | Pruned to the most recent 300 markers |
| 14 | **Duplicate wallet watchers** | `initWallet()` reassigned `currentUnwatch` without unsubscribing, so every re-init multiplied `WALLET_UPDATE` events (and the re-renders they trigger) | Unsubscribes first; added `stopWalletWatcher()` |
| 15 | **Two parallel silent connects in mini-apps** | `initWallet()` auto-connects on reconnect failure *and* `main.js` called `connectMiniAppWalletSilently()` again | `main.js` only connects when still disconnected |
| 16 | **Battle JWT was invisible to the rest of the app** | `matchmaking.js` kept the token in a module variable, so `lib/api.js` calls fell back to the cookie — which third-party-cookie blocking (Safari, in-app webviews) drops | The battle token is now shared via `setAuthToken()`; `clearBattleAuth()` clears both |
| 17 | **Unknown `/api/battle` & `/api/auth` actions answered without CORS** | The 404 branch ran before any sub-handler set headers, and preflight for a bad action hung | `setCors` + `OPTIONS` handling at the router level |
| 18 | **XSS hardening on third-party metadata** | NFT names/traits/ids/image URLs from OpenSea were interpolated raw into `innerHTML` in the loadout selector, arena combat log, tournament board and the gallery sidebar (`data-collection="${slug}"`) | All escaped with `escapeHtml`; image URLs run through `sanitizeUrl()` with a placeholder fallback |
| 19 | **Vite blocked tunnelled/preview hosts** | Default `allowedHosts` rejects unknown `Host` headers → 403 on any remote preview or device test of the mini app | `allowedHosts: true` for `server` and `preview` |
| 20 | **Router swallowed external `data-link` links** | Any absolute/`mailto:`/`tel:` href was hijacked into `pushState` and 404'd inside the SPA; an unmatched route with no `/` handler left a blank page | Only internal links are intercepted; a real "Page not found" view is rendered as a last resort |

---

## P2 — Robustness, correctness & hygiene (all fixed)

| # | Area | Issue → Fix |
|---|---|---|
| 1 | `index.html` | `<link rel="icon" type="image/svg+xml" href="/favicon.ico">` declared an ICO as SVG → split into a correct `.ico` + `icon.svg` pair |
| 2 | `site.webmanifest` | No `id`/`start_url`/`scope`/`description`, `theme_color` (`#ffffff`) contradicted the app's `#0f172a`, no maskable icon → completed; app is now installable without warnings |
| 3 | `vercel.json` | Hashed build assets had no cache policy while `sw.js` could be cached → `immutable` 1-year caching for `/assets/*`, `must-revalidate` for `/sw.js` |
| 4 | `sw.js` push | `badge: '/badge.png'` did not exist → points at the shipped favicon |
| 5 | `generate-post.js` | Rate-limit key used the raw `x-forwarded-for` chain (spoofable) → first-hop IP, matching `/api/track` |
| 6 | `mintHelpers.verifyAllowlist` | Merkle sibling ordering used locale-sensitive `localeCompare` → byte-wise `<` comparison |
| 7 | `mint.js` | `mintStatus.textContent` was written before checking the element exists (TypeError if the DOM changed) → all writes guarded |
| 8 | `points.js` | `parseInt` of a corrupt value produced `NaN` and poisoned the score → `Number.isFinite` guards on read and on delta |
| 9 | `distributionEngine.js` | `JSON.parse(stored)` on a corrupt growth-cycle value threw → typed validation via `storage.getJSON` |
| 10 | `chain.js` / `opensea.js` | Comment claimed the RPC key is "never in the bundle" — **every `VITE_*` value is inlined into the client bundle** → corrected to an explicit warning (see Recommendations) |

---

## Verified-good (no change needed)

* **Contract action layer** (`contractActions.js`) — action allow/deny lists, address
  validation, bool/uint coercion, ERC-20 allowance handling with optional
  reset-to-zero, and payable-value parsing are all sound.
* **SIWE/JWT auth** — nonce is 16 random bytes, single-use (deleted on verify),
  5-minute TTL; domain/URI checks with a deliberate, nonce-bound exception for
  Farcaster relay sign-in; HS256 with a required secret; cookie attributes adapt
  to localhost vs production.
* **Combat engine** — bounded by `MAX_ROUNDS`, stat clamping between layers, and
  verified deterministic for a given seed (now relied on for server verification).
* **Collection loader** — validates required fields, stage types and contract
  action shapes at load time, and rejects duplicate slugs during index generation.
* **Gallery NFT cards** — already escaped metadata (`esc()`) and `encodeURI`'d images.
* **CSV export / admin** — hardened in the analytics pass (formula injection,
  auth bypass, escaping).

---

## Recommendations (deliberately not auto-applied)

1. **Move the OpenSea key server-side.** `VITE_OPENSEA_API_KEY` is compiled into
   the public bundle. Either keep it domain-restricted and treat it as public
   (current state, now documented), or add an `/api/nfts` proxy that holds the
   key. Same reasoning for `VITE_BASE_RPC_URL` if the RPC provider issues
   secret URLs.
2. **Verify NFT ownership for battles.** Stats are now clamped, but a player can
   still fight with a fighter they do not own. A `balanceOf`/`ownerOf` check at
   challenge-post time (cached per wallet+token) would close this. It needs a
   slug → contract map for the non-first-party battle collections, so it is a
   product decision rather than a bug fix.
3. **`fetchNextTokenId` picks random token ids** (`Math.random()` inside
   `tokenIdRange`, or a random id up to `maxSupply` when `totalMinted` reverts).
   For contracts where the caller chooses the id this will collide with an
   already-minted token and revert. Contract-specific — worth confirming per
   collection.
4. **`listActiveChallenges()` does one `EXISTS` per challenge** (O(n) KV commands
   per call, and it is called on every challenge POST). Store the TTL inside the
   hash value instead.
5. **Add a CSP header.** `vercel.json` sets nosniff/HSTS/Referrer-Policy but no
   `Content-Security-Policy`; the app is inline-style heavy, so this needs a
   careful rollout (`report-only` first).

---

## Verification

```
npm test          → 45 passing (0 failing)
npm run build     → ✓ 3307 modules, no errors
served-build smoke test → / /battle /analytics /gallery /mint/:slug
                          /placeholder.png /sw.js /site.webmanifest all 200
```

New tests added by this audit:

* `api/_lib/battle/integrity.test.js` — claim verification (no battleId, unknown
  battle, non-participant, lying `won` flag, double counting), stat clamping
  (god-mode, NaN/negative, modifier bounds, team/log caps, AI win-rate range),
  legitimate-fighter pass-through, honest-vs-forged record verification and
  engine determinism across JSON round-trips.
* Extended `api/_lib/events.test.js` — an unverified battle claim must not touch
  the ladder, points or the profile.

Plus the suites from the analytics pass (`events`, `leaderboard`, `cors`), all
still green.
