import { useCallback, useEffect, useState, type FormEvent } from "react";
import type {
  Brain,
  Membership,
  Memory,
  SyncEvent,
} from "../../../packages/core/src/schemas.js";
import type { Api } from "./api.js";
import { MemoryList } from "./MemoryList.js";
import { MemoryEditor } from "./MemoryEditor.js";
type Tab = "memories" | "members" | "activity" | "sync" | "integrations";
interface Revision {
  version: number;
  created_at: string;
  snapshot: {
    content: string;
    status: string;
    source?: { file?: string; commit?: string };
  };
}
export function Workspace({
  brain,
  actorId,
  api,
  onDeleted,
}: {
  brain: Brain;
  actorId: string;
  api: Api;
  onDeleted: () => void;
}) {
  const [tab, setTab] = useState<Tab>("memories"),
    [members, setMembers] = useState<Membership[]>([]),
    [memories, setMemories] = useState<Memory[]>([]);
  const [query, setQuery] = useState(""),
    [layer, setLayer] = useState(""),
    [status, setStatus] = useState("");
  const [events, setEvents] = useState<SyncEvent[]>([]),
    [activity, setActivity] = useState<
      Array<{ id: string; topic: string; status: string; updated_at: string }>
    >([]);
  const [reports, setReports] = useState<
    Array<{
      id: string;
      memory_id: string;
      reason: string;
      request_deletion: boolean;
    }>
  >([]);
  const [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [editor, setEditor] = useState<Memory | "new" | null>(null),
    [history, setHistory] = useState<{
      memory: Memory;
      revisions: Revision[];
    } | null>(null);
  const [memberId, setMemberId] = useState(""),
    [memberRole, setMemberRole] = useState("member"),
    [retention, setRetention] = useState(90);
  const [reporting, setReporting] = useState<Memory | null>(null),
    [reportReason, setReportReason] = useState("incorrect"),
    [requestDeletion, setRequestDeletion] = useState(false);
  const admin = members.some(
    (m) => m.actor_id === actorId && m.role === "admin",
  );
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setBusy(true);
      setError("");
      try {
        const [info, found] = await Promise.all([
          api<{
            brain: Brain & { retention_days: number };
            members: Membership[];
          }>(`/brains/${brain.id}`, undefined, signal),
          api<{ memories: Memory[] }>(
            "/search",
            {
              brain_id: brain.id,
              query,
              ...(layer ? { layer } : {}),
              ...(status ? { status } : {}),
              limit: 30,
              token_budget: 8000,
            },
            signal,
          ),
        ]);
        if (signal?.aborted) return;
        setMembers(info.members);
        setMemories(found.memories);
        setRetention(info.brain.retention_days);
      } catch (e) {
        if (!signal?.aborted) {
          setMembers([]);
          setMemories([]);
          setError(e instanceof Error ? e.message : "Unable to load brain.");
        }
      } finally {
        if (!signal?.aborted) setBusy(false);
      }
    },
    [api, brain.id, query, layer, status],
  );
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void load(controller.signal);
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load]);
  useEffect(() => {
    const controller = new AbortController();
    if (tab === "sync")
      void api<{ events: SyncEvent[] }>(
        `/brains/${brain.id}/sync`,
        undefined,
        controller.signal,
      )
        .then((v) => {
          if (!controller.signal.aborted) setEvents(v.events);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(String(e.message));
        });
    if (tab === "activity")
      void api<{ activity: typeof activity }>(
        `/brains/${brain.id}/activity`,
        undefined,
        controller.signal,
      )
        .then((v) => {
          if (!controller.signal.aborted) setActivity(v.activity);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(String(e.message));
        });
    if (tab === "memories" && admin)
      void api<{ reports: typeof reports }>(
        `/brains/${brain.id}/reports`,
        undefined,
        controller.signal,
      )
        .then((v) => {
          if (!controller.signal.aborted) setReports(v.reports);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(String(e.message));
        });
    return () => controller.abort();
  }, [api, brain.id, tab, admin]);
  async function action(name: string, payload: Record<string, unknown>) {
    try {
      await api("/actions", {
        action: name,
        payload: { brain_id: brain.id, ...payload },
      });
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
      return false;
    }
  }
  async function inspect(memory: Memory) {
    setError("");
    try {
      const data = await api<{ revisions: Revision[] }>(
        `/memories/${memory.id}/history?brain_id=${brain.id}`,
      );
      setHistory({ memory, revisions: data.revisions });
    } catch (e) {
      setError(e instanceof Error ? e.message : "History unavailable.");
    }
  }
  async function report(e: FormEvent) {
    e.preventDefault();
    if (!reporting) return;
    if (
      await action("report_memory", {
        memory_id: reporting.id,
        reason: reportReason,
        request_deletion: requestDeletion,
      })
    ) {
      setReporting(null);
      setError("Report submitted for admin review.");
    }
  }
  async function addMember(e: FormEvent) {
    e.preventDefault();
    if (await action("set_member", { actor_id: memberId, role: memberRole }))
      setMemberId("");
  }
  async function resolveConflict(memory: Memory) {
    const others = memories.filter(
      (m) =>
        m.topic === memory.topic &&
        m.id !== memory.id &&
        m.status !== "superseded",
    );
    if (others.length !== 1) {
      setError(
        "Filter by this topic and load the conflicting records before resolving.",
      );
      return;
    }
    if (
      window.confirm("Approve this proposal and supersede the previous fact?")
    )
      await action("resolve_conflict", {
        memory_id: memory.id,
        superseded_memory_id: others[0]!.id,
        expected_version: memory.version,
        expected_superseded_version: others[0]!.version,
      });
  }
  return (
    <>
      <header className="workspace-header">
        <div>
          <div className="eyebrow">
            {brain.is_global ? "STUDIO KNOWLEDGE" : "PROJECT BRAIN"}
          </div>
          <h1>{brain.name}</h1>
          <p>
            {brain.overview ||
              "A private workspace for shared project knowledge."}
          </p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setEditor("new");
            setTab("memories");
          }}
        >
          + Add memory
        </button>
      </header>
      <div className="stats">
        <div>
          <span>{memories.length}</span>
          <p>Retrieved memories</p>
        </div>
        <div>
          <span>{memories.filter((m) => m.status === "verified").length}</span>
          <p>Verified facts</p>
        </div>
        <div>
          <span>{memories.filter((m) => m.status === "disputed").length}</span>
          <p>Proposals to review</p>
        </div>
        <div>
          <span>{members.length}</span>
          <p>Project members</p>
        </div>
      </div>
      <nav className="tabs" aria-label="Brain administration">
        {(
          ["memories", "members", "activity", "sync", "integrations"] as Tab[]
        ).map((t) => (
          <button
            key={t}
            aria-current={tab === t ? "page" : undefined}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t === "sync"
              ? "Synchronization"
              : t[0]!.toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>
      {error ? (
        <div className="error banner" role="alert">
          {error}
          <button
            className="text-button"
            onClick={() => setError("")}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      ) : null}
      {tab === "memories" ? (
        <>
          {reporting ? (
            <form className="panel" onSubmit={(e) => void report(e)}>
              <h2>Report · {reporting.topic}</h2>
              <label>
                Reason
                <select
                  aria-label="Report reason"
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                >
                  <option value="incorrect">Incorrect</option>
                  <option value="personal_information">Personal data</option>
                  <option value="secret">Sensitive information</option>
                  <option value="prompt_injection">
                    Suspicious instructions
                  </option>
                  <option value="unrelated">Unrelated</option>
                </select>
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={requestDeletion}
                  onChange={(e) => setRequestDeletion(e.target.checked)}
                />
                Request permanent deletion
              </label>
              <button className="primary">Submit report</button>
              <button type="button" onClick={() => setReporting(null)}>
                Cancel report
              </button>
            </form>
          ) : null}
          {editor ? (
            <MemoryEditor
              key={editor === "new" ? "new" : `${editor.id}:${editor.version}`}
              brainId={brain.id}
              {...(editor === "new" ? {} : { memory: editor })}
              admin={admin}
              api={api}
              onSaved={() => {
                setEditor(null);
                void load();
              }}
              onCancel={() => setEditor(null)}
            />
          ) : null}
          <div className="search-bar">
            <label className="search">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="Search project memories"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search architecture, decisions, discoveries…"
              />
            </label>
            <select
              aria-label="Knowledge layer"
              value={layer}
              onChange={(e) => setLayer(e.target.value)}
            >
              <option value="">All knowledge</option>
              <option value="working">Working</option>
              <option value="established">Established</option>
            </select>
            <select
              aria-label="Verification status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Active memories</option>
              <option value="disputed">Disputed</option>
              <option value="verified">Verified</option>
              <option value="unverified">Unverified</option>
              <option value="superseded">Superseded</option>
            </select>
          </div>
          <div className="list-heading">
            <h2>Shared knowledge</h2>
            <span className="muted">Only this brain · ranked search</span>
          </div>
          {busy ? (
            <p className="loading" role="status">
              Loading project knowledge…
            </p>
          ) : (
            <MemoryList
              memories={memories}
              admin={admin}
              onEdit={setEditor}
              onInspect={(m) => void inspect(m)}
              onDelete={(m) => {
                if (
                  window.confirm(
                    "Delete this memory, its sources and all revisions?",
                  )
                )
                  void action("delete_memory", { memory_id: m.id });
              }}
              onReport={(m) => {
                setReporting(m);
                setReportReason("incorrect");
                setRequestDeletion(false);
              }}
            />
          )}
          {admin && memories.some((m) => m.status === "disputed") ? (
            <section className="panel">
              <h2>Conflict review</h2>
              <p className="muted">
                A proposal never replaces an established fact without your
                approval.
              </p>
              {memories
                .filter((m) => m.status === "disputed")
                .map((m) => (
                  <div className="table-row" key={m.id}>
                    <span>{m.topic}</span>
                    <button onClick={() => void resolveConflict(m)}>
                      Approve & supersede
                    </button>
                  </div>
                ))}
            </section>
          ) : null}
          {admin && reports.length ? (
            <section className="panel">
              <h2>Memory reports</h2>
              {reports.map((r) => (
                <div className="table-row" key={r.id}>
                  <span>
                    {r.reason.replaceAll("_", " ")}{" "}
                    {r.request_deletion ? "· deletion requested" : ""}
                    <code>{r.memory_id}</code>
                  </span>
                  <button
                    className="danger-text"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Permanently purge the reported memory and its history?",
                        )
                      )
                        void action("delete_memory", {
                          memory_id: r.memory_id,
                        }).then((ok) => {
                          if (ok)
                            setReports((rows) =>
                              rows.filter((x) => x.memory_id !== r.memory_id),
                            );
                        });
                    }}
                  >
                    Delete reported memory
                  </button>
                </div>
              ))}
            </section>
          ) : null}
          {history ? (
            <section className="panel">
              <div className="section-heading">
                <h2>History · {history.memory.topic}</h2>
                <button onClick={() => setHistory(null)}>Close history</button>
              </div>
              {history.revisions.map((r) => (
                <article className="revision" key={r.version}>
                  <div className="muted">
                    v{r.version} · {r.snapshot.status} ·{" "}
                    {new Date(r.created_at).toLocaleString()}
                  </div>
                  <p>{r.snapshot.content}</p>
                  {r.snapshot.source?.file ? (
                    <code>{r.snapshot.source.file}</code>
                  ) : null}
                  {r.snapshot.source?.commit ? (
                    <code>{r.snapshot.source.commit}</code>
                  ) : null}
                </article>
              ))}
            </section>
          ) : null}
        </>
      ) : null}
      {tab === "members" ? (
        <section className="panel">
          <h2>Explicit access</h2>
          <p className="muted">
            Membership applies only to this brain. Use the opaque user UUID from
            Supabase Auth.
          </p>
          {members.map((m) => (
            <div className="table-row" key={m.actor_id}>
              <code>
                {m.actor_id}
                {m.actor_id === actorId ? " (you)" : ""}
              </code>
              <span className="badge">{m.role}</span>
              {admin ? (
                <>
                  <button
                    onClick={() =>
                      void action("set_member", {
                        actor_id: m.actor_id,
                        role: m.role === "admin" ? "member" : "admin",
                      })
                    }
                  >
                    Make {m.role === "admin" ? "member" : "admin"}
                  </button>
                  <button
                    className="danger-text"
                    onClick={() => {
                      if (window.confirm("Revoke this brain membership?"))
                        void action("remove_member", { actor_id: m.actor_id });
                    }}
                  >
                    Revoke
                  </button>
                </>
              ) : null}
            </div>
          ))}
          {admin ? (
            <form className="inline-form" onSubmit={addMember}>
              <label>
                Developer UUID
                <input
                  required
                  value={memberId}
                  onChange={(e) => setMemberId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </label>
              <label>
                Role
                <select
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value)}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <button className="primary">Grant access</button>
            </form>
          ) : null}
          {admin ? (
            <div className="danger-zone">
              <h3>Delete brain</h3>
              <p>
                Permanent deletion includes memories, members, revisions and
                sync jobs.
              </p>
              <button
                className="danger"
                onClick={() => {
                  if (
                    window.confirm(
                      `Permanently delete ${brain.name} and all project knowledge?`,
                    )
                  )
                    void action("delete_brain", {}).then((ok) => {
                      if (ok) onDeleted();
                    });
                }}
              >
                Delete this brain
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
      {tab === "activity" ? (
        <section className="panel">
          <h2>Recent project activity</h2>
          {activity.length ? (
            activity.map((a) => (
              <div className="table-row" key={a.id}>
                <span>{a.topic}</span>
                <span className={`badge ${a.status}`}>{a.status}</span>
                <time>{new Date(a.updated_at).toLocaleString()}</time>
              </div>
            ))
          ) : (
            <p className="muted">No development activity recorded yet.</p>
          )}
        </section>
      ) : null}
      {tab === "sync" ? (
        <section className="panel">
          <div className="section-heading">
            <h2>Synchronization</h2>
            <button
              onClick={() =>
                void api<{ events: SyncEvent[] }>(`/brains/${brain.id}/sync`)
                  .then((v) => setEvents(v.events))
                  .catch((e) => setError(e.message))
              }
            >
              Refresh status
            </button>
          </div>
          <p className="muted">
            Only sanitized project facts enter the queue. Completed payloads are
            discarded.
          </p>
          {events.length ? (
            events.map((e) => (
              <div className="table-row" key={e.id}>
                <code>{e.id.slice(0, 8)}</code>
                <span className={`badge ${e.status}`}>{e.status}</span>
                <span>{e.attempts} attempts</span>
                <span>{e.error_code ?? "—"}</span>
              </div>
            ))
          ) : (
            <div className="empty">
              <h3>No sync events yet</h3>
              <p>Enroll a workspace from the Integrations tab.</p>
            </div>
          )}
          {admin ? (
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                void action("set_retention", { retention_days: retention });
              }}
            >
              <label>
                Working knowledge retention (days)
                <input
                  type="number"
                  min={7}
                  max={3650}
                  value={retention}
                  onChange={(e) => setRetention(Number(e.target.value))}
                />
              </label>
              <button>Save retention</button>
            </form>
          ) : null}
        </section>
      ) : null}
      {tab === "integrations" ? (
        <section className="panel integration">
          <div className="eyebrow">YOUR ASSISTANTS, SHARED CONTEXT</div>
          <h2>Connect this brain</h2>
          <p>
            Enroll an approved repository, install its hook configuration, and
            give the assistant the project-memory instructions.
          </p>
          <label>
            Brain ID<code className="code-block">{brain.id}</code>
          </label>
          <h3>1. Enroll a project workspace</h3>
          <pre>
            node /path/to/hivemind/dist/packages/integrations/src/cli.js
            --enroll --root /path/to/game --brain {brain.id} --server
            https://your-hivemind-host
          </pre>
          <h3>2. Configure your coding assistant</h3>
          <p>
            Copy the matching configuration from{" "}
            <code>integrations/claude-code</code>,{" "}
            <code>integrations/cursor</code>, or{" "}
            <code>integrations/vscode</code>. Set the hook command to the built
            CLI and supply your short-lived Supabase access token through the
            local environment.
          </p>
          <h3>3. Let project notes sync</h3>
          <p>
            Assistant instructions maintain <code>.hivemind/notes.json</code>.
            Hooks upload those screened notes at task boundaries and retrieve
            project context at session start. They never read chat histories.
          </p>
          <div className="compat-grid">
            <div>
              <strong>Claude Code</strong>
              <span>Lifecycle hooks + MCP</span>
            </div>
            <div>
              <strong>Cursor</strong>
              <span>Lifecycle hooks + MCP</span>
            </div>
            <div>
              <strong>VS Code</strong>
              <span>Local harness hooks + MCP</span>
            </div>
            <div>
              <strong>ChatGPT / Claude chat</strong>
              <span>MCP tools · setup dependent</span>
            </div>
          </div>
          <p className="muted">
            Client UI connections require testing in your installed version.
            Chat clients do not guarantee automatic synchronization. OAuth-only
            connections need a configured authorization server.
          </p>
        </section>
      ) : null}
    </>
  );
}
