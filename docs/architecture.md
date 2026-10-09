# Mio Hivemind design

The goal is durable project knowledge shared by existing assistants, with explicit brain permissions and no personal memory collection. The user explicitly selected Supabase and no AI provider or embedding generation. This design replaces vector retrieval and LLM extraction with full-text/trigram retrieval and validated structured project facts. It makes no semantic-understanding claim.

## Structure

`packages/core`: strict schemas, deterministic privacy screening, retrieval budgets.
`apps/server`: Supabase-backed operations, authenticated stateless Streamable HTTP MCP, REST administration and sync processing.
`packages/integrations`: enrolled-workspace CLI, local screening, bounded sanitized queue, retry and client-specific hooks.
`apps/dashboard`: React administration, Supabase login and session refresh, memory review and integration instructions.
`supabase/migrations`: normalized schema, indexed RLS, transactional writes, optimistic revisions, durable sync queue, retention.
`tests`: privacy, real PostgreSQL execution using PGlite, HTTP/MCP client, hook integration and cross-actor workflow.

## Data and permissions

Brains never inherit another brain. Studio Global is an ordinary explicitly permissioned brain flagged global; clients must select it explicitly. Membership roles are admin/member; no actor profiles. Every action resolves auth from a validated Supabase JWT, never an input actor ID. Ordinary table access is SELECT-only with RLS. Mutations use invoker public RPC wrappers around private definer functions that explicitly check the authenticated actor and current membership, with fixed search paths. Functions re-screen content at the SQL boundary so direct REST callers cannot bypass the server privacy filter.

The schema includes brains, brain_members, memories, memory_revisions, memory_sources, sessions, session_handoffs, synchronization_events and privacy_reports. Sources and handoffs use composite brain foreign keys. Revision history and activity use only opaque UUID actors. Memory content is limited to 3000 characters, source to safe repository paths/commit identifiers. Revisions, sources, reports and linked handoffs are purged with deleted memories. Revision updates compare versions and lock rows inside a transaction.

## Synchronization and privacy

Hooks ignore transcripts, prompts, tool output and arbitrary files. They read only `.hivemind/notes.json` in an explicitly enrolled real workspace root, reject symlinks/path escapes, validate project facts locally, and enqueue only sanitized structured data. The assistant writes this project ledger under workspace instructions. Uploading it is automatic; deciding what knowledge belongs in it still depends on the assistant. Session-start hooks retrieve bounded project context. Lifecycle identifiers are hashed locally; absolute paths are never uploaded.

The server screens facts again, persists only sanitized facts and opaque identifiers, then asynchronously processes a transactional durable job. Supabase Cron drains pending jobs after restart and applies retention without an app worker key. A server-only optional worker can replace Cron on platforms without pg_cron. Without that key, authenticated polling and subsequent hook retries resume the caller's jobs. Idempotency keys bind actor+brain+payload; reusing a key for different content is rejected. Retries are bounded and errors contain codes only.

No AI classification is used. Default-deny deterministic rules require technical project language, reject personal content, secrets and instruction-like payloads, and also screen topic/source fields. These rules are conservative safeguards, not a proof that every personal fact is detected. Local notes and sanitized queues can still contain project-sensitive facts; enroll only approved repositories and review permissions.

## Knowledge and retrieval

Members create working knowledge. Only admins promote or edit established knowledge. A different statement under the same topic is a disputed proposal and never silently overwrites existing knowledge. Explicit admin resolution supersedes a chosen memory. Suggestions, agent assumptions, team decisions and verified changes are distinct provenance claims; verification is separate and controlled by admins.

Retrieval combines English full-text matching, trigram word similarity, verification and recency. Both database limits and the server's UTF-8 byte budget bound context (a conservative token estimate). Memory results are marked untrusted data. No vector column or provider credential is needed.

## Authentication and deployment

Dashboard and supported header clients use individual Supabase bearer access tokens. Tokens are verified with Supabase Auth and their issuer, expiration and configured audience are checked. MCP protected-resource metadata advertises an OAuth issuer only when explicitly configured; OAuth-only chat clients require a correctly provisioned external OAuth authorization server/resource audience. We do not pretend that a Supabase login page is a complete MCP OAuth integration. The server runs locally and in Docker; public deployment and external account provisioning require user authorization.

## Verification limits

SDK client connections and hook adapters are automated locally. The connected hosted Supabase backend now has real Auth, PostgREST, MCP and browser verification recorded in docs/backend-setup.md. Vendor assistant UIs are not assumed tested. Documentation distinguishes official capability from integration execution. RLS tests run against a real PostgreSQL engine with a simulated Supabase auth schema; they do not validate a hosted Supabase project's configuration.
