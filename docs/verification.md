# Verification

## Standard checks

```sh
npm ci
npm run check
```

Strict TypeScript, Vitest and both production builds run locally and in CI.
Tests cover accepted/rejected facts, SQL-boundary privacy, RLS isolation, role
revocation, admin verification, optimistic revisions, duplicate/conflict handling,
both-version conflict resolution, deletion cascades, pending-payload purging,
worker permissions/retention, authenticated HTTP boundaries, official MCP SDK
connections, hook enrollment, safe paths, retries, queue expiration and UI escaping.

PGlite executes real PostgreSQL SQL with a minimal simulated Supabase Auth schema.
The fixture serializes transactions on its single connection. These checks prove
schema logic, not hosted Auth, real multi-connection contention or cloud settings.

## Browser and cross-client workflow

```sh
npx playwright install --with-deps chromium
npm run build
npm run verify:browser
```

The verifier starts an ephemeral loopback server, real PGlite database and a
clearly labeled Auth fixture. It enrolls a temporary repository, runs a real
Claude Code hook adapter against HTTP, retrieves the fact with a second actor's
official MCP SDK client, denies an outsider, and submits competing versioned
updates. Chromium exercises sign-in, creation, search, promotion, history,
reporting/deletion requests and mobile layout. It captures a disposable fixture
screenshot at `/tmp/mio-hivemind-dashboard.png` and cleans up its database,
temporary workspace, browser and server. No hosted or real user data is used.

## Real local Supabase

Use a disposable local Supabase stack with Docker networking available. Startup
applies the migration. Never point this verifier at a hosted project; it enforces
a loopback API URL and creates/removes only uniquely named fixture users and its
own brain.

```sh
npm run db:start
umask 077
npx supabase status --output json > /tmp/mio-local-status.json
npm run build
npm run verify:supabase -- /tmp/mio-local-status.json
rm /tmp/mio-local-status.json
```

The status file contains local privileged keys; do not commit or print it.
This mode replaces the fixture with real Supabase Auth, caller JWTs and PostgREST,
including separate database connections for competing updates. Browser setup
and client workflow checks are otherwise the same. No production or provider
credentials are needed.

During implementation, the supplied environment allowed loopback tests but
blocked TCP between Docker containers. Supabase's database became healthy;
its Auth migration helper could not connect to it. Real local Supabase Auth/PostgREST verification was unavailable during the initial implementation. Hosted Supabase Auth/PostgREST was subsequently verified after the user authorized creating a new project; see backend-setup.md. Do not mistake the fixture run for
a completed Supabase or vendor UI test.

## Release checks still owned by the operator

Apply the migration to a development Supabase project, run the real-stack verifier,
and test each intended vendor UI with its supported auth and hook configuration.
Before production, verify real resource-bound MCP tokens, OAuth discovery/consent
if used, TLS/proxy origins, worker recovery, backup/deletion policy and deployment
health. The hosted Supabase database is provisioned and verified. Public application hosting and OAuth-only chat login have not been provisioned.
No full-transcript extraction or semantic embedding behavior exists by design.

## Recorded result (October 9, 2026)

`npm run check`: 48 tests passed, strict TypeScript checks passed, dashboard and server production builds passed. `npm run verify:browser`: all listed fixture-mode checks passed, including Chromium desktop/mobile behavior. That initial browser run used an Auth fixture. A subsequent real hosted Supabase verification passed Auth, PostgREST, Cron recovery, MCP, concurrent updates and browser login; see backend-setup.md. Vendor assistant UI verification is not claimed.
