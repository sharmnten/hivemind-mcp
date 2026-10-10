# Hivemind assistant login

Assistants authenticate through the Supabase OAuth 2.1 server. Existing Hivemind usernames/passwords identify users; Supabase manages PKCE, authorization codes, token signing and refresh rotation. Hivemind supplies the consent page and checks each user's current brain memberships.

## Hosted configuration

Project: `oadeofxsspwkmoyjmfdn`. Site URL: `https://mio-hivemind.vercel.app`.

In Supabase Authentication:

1. OAuth Server: enable OAuth 2.1 and Dynamic Client Registration.
2. Set Authorization Path to `/oauth/consent`.
3. Hooks: enable Custom Access Token, using Postgres function `public.hivemind_access_token_hook`.
4. Keep Confirm email OFF for Hivemind's username accounts.

The connected plugin cannot edit these settings; configure them in Supabase's dashboard. OAuth is available without a separate fee on all Supabase plans, subject to normal Auth usage limits. See [Supabase's OAuth setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started).

Hivemind defaults its advertised authorization server to `SUPABASE_URL/auth/v1`. An explicit `MCP_OAUTH_ISSUER` overrides discovery and must refer to a compatible server. The primary resource is `https://mio-hivemind.vercel.app/mcp`; a deployment at another URL needs its own correctly configured audience hook.

## Security and lifecycle

- Supabase signs OAuth tokens with the resource-specific MCP audience. Password/dashboard tokens retain `authenticated`. The Auth hook changes only tokens containing Supabase's top-level OAuth `client_id`; user-editable metadata does not grant access.
- Consent names the requesting client, shows its callback and scopes, explains project read/write access, and offers Allow/Deny. Login or signup preserves the authorization request.
- The server validates each token using Supabase, checks issuer, expiry and audience, and requires a valid OAuth session/client pair. A caller-scoped boolean RPC checks the active session and unrevoked consent; it exposes no session records.
- The repository still uses the caller's JWT and RLS. No service-role key is given to assistants and no personal user password is sent to an assistant.
- [Connected assistants](https://mio-hivemind.vercel.app/connections) lists grants and lets each user revoke access. Revocation removes the OAuth session, blocks subsequent MCP requests and prevents refresh. Requests already in progress may finish.
- Dynamic registration lets clients register callback URLs; registering a client alone grants no user or brain access. Approve only client connections you initiated.

Hook migration: `20261010005236_mcp_oauth_audience.sql`. Revocation RPC migration: `20261010005502_mcp_oauth_revocation.sql`. Keep filenames aligned with hosted migration history. The private session-check function uses Supabase Auth's `sessions` and `oauth_consents` tables; verify it after Auth schema updates.

## Verification

`npm run check` verifies the local application. `scripts/verify-oauth.ts` exercises hosted discovery, public client registration, browser username login/consent, PKCE code exchange, MCP tools, refresh, replay rejection, denial and revocation. Supply `HIVEMIND_USERNAME` and `HIVEMIND_PASSWORD` through the process environment; the script never prints tokens or passwords. It creates a temporary brain and OAuth client, revokes the grant and deletes the brain. It prints the fixture client UUID so the operator can remove that registration afterward using authorized Supabase management. Never delete other client registrations.

Protocol/browser verification does not verify the user interface of every vendor app. Follow [the client guide](clients.md), authenticate in your installed app, and test `list_brains` and `get_brain_context` before relying on writes.
