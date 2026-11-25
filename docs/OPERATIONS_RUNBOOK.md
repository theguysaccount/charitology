# Charitology Operations Runbook (`OPERATE-01`)

This runbook documents how Charitology's live production surfaces are hosted, monitored, verified, and recovered. It records only verified infrastructure and operational procedures — no fabricated SLAs or unverified metrics.

## 1. Live Production Surfaces

| Surface | Canonical URL | Host / Runtime | Source Directory |
| :--- | :--- | :--- | :--- |
| **Static Record & Tools** | `https://charitology.com/` | GitHub Pages (`.github/workflows/deploy.yml`) | Root Astro app (`src/`, `public/`) |
| **Legacy Domain Redirect** | `https://charitology.org/` | HTTP 308 permanent redirect to `https://charitology.com/` | DNS / edge redirect (preserve `os.` and `mail.` subdomains) |
| **Charity OS (Shared App)** | `https://os.charitology.org/` | Vercel Serverless (`api/index.mjs`) + Neon Postgres | `services/charity-os/` |
| **Newsletter & OS Mail Relay** | `https://mail.charitology.org/` | Vercel Serverless (`api/index.mjs`) + Neon Postgres + outbound SMTP/provider | `services/newsletter/` |

## 2. Automated & Local Health Monitoring

- **Scheduled synthetic monitor:** [`.github/workflows/uptime-check.yml`](../.github/workflows/uptime-check.yml) runs `node scripts/check-production-health.mjs` every 6 hours (`17 */6 * * *` UTC) and supports manual `workflow_dispatch`.
- **What it verifies (strictly read-only, zero side effects):**
  1. `https://charitology.com/` returns `HTTP 200` with expected homepage markup.
  2. `https://charitology.org/` redirects (`3xx`) to `https://charitology.com/`.
  3. `https://charitology.com/api/v1/charity-index.json` and `/api/v1/funding-flows.json` return valid JSON catalogs meeting minimum jurisdiction/record/flow floors (`>= 27` jurisdictions, `>= 3.2M` records, `>= 45` funding flows).
  4. `https://charitology.com/tools/` serves the 3-path Charity OS & MCP quickstart, and `https://charitology.com/for-charities/free/` + `/data/free-charity-resources.json` serve all 65 verified nonprofit programs.
  5. `https://charitology.com/sitemap.xml` (`>= 590` canonical URLs), `https://charitology.com/llms.txt`, `https://os.charitology.org/robots.txt`, and `https://os.charitology.org/sitemap.xml` return `HTTP 200` with expected discovery markers.
  6. `https://charitology.com/downloads/extension-release.json` returns a valid extension manifest with a semver `extensionVersion`.
  7. `https://os.charitology.org/` returns `HTTP 200` with the in-app `pilot-feedback-trigger` and `pilot-feedback-dialog` controls.
  8. `https://os.charitology.org/api/session` returns `HTTP 200` with `{ "ok": true }`.
  9. `https://os.charitology.org/api/pilot-feedback` enforces `GET -> 405`, unauthenticated same-origin `POST -> 401`, and cross-origin `POST -> 403` without creating database rows or sending email.
  10. `https://mail.charitology.org/api/health` returns `HTTP 200` with `{ "ok": true, "service": "charitology-newsletter" }`.
- **Run locally on demand:**
  ```bash
  node scripts/check-production-health.mjs
  ```

## 3. Charity OS Deployment Invariants

Before changing anything inside `services/charity-os/`:

1. **Frozen `lib/` SHA-256 manifests:** `services/charity-os/test-db/fixtures/participation-recurrence-runtime.mjs` and `participation-reminder-runtime.mjs` cryptographically verify all 207 pinned files in `services/charity-os/lib/` against `*-runtime-manifest-v6.json`. Do not modify bytes inside `services/charity-os/lib/` unless intentionally rolling new manifests and updating the fixture contracts together.
2. **Vercel `api/` underscore convention:** `services/charity-os/vercel.json` rewrites `/api/:path*` to `/api/index`. Any `.mjs` file placed in `services/charity-os/api/` **without** a leading underscore becomes its own standalone serverless function and bypasses `/api/index`. Always prefix shared route helpers under `api/` with `_` (for example, `services/charity-os/api/_pilot-feedback.mjs`).
3. **Mail relay `purpose` constraint:** `mail.charitology.org/api/system/os-mail` enforces a Postgres `CHECK` constraint permitting `login`, `invitation`, `reminder`, `participation`, and `participation-reminder-v1`. In-app pilot feedback uses the existing `reminder` contract and never transmits passwords, tokens, or unrequested workspace dumps.

## 4. Incident Triage & Rollback

- **Static site (`charitology.com`):**
  - Check the latest run of `.github/workflows/deploy.yml` in GitHub Actions.
  - Because `src/data/publication-editions/`, `src/data/observations/`, `src/data/disaster-incidents/`, and `src/data/directory-resources/` enforce append-only Git history checks, roll back broken UI/data changes via a forward `git revert` PR rather than rewriting `main` history.
- **Charity OS (`os.charitology.org`) or Mail Relay (`mail.charitology.org`):**
  - Inspect Vercel deployment logs for the failing route and confirm `DATABASE_URL` / Neon Postgres reachability.
  - Use Vercel's instant rollback to promote the last known-good deployment while diagnosing the regression on a feature branch.
  - Run `node scripts/check-production-health.mjs` immediately after rollback to confirm recovery across all endpoints.

## 5. Backup & Clean-Restore Verification Drill

Each Charity OS organization can export a validated JSON workspace backup directly from the authenticated UI (`Backup & restore` panel, verified by `services/charity-os/public/backup-json.test.js`).

- **Local unit & admission drill verified (`2026-11-23`, PR #160 baseline):** All **81/81** backup-restore and lexical admission tests passed locally across `test/backup-json.test.mjs`, `test/directory-resource-backup.test.mjs`, `test/intake-backup.test.mjs`, `test/learning-backup.test.mjs`, `test/learning-backup-integration.test.mjs`, `test/participant-check-in-backup.test.mjs`, `test/participation-group-backup.test.mjs`, `test/participation-interval-backup.test.mjs`, `test/restore-incubator-counter-shape.test.mjs`, `public/backup-json.test.js`, `public/shell-mobile-a11y.test.js`, and `public/pilot-feedback.test.js` — including exact 64 MiB padded old-backup restore and 58.35 MiB near-quota generated backup restore (`2,000` records, `2,000` snapshots, `12` complete files) — while keeping all 207 files inside `services/charity-os/lib/` untouched.
- **Additional live public shell & grant-report checks verified (`2026-11-23`, PR #160 & PR #163):** `https://os.charitology.org/intake` returns `HTTP 200` (rewritten to `/intake.html` with a client-side non-`/p/` guard preventing spurious `/api/public/intake/intake/html` 404 calls), `https://os.charitology.org/mcp.html` serves styled documentation with `<link rel="canonical">` and skip-link navigation, and Charity OS grant reports pass narrow-screen (`1280px`/`390px`/`320px` Light/Dark, `0` horizontal overflow with all `<details>` expanded, `>= 44px` `<summary>` touch targets) and Dark-Mode `@media print` checks (`color-scheme: light` + white edge-to-edge paper reset on `:root[data-theme="dark"]`, hidden staff raw sources, vertical financial-block separation, verified by `services/charity-os/public/shell-mobile-a11y.test.js` and headless Chrome PDF output).

Before onboarding live pilot organizations with production data, complete an isolated Postgres restore rehearsal:

1. Provision a clean, empty Postgres 17 database (for example a temporary Neon branch or isolated local Postgres instance) — never test restores against production.
2. Run Charity OS database migrations and suite checks (`npm --prefix services/charity-os test`).
3. Import an exported test organization backup JSON into the isolated environment, confirm record counts across all 26 modules match the export manifest, and verify linked records, grant report snapshots, and audit metadata remain intact.
4. Destroy the temporary test database/branch once verified.

## 6. Operational Boundaries & Cost Guardrails

- **Static site:** Hosted on GitHub Pages (zero recurring server spend for static reads).
- **Serverless & database:** Keep `os.charitology.org` and `mail.charitology.org` within free/hobby or explicitly owner-approved monthly budgets; configure spend notifications in Vercel and Neon dashboards before enabling high-volume automated jobs or paid integrations.
- **Owner-gated external actions:** Paid registrar/store fees, third-party payment settlement, outbound newsletter campaigns, and `SW-AI-01` hosted LLM backends require explicit owner approval before activation.
