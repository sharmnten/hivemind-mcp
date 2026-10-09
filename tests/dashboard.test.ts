import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { MemoryList } from "../apps/dashboard/src/MemoryList.js";
import type { Memory } from "../packages/core/src/schemas.js";
const memory: Memory = {
  id: "1",
  brain_id: "brain",
  topic: "inventory authority",
  content: "Inventory is authoritative on the server. <script>bad()</script>",
  type: "architecture",
  provenance: "team_decision",
  layer: "established",
  status: "verified",
  version: 2,
  created_at: "2026-10-08T00:00:00Z",
  updated_at: "2026-10-08T00:00:00Z",
  actor_id: "actor",
  source: { file: "src/Inventory.luau", commit: "abc1234" },
};
const noop = () => {};
describe("memory administration controls", () => {
  it("escapes stored content and displays verification and provenance", () => {
    const markup = renderToStaticMarkup(
      createElement(MemoryList, {
        memories: [memory],
        admin: false,
        onEdit: noop,
        onInspect: noop,
        onDelete: noop,
        onReport: noop,
      }),
    );
    expect(markup).not.toContain("<script>");
    expect(markup).toContain("&lt;script&gt;");
    expect(markup).toContain("verified");
    expect(markup).toContain("team decision");
    expect(markup).toContain("src/Inventory.luau");
  });
  it("does not offer established edits or deletion to a member", () => {
    const markup = renderToStaticMarkup(
      createElement(MemoryList, {
        memories: [memory],
        admin: false,
        onEdit: noop,
        onInspect: noop,
        onDelete: noop,
        onReport: noop,
      }),
    );
    expect(markup).not.toContain(">Edit<");
    expect(markup).not.toContain(">Delete<");
    expect(markup).toContain(">Report<");
  });
  it("offers explicit admin editing and deletion", () => {
    const markup = renderToStaticMarkup(
      createElement(MemoryList, {
        memories: [memory],
        admin: true,
        onEdit: noop,
        onInspect: noop,
        onDelete: noop,
        onReport: noop,
      }),
    );
    expect(markup).toContain(">Edit<");
    expect(markup).toContain(">Delete<");
  });
});
