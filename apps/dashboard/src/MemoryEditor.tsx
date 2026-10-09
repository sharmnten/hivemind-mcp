import { useState, type FormEvent } from "react";
import {
  memoryTypes,
  provenanceTypes,
  type Memory,
} from "../../../packages/core/src/schemas.js";
import type { Api } from "./api.js";
export function MemoryEditor({
  brainId,
  memory,
  admin,
  api,
  onSaved,
  onCancel,
}: {
  brainId: string;
  memory?: Memory;
  admin: boolean;
  api: Api;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [topic, setTopic] = useState(memory?.topic ?? ""),
    [content, setContent] = useState(memory?.content ?? "");
  const [type, setType] = useState(memory?.type ?? "technical_fact"),
    [provenance, setProvenance] = useState(
      memory?.provenance ?? "agent_assumption",
    );
  const [file, setFile] = useState(memory?.source?.file ?? ""),
    [commit, setCommit] = useState(memory?.source?.commit ?? "");
  const [promote, setPromote] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = {
        brain_id: brainId,
        topic,
        content,
        type,
        provenance,
        ...(file || commit
          ? {
              source: {
                ...(file ? { file } : {}),
                ...(commit ? { commit } : {}),
              },
            }
          : {}),
        ...(memory
          ? { memory_id: memory.id, expected_version: memory.version, promote }
          : {}),
      };
      await api("/actions", {
        action: memory ? "update_memory" : "write_memory",
        payload,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save memory.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="editor panel"
      aria-label={memory ? "Edit memory" : "New memory"}
    >
      <div className="section-heading">
        <h2>{memory ? "Edit project memory" : "Add project knowledge"}</h2>
        <button className="text-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className="muted">
        Save one technical fact. Personal details, secrets, and conversations
        are rejected.
      </p>
      <form onSubmit={save}>
        <label>
          Topic
          <input
            required
            minLength={3}
            maxLength={100}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="inventory authority"
            autoFocus
          />
        </label>
        <label>
          Project fact
          <textarea
            required
            minLength={10}
            maxLength={3000}
            rows={4}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Inventory data is authoritative on the server."
          />
        </label>
        <div className="form-grid">
          <label>
            Memory type
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
            >
              {memoryTypes.map((t) => (
                <option key={t} value={t}>
                  {t.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Provenance
            <select
              value={provenance}
              onChange={(e) =>
                setProvenance(e.target.value as typeof provenance)
              }
            >
              {provenanceTypes.map((t) => (
                <option key={t} value={t}>
                  {t.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Repository file
            <input
              value={file}
              maxLength={240}
              onChange={(e) => setFile(e.target.value)}
              placeholder="src/Inventory.server.luau"
            />
          </label>
          <label>
            Commit reference
            <input
              value={commit}
              pattern="[a-f0-9]{7,40}"
              onChange={(e) => setCommit(e.target.value)}
              placeholder="abc1234"
            />
          </label>
        </div>
        {memory && admin ? (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={promote}
              onChange={(e) => setPromote(e.target.checked)}
            />
            I verified this fact. Promote to established knowledge.
          </label>
        ) : null}
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="primary" disabled={busy}>
          {busy ? "Saving…" : memory ? "Save revision" : "Save memory"}
        </button>
      </form>
    </section>
  );
}
