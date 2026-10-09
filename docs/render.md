# Render hosting

Mio Hivemind runs as one Render Docker web service. The same service serves the
dashboard, REST API, and stateless Streamable HTTP MCP endpoint at `/mcp`.
Supabase remains the database and authentication backend; its installed Cron
jobs handle synchronization recovery and retention.

Deployment settings:

| Setting              | Value                                                          |
| -------------------- | -------------------------------------------------------------- |
| Repository           | `https://github.com/sharmnten/hivemind-mcp`                    |
| Branch               | `main`                                                         |
| Runtime              | Docker                                                         |
| Dockerfile / context | `./Dockerfile` / `.`                                           |
| Plan / region        | Free / Ohio                                                    |
| Auto deploy          | On                                                             |
| Health probe         | `/ready` if configured; Render also detects the listening port |

Set these environment variables in Render:

| Variable                   | Value                                      |
| -------------------------- | ------------------------------------------ |
| `NODE_ENV`                 | `production`                               |
| `HOST`                     | `0.0.0.0`                                  |
| `PORT`                     | `10000`                                    |
| `SUPABASE_URL`             | `https://oadeofxsspwkmoyjmfdn.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | The project's publishable key              |

Render provides `RENDER_EXTERNAL_URL`. The server uses it as `PUBLIC_URL` when no
explicit value is set, permits that origin by default in production, and uses
`<PUBLIC_URL>/mcp` as the expected MCP token audience. For a custom domain, set
`PUBLIC_URL` to its HTTPS URL and `ALLOWED_ORIGINS` to the exact origins you trust.
Do not copy the local `.env` onto Render: its development URLs and generic MCP
audience are unsuitable for this deployment. No AI key or Supabase service-role
key is needed by the web service.

Check `GET /health` and `GET /ready` after deployment. Unauthenticated REST and
MCP requests must return 401. The dashboard uses existing Supabase Auth users.
The server's CSP permits this project's Supabase origin for browser sign-in.

## MCP authentication

Hosting establishes the endpoint; it does not provision OAuth authorization or
issue MCP tokens. Production MCP requests require a verified Supabase user token
with this endpoint's audience. Ordinary dashboard tokens have audience
`authenticated` and are rejected by MCP. Configure compatible token issuance
and, for OAuth clients, authorization and consent before connecting assistants.
See [operations](operations.md) for the requirements. Never bypass production
audience checks or send a service-role key to an MCP client.

## Free plan behavior

[Render's Free plan](https://render.com/docs/free) sleeps after 15 minutes without
inbound traffic and takes about a minute to resume. An MCP client can time out
during a cold start; open the dashboard and retry once it is ready. The filesystem
is temporary, so shared memory stays in Supabase. Free service hours are shared
across the workspace's free services. Monitor usage in the Render dashboard.
