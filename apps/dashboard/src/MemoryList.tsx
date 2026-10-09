import type { Memory } from "../../../packages/core/src/schemas.js";
interface Props {
  memories: Memory[];
  admin: boolean;
  onEdit: (m: Memory) => void;
  onInspect: (m: Memory) => void;
  onDelete: (m: Memory) => void;
  onReport: (m: Memory) => void;
}
export function MemoryList({
  memories,
  admin,
  onEdit,
  onInspect,
  onDelete,
  onReport,
}: Props) {
  if (!memories.length)
    return (
      <div className="empty">
        <span className="empty-symbol">◇</span>
        <h3>No memories here yet</h3>
        <p>
          Add a project fact or connect an enrolled workspace to start sharing
          knowledge.
        </p>
      </div>
    );
  return (
    <div className="memory-list">
      {memories.map((memory) => (
        <article className="memory-card" key={memory.id}>
          <div className="card-meta">
            <span className={`badge ${memory.status}`}>{memory.status}</span>
            <span>{memory.type.replaceAll("_", " ")}</span>
            <span className="card-layer">{memory.layer}</span>
          </div>
          <h3>{memory.topic}</h3>
          <p className="memory-content">{memory.content}</p>
          <div className="source-line">
            <span>{memory.provenance.replaceAll("_", " ")}</span>
            {memory.source?.file ? <code>{memory.source.file}</code> : null}
            {memory.source?.commit ? (
              <code>{memory.source.commit.slice(0, 7)}</code>
            ) : null}
          </div>
          <footer>
            <span className="muted">
              v{memory.version} ·{" "}
              {new Date(memory.updated_at).toLocaleDateString()}
            </span>
            <div className="card-actions">
              <button className="text-button" onClick={() => onInspect(memory)}>
                History
              </button>
              {admin || memory.layer === "working" ? (
                <button className="text-button" onClick={() => onEdit(memory)}>
                  Edit
                </button>
              ) : null}
              <button className="text-button" onClick={() => onReport(memory)}>
                Report
              </button>
              {admin ? (
                <button
                  className="text-button danger-text"
                  onClick={() => onDelete(memory)}
                >
                  Delete
                </button>
              ) : null}
            </div>
          </footer>
        </article>
      ))}
    </div>
  );
}
