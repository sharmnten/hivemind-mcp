# Operations

Use one Node.js service for dashboard, REST and stateless MCP, backed by a
Supabase project. `GET /health` checks process availability; `GET /ready` checks
Supabase Auth reachability. Readiness is not a complete database permission probe.
`POST /mcp` is stateless Streamable HTTP; GET/DELETE receive 405.

For development the server binds loopback. Docker sets `HOST=0.0.0.0` inside the
container and publishes only loopback by default. Set exact `PUBLIC_URL` and
`ALLOWED_ORIGINS` for the browser/client origins you actually trust. Place remote
production traffic behind HTTPS. Host checks use PUBLIC_URL's hostname; preserve
the public Host header in the proxy. Do not enable broad proxy trust.

```sh
docker compose up --build
```

Provide a reachable Supabase URL in `.env`: container loopback is not the host's
loopback. For a local stack use an explicitly reachable host address; a hosted
Supabase URL works directly. This command does not create a hosted Supabase project
or publicly deploy the service. Deployment remains an operator action.

The backend maintenance migration enables Supabase Cron when pg_cron is available: queue recovery runs every 30 seconds and retention runs hourly. It requires no worker key. If pg_cron is unavailable, run `npm run worker` or the compose worker profile (`--profile worker`) for restart recovery and scheduled retention. The worker alone needs
`SUPABASE_WORKER_KEY`, a server secret/service-role credential. It drains eligible
events every three seconds and applies retention hourly. Never give that key to
an assistant, browser, or unrelated process. Without a worker, authenticated
status polling resumes up to five caller-owned pending jobs; automatic retention requires either the worker or the installed Supabase Cron jobs. HTTP submissions also attempt processing after returning 202.

Production uses `NODE_ENV=production`, HTTPS `PUBLIC_URL`, and
`MCP_TOKEN_AUDIENCE=https://your-host/mcp`. Default production audience is that
resource; `authenticated` is rejected in production. Dashboard REST uses ordinary
Supabase Auth sessions with audience `authenticated`. MCP access requires the
resource-specific audience as well as verified Supabase identity, issuer,
expiration and current database membership. An audience array containing both
may be appropriate if your authorization deployment supports it; validate actual
PostgREST and client behavior before rollout. Do not change production audience
validation to accept generic tokens as an OAuth shortcut.

OAuth-only clients additionally require a provisioned Supabase-compatible
authorization/consent implementation. Review Supabase's
[OAuth server](https://supabase.com/docs/guides/auth/oauth-server) and the MCP
[authorization specification](https://modelcontextprotocol.io/specification/latest/basic/authorization).
Configuring discovery metadata does not implement that deployment.

Apply migrations to a development project and verify before your usual production
rollout. Back up data according to studio policy. Local `db:reset` is destructive;
do not use it for production. Support deletion across backups through your backup
retention process. Operators must avoid body/token logging in proxies and APM.

Rate limits are in-memory per process (120 requests/tools per actor per minute,
bounded tracked keys), plus transactional sync enqueue limits. Use infrastructure
limits for multi-instance protection. Monitor stable error codes, request status,
queue attempts and readiness. Database errors are intentionally redacted; inspect
privileged database diagnostics securely when necessary.

The Mio Hivemind Supabase project and the [Render web service](render.md) were
provisioned through their plugins with the user's authorization. The public
application is <https://mio-hivemind.onrender.com>; its MCP endpoint is `/mcp`.
Production MCP authorization still needs compatible token issuance and OAuth
consent where required. No billing provider, custom email delivery service, or AI
provider has been provisioned. Email/password sign-in needs existing
Supabase users; hosted signup/email policy is managed in your Auth project.
