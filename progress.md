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
