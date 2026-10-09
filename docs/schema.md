# Supabase schema

The executable source of truth is
[the migration](../supabase/migrations/20261009164746_foundation.sql).

| Table                  | Purpose                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| brains                 | Name, technical overview, explicit global flag, retention                                                 |
| brain_members          | Per-brain opaque Auth user UUID and admin/member role                                                     |
| memories               | Topic, minimal fact, type, provenance, layer/status, CAS version, fingerprint and indexed search document |
| memory_revisions       | Sanitized historical snapshots with version and actor                                                     |
| memory_sources         | Relative repository file and commit reference                                                             |
| sessions               | Hashed lifecycle key, client, actor, start/end                                                            |
| session_handoffs       | Brain-bound links between synchronized sessions and handoff memories                                      |
| synchronization_events | Idempotency/payload digest, sanitized pending facts, attempts, next retry, stable error code              |
| privacy_reports        | Enum reason, deletion request and opaque reporting actor                                                  |

All tables enable RLS. Membership lookups are indexed and use a private helper
that avoids policy recursion. Composite foreign keys ensure sources and handoff
links cannot cross brains. Deleting a brain cascades through all associated data.
Fingerprint uniqueness deduplicates active content within one brain. GIN indexes
support generated full-text documents and trigram matching; topic/recent indexes
support context and conflict lookup. No vectors or embeddings are stored.

`hivemind_mutate(action, payload)` implements brain/member/retention controls,
memory writes/updates/deletion/reporting, conflict resolution and sync enqueue.
The public wrapper runs as the caller; a private transaction checks identity,
locks the brain and validates current permission. Updates compare
`expected_version`. Conflict resolution compares both winner and superseded
versions. The last admin cannot be removed or demoted.

`search_memories(input)` runs with explicit membership and combines full-text,
trigram similarity, verification and recency. Superseded records are omitted
unless explicitly requested. The server bounds serialized results again.

`process_sync_event(id)` accepts the submitting authorized actor or a trusted
worker role. `drain_sync_events()` and `apply_retention()` require the privileged
worker role. Pending payloads contain only screened facts and are discarded on
completion or terminal failure. Five attempts use bounded exponential backoff.
Failed/finished events are deleted after 30 days, sessions after 90 days, and
pending events older than seven days are terminally discarded. Working facts use
the brain's configured retention; established facts persist until deletion.

Auth user records belong to Supabase Auth; this schema does not create a personal
profile table. RLS never reads client-controlled role metadata. Grant only the
explicit wrapper functions; never expose `private` via Data API schemas.
