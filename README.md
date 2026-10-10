# Mio Hivemind

Shared project memory for coding assistants, backed by Supabase Auth and
PostgreSQL. Connect through the official MCP Streamable HTTP transport or use
the React administration dashboard.

**No AI provider, embedding model, or AI API key is required.** Indexed full-text
and trigram search retrieve technical knowledge. Existing assistants maintain a
small structured project ledger; enrolled-workspace hooks automatically upload
screened facts and retrieve context. Hivemind does not extract transcripts.

Features include explicitly permissioned brains, working and established
knowledge, revision history, conflict proposals, admin verification, source
references, session handoffs, durable idempotent synchronization, privacy
reports, cascading deletion, and configurable working-memory retention.
Studio Global is a separate brain with explicit membership.

## Hosted application

- Dashboard: <https://mio-hivemind.vercel.app>
- MCP endpoint: <https://mio-hivemind.vercel.app/mcp>
- [Vercel project](https://vercel.com/sharmntens-projects/mio-hivemind)

The application runs on Vercel Hobby with Fluid Compute and the connected Supabase backend.
[Create an account](https://mio-hivemind.vercel.app/signup), choose a username and password, and sign in. MCP client access additionally
requires endpoint-specific token issuance or OAuth configuration; ordinary
dashboard tokens are rejected by production MCP. See [Vercel setup](docs/vercel.md).
The earlier [Render deployment](docs/render.md) is still available.

## Run locally

Requirements: Node.js 24+, npm, and either Docker for local Supabase or an
existing Supabase project. Use the versions pinned in `package-lock.json`.

```sh
npm ci
npm run db:start
cp .env.example .env
```

Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in `.env` using the local CLI
status or your project's Connect dialog. These are Supabase credentials, not AI
provider credentials. Keep privileged service/secret keys out of the dashboard
and assistants. Local startup applies the migration automatically. For an
existing project, apply [the migrations](supabase/migrations)
through your established Supabase migration workflow. `db:reset` destroys local
data and is only appropriate for a disposable development stack.

Create individual username/password accounts at `/signup`. Hivemind uses Auth identities for login and opaque
UUIDs for membership. No email address, SMTP setup, or verification is required.

```sh
npm run build
npm run dev
```

Open <http://127.0.0.1:3000>, sign in, create a project brain, and grant other
developers membership using their Supabase Auth UUIDs. For dashboard hot reload,
run `npm run dev:dashboard` in a second terminal and use <http://localhost:5173>.

## Connect an assistant

Obtain your individual Supabase access token through your Auth session. Supply
`HIVEMIND_ACCESS_TOKEN` securely to the coding client's process environment;
tokens expire and must be refreshed through Supabase Auth. Hooks do not save
tokens or implement a separate credential store.

```sh
node /path/to/hivemind-mcp/dist/packages/integrations/src/cli.js \
  --enroll --root /path/to/approved-project \
  --brain YOUR_BRAIN_UUID --server http://127.0.0.1:3000
```

Enrollment creates `.hivemind/config.json` and an empty notes ledger. Merge the
matching hook/MCP examples from [integrations](integrations) into your client
configuration, replace absolute path placeholders, and install the
[project-memory instructions](integrations/shared/project-memory.md). Add
`.hivemind/local/` and the machine-specific `.hivemind/config.json` to the enrolled
project's gitignore. Review whether your project ledger belongs in source control.

[Client setup and compatibility](docs/clients.md) explain Claude Code, Cursor,
VS Code/Copilot, ChatGPT and Claude chat. Chat platforms have different auth and
lifecycle support; automatic conversation capture is not promised.

## MCP tools

`list_brains`, `get_brain_info`, `select_brain`, `get_brain_context`,
`search_memories`, `write_memory`, `update_memory`, `get_recent_memories`,
`get_memory_history`, `create_handoff`, `get_recent_handoffs`,
`get_project_activity`, `report_memory`, `request_memory_deletion`.

Every brain operation requires an explicit `brain_id`. Selection validates access
and returns context; it does not modify shared server state. Revisions require
`expected_version`; only admins promote facts or resolve conflicts. Retrieved
memory is marked as untrusted data and bounded by result and byte-derived token
budgets. Search is lexical/fuzzy, not semantic.

## Development and operations

```sh
npm run check
```

This runs strict TypeScript checks, Vitest coverage of privacy/database/hook/MCP
boundaries, and production builds. Database tests execute the migration in
PGlite PostgreSQL with simulated Auth roles. Optional real Supabase/browser
verification is documented in [verification](docs/verification.md).

Read [architecture](docs/architecture.md), [security](SECURITY.md),
[schema](docs/schema.md), and [operations](docs/operations.md) before deploying.
The connected hosted backend is documented in [backend setup](docs/backend-setup.md). Production MCP tokens must have a resource-specific audience. OAuth-only clients
need a provisioned authorization server; setting a URL alone does not implement
OAuth. The provisioned application and its configuration are documented in
[Vercel hosting](docs/vercel.md), with [Render hosting](docs/render.md) also supported.

MIT licensed. Contributions should run `npm run check` and avoid personal or
production data in fixtures.
