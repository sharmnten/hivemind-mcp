# Security and privacy

Report security issues privately to the repository maintainers; do not include
tokens or sensitive memories in public issues. This project currently has no
dedicated security reporting address.

All brain tables have row-level security. A validated individual Supabase user
identity supplies the actor UUID; request payloads cannot select their actor.
Ordinary actors receive SELECT-only table access. Public invoker RPCs delegate
to private functions with fixed search paths, explicit membership/admin checks,
transactional locks, and privacy screening. Supabase `private` must never be an
exposed Data API schema. Every user has explicit access to each brain, including
Studio Global. Privileged worker credentials bypass RLS and belong only in
trusted server secret storage.

Privacy screening runs locally, in the API, and again inside database writes.
Strict structured inputs reject unknown transcript/raw-context fields. Rules
require technical project relevance and reject recognizable personal language,
contact information, secrets, instruction injection, unsafe source paths and
opaque tokens. Hooks only read the enrolled project ledger; event transcripts,
prompts and tool outputs are ignored. Source files are references, never read.

Deterministic rules have false positives and false negatives. They do not prove
that arbitrary prose is anonymous or safe. Use concise facts, approved project
workspaces and human review. A technical fact can still be confidential business
information. A compromised assistant or malicious member can submit misleading
project facts; provenance is a claim, and admin verification is a separate step.
Retrieved data cannot be trusted as instructions. No personal profiles are
imported, and no provider receives extraction or embedding requests.

Logs include request IDs, status and duration, never bodies, Authorization
headers or raw database errors. Avoid enabling proxy body/header logging,
browser recording or monitoring that captures credentials or memory content.
Auth email/password and browser sessions are handled by Supabase, separate from
Hivemind memory. A host/page compromise can access a browser session: enforce
HTTPS, exact origins, CSP and normal endpoint hardening.

Deletion purges a memory's revisions, sources, reports and linked handoffs, and
cancels queued facts under that topic to prevent immediate resurrection.
Brain deletion cascades through its data. This does not erase copies already
retrieved into clients, local ledgers, backups or external logging systems.
Remove the local ledger entry as well; configure backup retention separately.
Only admins permanently delete data; members can request deletion.

Local queues contain sanitized project facts, use private permissions, reject
symlinks and expire after seven days. They never contain bearer tokens. Concurrent
hooks use atomic queue publication and database idempotency. Enrollment is bound
to a real absolute root; other or nested roots are rejected. This is not a
filesystem sandbox against a hostile local user changing directories during an
operation. Use normal repository trust boundaries and OS permissions.

Production requires HTTPS and MCP tokens issued for the exact resource audience.
Supabase OAuth handles assistant consent, PKCE and refresh. Each MCP request also
checks the caller's current OAuth session and grant, so revoking a connection
blocks subsequent requests even when its signed access token has not expired.
Never use a shared service role as a client identity. Role checks use current
database membership, so revocation applies on subsequent calls. In-memory HTTP
rate limits apply per server instance; add infrastructure-wide limits for a
multi-instance deployment. Content budgets are conservative estimates rather
than a model-specific tokenizer guarantee.
