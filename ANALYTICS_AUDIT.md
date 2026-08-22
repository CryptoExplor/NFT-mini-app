# Analytics Subsystem Audit — Bugs & Errors

**Scope:** the analytics/telemetry stack end‑to‑end —
`api/track.js`, `api/_lib/events.js`, `api/_lib/kv.js`, `api/leaderboard.js`, `api/user.js`,
`api/admin.js`, `api/export.js`, `api/_lib/battle/{record,fight}.js`, `src/lib/api.js`,
`src/pages/analytics.js`, `src/components/analytics/*`, `src/lib/analytics/adminService.js`.

**Method:** static read of every file in the data path + targeted runtime checks of the pure
helpers (`getWeekNumber`, `getUTCDate`, `getYesterdayDate`) and a syntax pass (`node --check`)
over all API and analytics modules. No syntax errors were found; every finding below is a
logic, correctness, security or data‑integrity issue.

Legend: **P0** = wrong data users see / broken feature, **P1** = meaningful correctness or
security issue, **P2** = robustness / hygiene.

---

## P0 — Arena wins are double counted on the global ladder

* `src/pages/battle.js:287` → `recordAiBattle(...)` → `api/_lib/battle/record.js:87`
  `incrementBattleWins(auth.address)` → `ZINCRBY leaderboard:battle_wins:all_time 1`
* `src/pages/battle.js:391` → `trackBattleResult(...)` → `api/_lib/events.js:196`
  `ZINCRBY leaderboard:battle_wins:all_time 1` (same wallet, same battle)

Every **won AI battle increments the ladder twice**, while `user:<w>:profile.battle_wins`
(events.js:195) is incremented **once**. Consequences:

* Arena Ladder score ≈ 2× the "Wins" number shown in *Your Arena Stats*
  (`WalletInsights.js` reads the profile, `MintLeaderboard.js` reads the zset).
* `rankings.battleWins.score` (`api/user.js`) disagrees with `profile.battleWins`.
* "Battle Points (est.) = wins × 5" in the UI never matches the `battle_points`
  leaderboard (which is `battle_wins` zset × 5, i.e. double).

**Fix:** pick one writer. Drop `incrementBattleWins` from `record.js` (the `battle_result_v2`
event is the canonical path), or stop the client emitting `battle_result_v2` for AI wins.

---

## P0 — Global battle win‑rate is structurally understated (PvP)

`api/_lib/battle/fight.js:174` and `:190` emit two `battle_result_v2` events; the mirrored
attacker event carries `affectsGlobal: false`. In `handleBattleResultV2`
(`api/_lib/events.js:175‑181`) *everything* global — including
`stats:global.battle_wins` — is inside `if (affectsGlobal)`.

So for PvP, `battle_total` is counted once (correct) but a win is only recorded globally when
the **defender** wins. Every attacker victory increments `battle_total` and no win.
`stats.battleWinRate` on the Arena tab (`api/leaderboard.js:toGlobalStats`) is therefore biased
downward and drifts further the more PvP is played.

**Fix:** increment `stats:global.battle_wins` exactly once per match, independent of the
`affectsGlobal` flag (e.g. add `countsGlobalWin` to the metadata, or have the fight handler
write the global win counter itself).

---

## P0 — Auth‑gated events are sent without credentials → silent 401s

`api/track.js:13‑21` requires a JWT for `battle_result_v2`, `battle_won`, `mint_success`,
`social_share`. But the client sender (`src/lib/api.js:46‑50`) does:

```js
fetch(`${API_BASE}/api/track`, { method:'POST', headers:{'Content-Type':'application/json'}, body })
  .catch(err => console.warn('Track failed:', err));
```

* no `Authorization: Bearer <token>` even though `getAuthToken()` holds one;
* no `credentials: 'include'`, so the `jwt` cookie is **not** sent when `VITE_API_URL`
  points at another origin;
* the cookie is `SameSite=None; Secure` (`api/_lib/auth/verify.js`) — third‑party‑cookie
  blocking (Safari, in‑app webviews) kills it even when the header is right;
* the response is never inspected, so a 401/403/429 is invisible.

Result: mints, shares and battle results can be silently dropped — the exact events the
whole dashboard is built on. Guest battles are dropped by design (no wallet ⇒ 401), so
`battle_total` never includes guest play even though the UI advertises guest mode.

**Fix:** in `trackEvent`, attach `Authorization` from `getAuthToken()` **and**
`credentials: 'include'`; log/report non‑2xx; decide explicitly whether guest battles should
be recorded as anonymous global events.

---

## P0 — Session expiry check is inverted (30 s *grace after* expiry)

`src/lib/api.js:375‑379`

```js
return expiresAtMs < (Date.now() - 30_000);   // stays "valid" 30s past expiry
```

The comment says "30 s buffer to avoid edge‑case races", but the sign makes the token count as
valid for 30 s *after* it expired, instead of expiring 30 s early. Admin calls made in that
window fail server‑side with 403 and the panel reports "session expired" instead of
refreshing pre‑emptively. Should be `expiresAtMs < Date.now() + 30_000`.

---

## P1 — Weekly leaderboards are unreachable from the API

Writers use `leaderboard:<type>:week:<YYYY-Www>`
(`events.js:139,162,197,269`), but `api/leaderboard.js:181‑195` builds
`leaderboard:${type}:${period}` — i.e. `?period=week` reads
`leaderboard:mints:week`, a key that never exists, and `?type=points&period=week` reads
`leaderboard:points:week:week`. Only `period=all_time` works. Weekly boards are written on
every event (and TTL'd on every event, `events.js:576‑578`) but can never be displayed.

**Fix:** map `period` → the ISO week key with the shared `getWeekNumber()` helper, or reject
unsupported periods explicitly instead of silently returning an empty board.

---

## P1 — `getBattleLeaderboard()` in `api/_lib/kv.js:111‑135` parses the wrong shape

`redis.zrange(..., { withScores: true })` returns a **flat** array
`[member, score, member, score, …]` — that is exactly how `api/leaderboard.js:formatLeaderboard`
and `api/admin.js:formatLeaderboard` decode it. `getBattleLeaderboard` instead expects objects:

```js
const address = item?.member || item;      // → the score string on odd indexes
const wins    = item?.score !== undefined ? item.score : 0;   // → always 0
```

Every entry would come back with `wins: 0` and every second "address" would be a numeric
string. The function is currently unused (only `incrementBattleWins` is imported), so it is a
landmine rather than a live defect — but it will produce garbage the moment it is wired up.

---

## P1 — Rate‑limit rejection surfaces as HTTP 500

`checkRateLimit` throws a plain `Error('Rate limit exceeded')` (`events.js:437`) and
`api/track.js:81` calls it inside the generic `try`, so the caller gets
`500 {"error":"Failed to track event"}` instead of `429`. Clients cannot back off, and real
server faults are indistinguishable from throttling in logs/monitoring.

---

## P1 — `getWeekNumber()` uses local time while the rest of the pipeline uses UTC

`api/_lib/events.js:51‑58` reads `date.getFullYear()/getMonth()/getDate()` (local) whereas
`getUTCDate()` (line 61) is UTC. Verified:

```
TZ=UTC              getWeekNumber(2026-08-24T02:00Z) → 2026-W35
TZ=America/New_York getWeekNumber(2026-08-24T02:00Z) → 2026-W34
```

On Vercel (UTC) this is latent, but any non‑UTC runtime (local `vercel dev`, self‑host,
container with a TZ set) writes points into the wrong week bucket and TTLs a different key
than it increments. Use `getUTCFullYear/getUTCMonth/getUTCDate`.

---

## P1 — Retention windows in `api/admin.js:103‑105` are computed in local time

```js
const d1 = new Date(date); d1.setDate(d1.getDate() + 1);
```

`new Date('2026-08-22')` is parsed as UTC midnight, then `setDate/getDate` operate in local
time. West‑of‑UTC runtimes shift the day boundary and the code then intersects
`cohort:<date>` with `active:<wrong-day>` — Day‑1/7/30 retention silently off by one day.
Use `setUTCDate/getUTCDate` (as `api/leaderboard.js:getUtcDayOffset` correctly does).

---

## P1 — `/api/user` ignores the requested wallet when a JWT is present

`api/user.js:19`

```js
const normalizedWallet = String(auth?.wallet || requestedWallet || '').toLowerCase();
```

The authenticated wallet **overrides** `?wallet=`, so a signed‑in user inspecting another
address gets their own stats back under someone else's address. Conversely the endpoint is
fully public for unauthenticated callers (`allowQueryFallback: true`) and returns the whole
journey (tx hashes, timings) for any address — the `src/lib/api.js` doc comment
("private – own wallet only") is wrong. Pick one model: public read (drop the auth override)
or private read (reject mismatches with 403).

Related: this **GET writes to KV** (`api/user.js:73‑78` creates `first_seen`/`last_active`),
so anyone can mint profile hashes for arbitrary addresses, and the response is CDN‑cached for
45 s (`s-maxage=45`) — the write happens only on the cache‑miss request.

---

## P1 — Duplicate event listeners accumulate on the collection route

`bindMetricTabs()` (`src/pages/analytics.js:319`) `addEventListener`s to every
`[data-analytics-metric]` button and is re‑invoked at lines 166, 242, 287, 305. On the
collection route the metric tabs live in the **header** (line 450), which is *not* re‑rendered
by `updateCollectionMetric()`. Each metric switch therefore adds another listener to the same
surviving DOM nodes: click #n fires `switchMetric` *n* times → n parallel `/api/leaderboard`
requests and n re‑renders.

**Fix:** re‑render the tab strip together with the content, or use a single delegated
`document` listener (as `bindCollectionCardNavigation` already does), or set `onclick`.

---

## P1 — CORS allowlist likely excludes the real deploy origins

`api/_lib/cors.js:19‑25` hard‑codes `https://base-mintapp.vercel.app` + localhost. Any Vercel
preview deployment, custom domain, or the Farcaster mini‑app host will get the production
origin echoed back and the browser blocks the credentialed request — analytics simply stops on
those builds, silently (see the swallowed `.catch` above). Make the allowlist configurable via
env (`ALLOWED_ORIGINS`) and include preview domains.

---

## P1 — Funnel percentages are event counts, not user counts

`api/leaderboard.js:buildFunnel` divides raw `funnel:mint` hash counters, which are incremented
once **per event** (`events.js:566`), not per unique wallet. `collection_view` is also placed
*after* `wallet_connect` in the step order while users normally browse before connecting.
Consequences visible in the UI (`ConversionFunnel.js`): step conversion can exceed 100 %,
the label "wallets to success" on the Analytics page is factually wrong (it is
`mint_success events / page_view events`), and `mint_click` is deduped client side
(`api/js: shouldThrottle`, 30 s) while `mint_success` is not — mixing deduped and non‑deduped
counters in the same ratio.

**Fix:** either track per‑step unique wallets (e.g. HyperLogLog / a set per step per day) or
relabel the metric honestly as "events".

---

## P2 — Assorted correctness / hygiene issues

| # | Location | Issue |
|---|---|---|
| 1 | `src/lib/api.js:151‑157` | `trackShare` sends `platform` as a **top‑level** field; `api/track.js:34‑46` destructures a fixed allow‑list and drops it. Share‑platform breakdown is unrecoverable. Move it into `metadata`. |
| 2 | `api/track.js:88‑101` | `price` and `gas` are client‑supplied and unvalidated (no `Number.isFinite`, no upper bound, negatives allowed). They feed `stats:global.total_volume`, the volume leaderboard and mint points — an authenticated user can inflate volume/points arbitrarily. Cap/validate, or derive value from the verified receipt. |
| 3 | `api/_lib/events.js:224‑229` | A replayed `mint_success` (already‑processed txHash) returns early **after** `stats:global.total_events` and `daily:stats:<d>` were already queued, and the handler still returns `success: true`. Duplicate mints inflate the daily/event counters. |
| 4 | `api/_lib/battle/fight.js:174,190` | `processEvent(...)` is not awaited in a serverless handler; the response returns immediately and the runtime may freeze the instance before the KV pipeline flushes → randomly missing PvP analytics. |
| 5 | `src/pages/battle.js:391` | `battleId: persistedBattleId || null` — `persistedBattleId` is assigned inside a promise (`:287`) that has usually **not** resolved yet, so live‑feed entries lose their "Watch replay" link. Await `persistedBattlePromise` before emitting. |
| 6 | `api/_lib/events.js:125` | `user:<w>:first_connect` is written with no TTL and never read anywhere. Unbounded key growth. |
| 7 | `api/_lib/events.js:576‑578` | Three `EXPIRE` calls on weekly keys are issued on **every** event, including events that never touch those keys (no‑ops against non‑existent keys). ~3 wasted commands/event against the stated command‑budget goal. |
| 8 | `api/_lib/events.js:186,196` | `battle_result_v2` awards 5 points to `leaderboard:points` but **not** to `leaderboard:points:week:<w>`, unlike every other point award (`:106‑108`, `:127‑128`, `:302‑304`). Weekly points board under‑reports battle players. |
| 9 | `api/leaderboard.js:generateSocialProof` | Hard‑codes "leading with N **mints**" regardless of `typeKey`; on the arena/points surfaces the marquee states a false unit. |
| 10 | `api/leaderboard.js:ensureDailySnapshot` | Snapshot is only written when someone loads the page, and `getRankChange` returns `'new'` for anyone missing from yesterday's snapshot — so every row shows the amber **NEW** badge until the endpoint has been hit on two consecutive days. Consider a cron. |
| 11 | `api/admin.js:57‑63` | `rank !== null ? rank + 1 : 'Unranked'` — if the driver returns `undefined` (not `null`) for a missing member, this yields `NaN`. `api/user.js` repeats the pattern in 5 places. Use `rank == null`. |
| 12 | `api/admin.js:16‑22` | `NODE_ENV === 'development'` bypasses admin auth entirely; `vercel dev` sets that value, so the full admin surface (all wallets, journeys, cohorts) is unauthenticated locally. Gate on an explicit `ALLOW_INSECURE_ADMIN` flag instead. |
| 13 | `src/components/analytics/AdminPanel.js:19` | `adminWallets.length === 0` (i.e. `VITE_ADMIN_WALLETS` unset) shows the admin panel to **every** connected wallet. Server-side auth still holds, but it leaks the surface; default should be deny. |
| 14 | `src/components/analytics/AdminPanel.js:186,221,247,...` | `data.error`, `u.displayName`, funnel keys/values are interpolated into `innerHTML` **unescaped**, unlike the rest of the analytics components. `display_name` is user‑controlled (written from `wallet_connect` metadata, `events.js:117`), so this becomes stored XSS the moment the admin leaderboard starts hydrating display names. Run everything through `escapeHtml`. |
| 15 | `api/export.js:100‑140` | `streamCollectionsCSV` reads `keys.length` without a null guard, and `streamMintsCSV` paginates `log:mints` with a snapshot `llen` while the list is being LPUSHed concurrently → rows can be duplicated/skipped mid‑export. |
| 16 | `api/export.js:9‑13` | `csvSafe` quotes and escapes but does **not** neutralise leading `=`, `+`, `-`, `@` — the docblock claims "prevent formula injection". Collection slugs and display names reach the CSV. Prefix with `'` or a space. |
| 17 | `src/components/analytics/CollectionPerformance.js:12` | `maxViews` is recomputed with `Math.max(...collections.map(...))` inside the `.map` (O(n²) + spread on a potentially large array). Hoist it. |
| 18 | `src/components/analytics/BattleOverview.js:134` | `normalizeSyncedBattleRecord` assumes the viewer is P2 whenever they are not P1; a record where the wallet is neither side is silently attributed to the viewer (win/loss stats poisoned if history ever returns a foreign record). |
| 19 | `src/pages/analytics.js:258` | `switchMetric` accepts `'points'` for the arena view, but `getArenaMetricTabs()` never renders it — dead branch that would query `leaderboard:points` while the label says "Live ladder". |
| 20 | `api/track.js:79` | Rate limiting keys on the raw `x-forwarded-for` header (comma‑joined chain, spoofable when not behind the proxy). Use the first hop / Vercel's `x-real-ip`. |

---

## Suggested fix order

1. **Correctness of the headline numbers** — #P0‑1 (double‑counted wins), #P0‑2 (global win rate), #P1 weekly keys. These make the ladder and the Arena tab wrong today.
2. **Delivery of events** — #P0‑3 (credentials on `/api/track`), CORS allowlist, 429 vs 500. Without these the dataset itself has holes.
3. **Session/expiry + auth semantics** — inverted `isTokenExpired`, `/api/user` wallet override, `NODE_ENV` admin bypass, AdminPanel escaping.
4. **Time handling** — UTC in `getWeekNumber` and admin retention.
5. Everything in the P2 table as cleanup.

Nothing in this report has been changed in the codebase — it is a read‑only audit. Tell me
which items to fix and I'll implement them (I'd suggest starting with the two P0 counting bugs
and the `/api/track` credentials fix, which are small, self‑contained patches).

---

# REMEDIATION — all findings fixed (2026-08-22)

Every item above is now fixed in code. Nothing was deleted from KV: all existing
keys keep their meaning, readers fall back to the historical layout, and the two
counters that past write bugs corrupted are repaired by an explicit migration.

## Fix map

| Finding | Fix | Where |
|---|---|---|
| P0‑1 double-counted arena wins | `record.js` no longer writes the ladder; `battle_result_v2` is the single canonical writer (plus a `ladderCounted` opt-out for any caller that already wrote) | `api/_lib/battle/record.js`, `api/_lib/events.js` |
| P0‑2 global win rate | new `countsGlobalWin` flag: `stats:global.battle_wins` is incremented once per match independently of `affectsGlobal`; both PvP events set it | `api/_lib/events.js`, `api/_lib/battle/fight.js` |
| P0‑3 events dropped (401) | `trackEvent` now sends `Authorization: Bearer` **and** `credentials:'include'`, inspects the response, and honours `Retry-After` | `src/lib/api.js` |
| P0‑3b guest play uncounted | guest `battle_result_v2` (no wallet) is accepted unauthenticated, IP rate limited, and only moves anonymous global counters | `api/track.js` |
| P0‑4 inverted expiry | `expiresAtMs < Date.now() + 30_000` | `src/lib/api.js` |
| P1 weekly boards unreadable | `getLeaderboardKeyCandidates()` + `resolveLeaderboardKey()` build the real `…:week:<ISO week>` key and fall back through legacy shapes to all-time | `api/leaderboard.js` |
| P1 `getBattleLeaderboard` shape | accepts both flat `[member, score]` and `[{member, score}]` | `api/_lib/kv.js` |
| P1 429 vs 500 | typed `RateLimitError` → `429` + `Retry-After` | `api/_lib/events.js`, `api/track.js` |
| P1 local-time ISO week | UTC getters | `api/_lib/events.js` |
| P1 retention off-by-one | `addUtcDays()` | `api/admin.js` |
| P1 `/api/user` identity | explicit `?wallet=` wins over the JWT; profile backfill only for the authenticated owner | `api/user.js` |
| P1 duplicate listeners | one delegated `click` handler for both tab strips, removed on teardown | `src/pages/analytics.js` |
| P1 CORS | allowlist extended from `ALLOWED_ORIGINS` env + Vercel deploy URLs | `api/_lib/cors.js` |
| P1 funnel semantics | steps reordered to the real path, `unit: 'events'` exposed, caption changed to "page views to mint success (events)", bar width clamped | `api/leaderboard.js`, `src/pages/analytics.js`, `ConversionFunnel.js` |
| P2 1‑20 | share `platform` persisted, price/gas clamped, duplicate mints abandon the pipeline, PvP analytics awaited, `battleId` resolved before emitting, `first_connect` TTL, EXPIRE only on touched keys, weekly battle points, social-proof units, rank badge shows `—` when no snapshot exists, `== null` rank checks, admin bypass behind `ALLOW_INSECURE_ADMIN`, admin panel default-deny + fully escaped, CSV formula-injection prefix + single-read mint export, `maxViews` hoisted, foreign battle records dropped, dead arena metric removed, first-hop client IP | see diff |

## Migrating the existing data

Counters that the old write paths corrupted are repaired in place — rows are
rewritten, never removed, so every wallet stays on the board.

```bash
# 1. Dry run — reports what would change, writes nothing
npm run analytics:migrate

# 2. Apply (ladder + global wins + weekly clamp + first_connect TTL)
npm run analytics:migrate:apply
```

What it does:

1. Rebuilds `leaderboard:battle_wins:all_time` from `user:<w>:profile.battle_wins`
   (single-counted source of truth). Wallets with a profile but missing from the
   ladder are added, so nobody disappears.
2. Recomputes `stats:global.battle_wins` as the sum of profile wins, and raises
   `battle_total` if it was below that.
3. `--weekly`: clamps weekly arena rows that exceed a wallet's all-time wins.
4. `--cleanup`: applies a 1-year TTL to the legacy `user:*:first_connect` keys
   (kept, not deleted).

The same reconciliation is available to an authenticated admin without shell
access:

```
GET /api/admin?action=reconcile              # dry run report
GET /api/admin?action=reconcile&target=apply # write
```

The migration is idempotent — a second run reports `mismatches: 0`.

## Backwards compatibility notes

* **No key was renamed or removed.** Weekly reads try the correct key, then the
  legacy shapes, then all-time, so historical boards render either way.
* **Old records still parse.** `getBattleLeaderboard` accepts both zrange shapes;
  `battle_result_v2` without the new metadata flags behaves exactly as before
  (`countsGlobalWin` defaults to `affectsGlobal`, `ladderCounted` defaults false).
* **Pre-fix inflated numbers** are corrected by the migration, not by dropping
  data; until it is run the dashboard shows the old (doubled) ladder values.
* **New env vars** (all optional): `ALLOWED_ORIGINS`, `ALLOW_INSECURE_ADMIN`.
  `ALLOW_INSECURE_ADMIN` replaces the old implicit `NODE_ENV=development` bypass —
  local admin access now needs it set explicitly.

## Verification

`npm test` — 30 checks, all passing:

* `api/_lib/events.test.js` (in-memory KV double): ladder counted once, ladder/profile
  agreement, PvP attacker win reaching the global counter, weekly points + TTL
  scoping, guest events not touching wallet state, duplicate mint not inflating
  counters, UTC-stable week bucketing, typed rate-limit error.
* `api/leaderboard.test.js` (module-mocked KV): `period=week` hits the real weekly
  key, empty week falls back to all-time (**old data still shows**), `all_time`
  unchanged, funnel ordering/units, per-type social-proof units.
* `api/_lib/cors.test.js`: existing suite still green.

`npm run build` succeeds (3307 modules).
