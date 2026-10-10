# Connected Supabase backend

Created through the Supabase plugin on October 9, 2026 after the user selected a
new project in the PrepBros organization and confirmed the reported $0/month cost.

- Project: **Mio Hivemind**
- Project ref: `oadeofxsspwkmoyjmfdn`
- Region: US East (Ohio), `us-east-2`
- [Project dashboard](https://supabase.com/dashboard/project/oadeofxsspwkmoyjmfdn)
- API: `https://oadeofxsspwkmoyjmfdn.supabase.co`
- PostgreSQL: 17.11

The ignored, mode-600 `.env` connects the local application to this project using
its publishable key. No service-role key, AI key or personal login credential is
stored in the application. Generated database types are in
`packages/core/src/database.types.ts`.

The foundation, hosted indexes and backend maintenance migrations are applied.
Local migration filenames match the versions recorded by Supabase, so future CLI
operations recognize the existing history rather than reapplying the schema.
All nine project-data tables have RLS, explicit member/admin checks and screened
transactional writes. The missing foreign-key indexes identified by the hosted
advisor were added. Full-text and trigram search require no embeddings.

Supabase Cron runs `hivemind-drain-sync` every 30 seconds and
`hivemind-retention` hourly. Trusted database jobs set a transaction-local worker
claim before invoking the already restricted maintenance routines; no worker
secret is copied into the app. Cron administration is inaccessible to public,
anon and authenticated roles. Maintenance also bounds its own job history.
Environments without pg_cron can use the optional Node worker.

## Run and sign in

```sh
npm run dev
```

Open <https://mio-hivemind.vercel.app/signup> (or `/signup` on the local server), create an individual username/password account, then sign in and create the first brain. The brain creator is its admin. Invite
other existing Auth user UUIDs through that brain's Members tab. No permanent
user account or seeded brain was created during backend setup.

The local development MCP audience is `authenticated`. The Node application now
runs at <https://mio-hivemind.vercel.app> on Vercel. Production MCP requires
resource-bound tokens as described in operations.md; OAuth-only chat clients
additionally need a supported consent and authorization-server setup. Hosting is
configured, but production MCP token issuance and OAuth consent are still needed
before assistants can connect. See [Vercel hosting](vercel.md). The earlier Render
deployment continues to use the same backend.

## Verification

Real hosted Supabase Auth sign-in and getUser, API readiness, durable sync,
MCP sharing between members, outsider RLS denial, direct-RPC privacy rejection,
multi-connection optimistic concurrency and Chromium login/retrieval passed using
three disposable Auth fixtures. Queue recovery is tested by directly enqueueing
through PostgREST and waiting for Cron rather than the HTTP processor. Temporary
identities and their test brains are removed after verification. No invitations
or emails were sent.

The private fixture verifier is `scripts/verify-hosted.ts`; it requires an
operator-created disposable fixture file and only accepts verification emails in
the reserved example.invalid domain. Do not use real user passwords or disable
email confirmation to run it. Routine checks remain `npm run check` and
`npm run verify:browser`.

Supabase's security advisor flags disabled leaked-password protection, a default
Auth setting. [Supabase documents this as a Pro-plan feature](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
The free setup does not enable a paid feature. Application tables/functions have
no reported security findings. Fresh indexes may be reported as unused until
the project receives representative traffic.
