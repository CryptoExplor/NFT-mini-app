Original prompt: do all and make sure my app work on web, farcaster miniapp and base app miniapp

- 2026-04-23: Started production-safe follow-up pass after stability and refactor work.
- Goals for this pass:
  - replace mock allowlist verification with real Merkle proof verification
  - add non-breaking integrity checks for live balance override loading
  - refresh AI_CONTEXT.md so it matches the current repo and no longer points at stale local-only history
  - push analytics further toward V2/battle-first while preserving web + Farcaster/Base miniapp compatibility
  - keep battle history sync/history/replay contracts coherent
  - avoid CSP / X-Frame-Options / HttpOnly-cookie migrations in this pass because they risk breaking embeds or current auth flows

- 2026-04-23: Completed production-safe expansion pass.
  - allowlist verification now uses real sorted Merkle proof checks
  - live balance overrides support optional SHA-256 payload verification
  - analytics now reads synced battle history and exposes battle-first arena sections
  - replay links now work through `/battle?replay=<battleId>`
  - visible emoji-based UI badges were replaced with shared SVG icons in analytics, gallery, detail modal, home search, and toasts
  - AI_CONTEXT refreshed to match synced history, replay endpoints, and the current V2 phase

- 2026-04-29: Audited the post-commit delta outside `ZUMP` temp paths and fixed live regressions.
  - battle auth now has a bearer fallback in addition to cookies, which keeps challenge/fight/record flows working more reliably across localhost, web, and embedded miniapp contexts
  - replay CTA logic now distinguishes AI replays from PvP replays and no longer treats old battle ids as live challenge ids
  - AI replay share prompts can now resolve to a real persisted replay URL when the replay record exists
  - synced battle history now attributes wins/damage/crits/dodges based on the viewer wallet side instead of assuming the player is always `P1`
  - social/replay analytics events are now accepted server-side instead of being silently dropped
  - daily boss completion is now tracked per player key instead of once per browser storage bucket
  - deterministic Farcaster synergy replaced the old random 80% follow mock
  - `npm run build` passed after the fixes; remaining warnings are chunking/static-vs-dynamic import warnings rather than correctness failures

- 2026-08-22: Analytics audit + full-application audit, then the follow-up work.
  - analytics: fixed double-counted arena wins, the PvP global win-rate bias, silent
    401s on /api/track (bearer + credentials), the inverted session-expiry check and
    unreadable weekly leaderboards; added `npm run analytics:migrate` to repair the
    historical counters in place (no data deleted)
  - battle integrity: wins now only count for a server-produced, one-time-counted
    battle record; PvP/AI stats are clamped to the balance envelope; AI results are
    re-simulated server-side and rejected on mismatch; NFT ownership is verified
    on-chain (OpenSea inventory fallback for profile-only collections)
  - app: added the missing /placeholder.png and stopped the onerror loop, repaired the
    service worker (offline fallback, unbounded cross-origin caching, message guard),
    made all localStorage access private-mode/quota safe, fixed mint-flow crashes
    (unnamed ABI inputs, fractional burn amounts, reverted receipts) and token-id
    collisions, stopped the arena animation leaking past teardown
  - security: OpenSea key moved server-side behind /api/nfts, CSP enforced without
    script-src 'unsafe-inline' (every inline handler removed), CSP report collector,
    admin bypass now behind ALLOW_INSECURE_ADMIN, third-party metadata escaped
  - CI added (tests + build + inline-handler and leaked-secret checks); 78 tests
  - the earlier note about avoiding a CSP because it risks breaking embeds is now
    resolved: frame-ancestors is deliberately left unset so mini-app embedding works
