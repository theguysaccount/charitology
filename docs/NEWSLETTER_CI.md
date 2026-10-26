# Newsletter checks and deployment boundary

The newsletter has its own package and lockfile in `services/newsletter`. The public Astro site is a separate GitHub Pages build. Passing the website checks alone does not test the mail service.

## What CI runs

[`newsletter-check.yml`](../.github/workflows/newsletter-check.yml) is a reusable workflow called by both the pull-request/branch [Check workflow](../.github/workflows/check.yml) and the main-branch/manual [Pages deployment workflow](../.github/workflows/deploy.yml). Pages publication waits for both the website build/check job and newsletter checks to succeed.

The newsletter job uses Node 24, the service's exact lockfile and a disposable PostgreSQL 17 service container. It runs:

```sh
# Working directory: services/newsletter
npm ci
npm test
node --test test-db/*.test.mjs
```

The final command receives `DATABASE_URL` only for the disposable CI container. The database test creates an isolated temporary schema, applies the authored schema, uses synthetic `example.invalid` addresses and drops that schema afterward. Its provider operations are mocks. The test covers consent races, expiry, replacement, withdrawal, durable limits, rollback, preference isolation and campaign create/send state handling without contacting a mail provider.

The job has read-only repository permissions, does not retain checkout credentials and receives no Vercel, Resend, Neon or production-database secrets. Sending is disabled in the job environment and controlled-test mode stays on. The caller does not inherit secrets. No provider setup, production migration, deployment, campaign preparation or send command is part of this workflow. The PostgreSQL container password in the YAML is a disposable test credential, not an operational secret.

Do not replace the direct database-test command with `npm run test:db` in CI: that local script deliberately loads `.env.local`. Never upload environment files, provider state, subscriber records, tokens or secret-bearing logs as test artifacts.

GitHub documents both [PostgreSQL service containers](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers) and [same-commit reusable workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows). PostgreSQL 17 is a supported major release under the project's [versioning policy](https://www.postgresql.org/support/versioning/); the major tag receives its available minor updates. A future container digest pin should include an update process rather than silently retaining an old security release.

## Vercel release remains a separate action

This CI addition does not deploy the dedicated mail project. Its intended project root is `services/newsletter`; project targeting and actual deployment state must be verified separately. Keep the static site on its existing host. Do not make the website build provision preferences, apply production migrations or send mail.

For a future automated mail deployment, use a separately authorized protected environment and reviewed commit. Vercel [Deployment Checks](https://vercel.com/docs/deployment-checks) can hold production alias assignment for required tests. A CLI-based alternative is to stage the production build without assigning its domain, verify that deployment and then promote that exact build. These are release options, not configured behavior in this workflow. Do not add a send step to either path.

Before enabling public signup, verify the actual sender domain, disabled open/click tracking, isolated newsletter topic/segment, database schema, secrets, signed webhook handling, reply route and controlled end-to-end consent/unsubscribe behavior. Check both service sending state and controlled-test mode; a public form must not silently discard ordinary signup requests under a private-recipient-only test gate. The public `email-status.json` switch should follow that verification, not merely a successful build.

Campaign publication remains an authenticated, deliberate operation for a fixed reviewed issue and a confirmed audience. Deployment and CI success are not permission to send, provider acceptance is not proof of inbox receipt and a test message is not proof of general deliverability. [EMAIL_DELIVERY.md](EMAIL_DELIVERY.md) records the actual operational state and remaining checks.
