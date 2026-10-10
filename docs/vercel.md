# Vercel hosting

Vercel serves the React dashboard from `apps/dashboard/dist` and runs the existing
Express API and stateless MCP handler as one Node.js Function, exported from
`api/index.ts`. The shared `configuredApp` factory also powers the local and Docker
servers. Vercel-specific packaging does not change the database or memory tools.

The user selected the free Hobby plan for personal, noncommercial use. Fluid
Compute is enabled; the function runs in Cleveland (`cle1`), near the Supabase
Ohio backend, with a 30-second request limit. Cold starts remain possible; this
configuration does not promise an always-running process or zero startup delay.

The Vercel plugin created the project on October 9, 2026:

- Project: `prj_tGAsLMM9VnjIc6RH9R0D6zVyxr7s`
- Team: `team_wihnIEkaJ56yDvN26lKuwgen` (sharmnten's projects)
- [Project dashboard](https://vercel.com/sharmntens-projects/mio-hivemind)
- Application: <https://mio-hivemind.vercel.app>
- MCP: <https://mio-hivemind.vercel.app/mcp>
- Initial successful deployment: `dpl_9mKPi6EWAXgp6QDkpmaPh21ufJJS`
- Initial successful commit: `0a5905b30a97b57a41c9b58d99bdb3d63ecd52ca`

Git pushes to `main` trigger production deployment. Vercel account protection
applies to preview deployments; production uses the application's Supabase
authentication boundary so remote clients can reach the public MCP endpoint.

## Configuration

Import `sharmnten/hivemind-mcp` from GitHub into Vercel using the repository root.
`vercel.json` specifies `npm ci --include=dev`, `npm run build`, the dashboard output directory,
function routing, and static security headers. It uses the existing dependency
lockfile and Node.js 24. No additional database, Redis, or AI provider is needed.
Build dependencies must be installed even when `NODE_ENV=production`; they are
needed by Vite and TypeScript and are excluded from the traced runtime bundle.

Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `NODE_ENV=production` in the
project's environment settings. Keep the local `.env` and `.vercel` directory
out of source control. The application does not require a service-role key.

Without an explicit `PUBLIC_URL`, production uses
`https://<VERCEL_PROJECT_PRODUCTION_URL>` and previews use
`https://<VERCEL_URL>`. The production domain is stable across deployments. Host
and browser-origin validation use this URL, as does the expected MCP audience.
An explicit HTTPS `PUBLIC_URL` overrides automatic domain selection. Set
`ALLOWED_ORIGINS` only when additional exact trusted browser origins are needed.
If changing Supabase projects, also update the static CSP in `vercel.json` to
permit the new exact Supabase origin.

Vercel serves dashboard assets through its CDN; the Express function handles
`/api/*`, `/mcp`, `/health`, `/ready`, and `/.well-known/*`. Keep all browser API
calls on the same origin. No vendor-specific hook URL should point at a preview
deployment for routine use.

## Jobs and authentication

The existing Supabase Cron jobs recover queued synchronization every 30 seconds
and run retention hourly. A serverless invocation may end after returning 202,
so recovery is handled by the durable database queue, not an in-process timer.
Do not run the optional Node worker as a persistent Vercel Function.

Dashboard signup is available at `/signup`, with sign-in at `/login`. Accounts use case-insensitive usernames (3–32 ASCII letters, digits, or underscores) and passwords. Supabase Auth stores a deterministic internal identifier at `username@users.hivemind.invalid`; this is not a mailbox. Turn **Confirm email OFF** in Supabase Authentication → Sign In / Providers → Email. No SMTP or email verification is used. Existing brain access still requires membership. Changing the internal identifier domain requires migrating Auth users and identities together while retaining UUIDs.

There is no email password recovery in this flow; forgotten passwords require an administrator reset. The UI does not grant access to existing brains merely by signing up.

Run `npx tsx scripts/verify-auth.ts` for browser checks with mocked Auth responses, or pass the production origin to check the deployed UI without creating accounts or sending email.

Dashboard sign-in uses Supabase Auth users. Production MCP uses the same user identity through OAuth consent at `/oauth/consent`, issued by the Supabase OAuth server. `/connections` provides grant management. See [OAuth setup](oauth.md).

## Verification

Run `npm run check` before publishing. After deployment, verify `/health` and
`/ready` return 200, `/api/brains` and `POST /mcp` reject unauthenticated requests,
the resource metadata contains the stable `/mcp` URL, and the dashboard loads its
assets and Supabase browser configuration without errors. Measure production
startup and warm-request times separately; a few immediate requests do not
measure the response after a prolonged idle period.

The production deployment reached READY. All 52 tests, strict TypeScript checks,
and builds passed locally and in GitHub CI. Public checks returned 200 for
health/readiness, 401 for unauthenticated REST/MCP, and 403 for a hostile origin.
Resource metadata matched the stable public MCP URL and the browser configuration
pointed at the existing Supabase project. Sample already-warm health/readiness
requests took 224 ms and 194 ms from the verification environment; those timings
are not an idle-start guarantee. The initial deployment's runtime error scan
returned no error/fatal logs.
Chromium loaded the dashboard, enabled the sign-in form after fetching browser
configuration, and passed a mobile overflow check without JavaScript or console
errors. These checks describe the initial deployment; the subsequent OAuth verification is documented in [OAuth setup](oauth.md).
