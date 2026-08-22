# CI pipeline

`github-actions-ci.yml` is the CI workflow for this repo. It is kept here rather
than in `.github/workflows/` because the automation account that produced this
branch is not permitted to create workflow files — GitHub rejects such a push
with:

```
refusing to allow a GitHub App to create or update workflow
`.github/workflows/ci.yml` without `workflows` permission
```

## Enable it

```bash
mkdir -p .github/workflows
cp ci/github-actions-ci.yml .github/workflows/ci.yml
git add .github/workflows/ci.yml && git commit -m "ci: enable pipeline"
```

## What it checks

On every push and pull request (Node 22):

1. `npm test` — battle integrity, analytics, KV, OpenSea proxy allowlist and CSP
   regression suites.
2. `npm run build` — production build must succeed.
3. **No inline scripts/handlers in `dist/index.html`** — the deployed CSP has no
   `script-src 'unsafe-inline'`, so an inline `<script>` or `on*=` attribute
   would break in production only.
4. **No server secret in the bundle** — builds with canary values for
   `JWT_SECRET`/`OPENSEA_API_KEY` and fails if either string appears in `dist/`,
   catching a server-only key accidentally renamed to `VITE_*`.

All four run locally too:

```bash
npm test && npm run build
grep -rE ' on(click|error|load)="' dist/index.html   # must find nothing
```
