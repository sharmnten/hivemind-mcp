import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  symlink,
  writeFile,
  utimes,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enroll, runHook } from "../packages/integrations/src/hook.js";
const brain_id = "44444444-4444-4444-8444-444444444444";
const fact = {
  topic: "inventory authority",
  content: "Inventory data is authoritative on the server.",
  type: "architecture",
  provenance: "team_decision",
};
const roots: string[] = [];
async function workspace() {
  const root = await mkdtemp(join(tmpdir(), "mio-hook-"));
  roots.push(root);
  await enroll(root, { brain_id, server_url: "http://127.0.0.1:3000" });
  await writeFile(
    join(root, ".hivemind/notes.json"),
    JSON.stringify({ facts: [fact] }),
  );
  return root;
}
// Leave temporary fixtures to the OS; never delete user workspace paths.
afterEach(() => {
  roots.length = 0;
});
describe("enrolled workspace capture", () => {
  it("ignores unenrolled workspaces without a network request", async () => {
    const root = await mkdtemp(join(tmpdir(), "mio-unenrolled-"));
    let calls = 0;
    const result = await runHook({
      root,
      client: "claude-code",
      event: "task_completed",
      input: {
        cwd: root,
        transcript_path: "/private/transcript",
        last_assistant_message: "My private life",
      },
      token: "token",
      fetcher: async () => {
        calls++;
        return new Response("{}");
      },
    });
    expect(result.status).toBe("not_enrolled");
    expect(calls).toBe(0);
  });
  it("uploads sanitized facts automatically and excludes the conversation and absolute paths", async () => {
    const root = await workspace();
    let submitted = "";
    const result = await runHook({
      root,
      client: "claude-code",
      event: "task_completed",
      input: {
        cwd: root,
        session_id: "session-a",
        transcript_path: "/private/transcript",
        last_assistant_message: "My wife is pregnant.",
      },
      token: "token",
      fetcher: async (_url, init) => {
        submitted = String(init?.body);
        return new Response('{"id":"44444444-4444-4444-8444-444444444444"}', {
          status: 202,
        });
      },
    });
    expect(result.status).toBe("synced");
    expect(JSON.parse(submitted)).toMatchObject({
      brain_id,
      client: "claude-code",
      facts: [fact],
    });
    expect(submitted).not.toContain(root);
    expect(submitted).not.toContain("wife");
    expect(submitted).not.toContain("transcript");
  });
  it("denies sensitive notes locally before sending any facts", async () => {
    const root = await workspace();
    let calls = 0;
    await writeFile(
      join(root, ".hivemind/notes.json"),
      JSON.stringify({
        facts: [{ ...fact, content: "The server password is hunter2." }],
      }),
    );
    await expect(
      runHook({
        root,
        client: "cursor",
        event: "decision",
        input: { workspace_roots: [root] },
        token: "token",
        fetcher: async () => {
          calls++;
          return new Response("{}");
        },
      }),
    ).rejects.toThrow("PRIVACY_REJECTED");
    expect(calls).toBe(0);
  });
  it("rejects a symlinked notes file and mismatched workspace roots", async () => {
    const root = await workspace();
    const other = await mkdtemp(join(tmpdir(), "mio-other-"));
    const config = JSON.parse(
      await readFile(join(root, ".hivemind/config.json"), "utf8"),
    ) as Record<string, unknown>;
    config.notes_file = ".hivemind/link.json";
    await writeFile(
      join(root, ".hivemind/config.json"),
      JSON.stringify(config),
    );
    await writeFile(
      join(other, "private.json"),
      JSON.stringify({ facts: [fact] }),
    );
    await symlink(
      join(other, "private.json"),
      join(root, ".hivemind/link.json"),
    );
    await expect(
      runHook({
        root,
        client: "cursor",
        event: "decision",
        input: { workspace_roots: [root] },
        token: "token",
      }),
    ).rejects.toThrow();
    await expect(
      runHook({
        root,
        client: "cursor",
        event: "decision",
        input: { workspace_roots: [other] },
        token: "token",
      }),
    ).rejects.toThrow("WORKSPACE_MISMATCH");
  });
  it("queues only sanitized payloads, retries transient failures and preserves idempotency", async () => {
    const root = await workspace();
    let attempts = 0;
    const bodies: string[] = [];
    const args = {
      root,
      client: "claude-code" as const,
      event: "task_completed" as const,
      input: { cwd: root, session_id: "a" },
      token: "token",
    };
    const first = await runHook({
      ...args,
      retryDelayMs: 0,
      fetcher: async (_u, init) => {
        attempts++;
        bodies.push(String(init?.body));
        return new Response("{}", { status: 503 });
      },
    });
    expect(first.status).toBe("queued");
    expect(attempts).toBe(3);
    const entries = await readdir(join(root, ".hivemind/local/queue"));
    expect(entries).toHaveLength(1);
    expect(
      await readFile(join(root, ".hivemind/local/queue", entries[0]!), "utf8"),
    ).not.toContain("token");
    const second = await runHook({
      ...args,
      retryDelayMs: 0,
      fetcher: async (_u, init) => {
        bodies.push(String(init?.body));
        return new Response("{}", { status: 202 });
      },
    });
    expect(second.status).toBe("synced");
    expect(
      new Set(
        bodies.map((b) => (JSON.parse(b) as { event_key: string }).event_key),
      ).size,
    ).toBe(1);
    expect(await readdir(join(root, ".hivemind/local/queue"))).toHaveLength(0);
  });
  it("retrieves context at session start in the correct client output format", async () => {
    const root = await workspace();
    const result = await runHook({
      root,
      client: "claude-code",
      event: "session_start",
      input: { cwd: root, session_id: "a" },
      token: "token",
      fetcher: async (_url, init) =>
        new Response(
          JSON.stringify(
            init?.method === "POST"
              ? { id: brain_id }
              : { memories: [fact], untrusted_data: true },
          ),
          { status: init?.method === "POST" ? 202 : 200 },
        ),
    });
    expect(result.output).toMatchObject({
      hookSpecificOutput: { hookEventName: "SessionStart" },
    });
    expect(JSON.stringify(result.output)).toContain(fact.content);
  });
  it("does not follow an insecure remote endpoint or nested unapproved workspace", async () => {
    const root = await workspace();
    await mkdir(join(root, "child"));
    await expect(
      enroll(root, { brain_id, server_url: "http://remote.example" }),
    ).rejects.toThrow("HTTPS_REQUIRED");
    await expect(
      runHook({
        root,
        client: "vscode",
        event: "decision",
        input: { cwd: join(root, "child") },
        token: "token",
      }),
    ).rejects.toThrow("WORKSPACE_MISMATCH");
    await expect(
      runHook({
        root,
        client: "cursor",
        event: "decision",
        input: { cwd: join(root, "child"), workspace_roots: [root] },
        token: "token",
      }),
    ).rejects.toThrow("WORKSPACE_MISMATCH");
  });
  it("refuses enrollment when the existing notes file is a symlink", async () => {
    const root = await mkdtemp(join(tmpdir(), "mio-enroll-symlink-"));
    await mkdir(join(root, ".hivemind"));
    const other = await mkdtemp(join(tmpdir(), "mio-enroll-other-"));
    await writeFile(
      join(other, "notes.json"),
      JSON.stringify({ facts: [fact] }),
    );
    await symlink(
      join(other, "notes.json"),
      join(root, ".hivemind/notes.json"),
    );
    await expect(
      enroll(root, { brain_id, server_url: "http://127.0.0.1:3000" }),
    ).rejects.toThrow();
  });
  it("recovers a stale flush lease after a crashed hook", async () => {
    const root = await workspace();
    let calls = 0;
    await mkdir(join(root, ".hivemind/local"));
    const lock = join(root, ".hivemind/local/flush.lock");
    await mkdir(lock);
    const past = new Date(Date.now() - 120000);
    await utimes(lock, past, past);
    const result = await runHook({
      root,
      client: "cursor",
      event: "decision",
      input: { cwd: root },
      token: "token",
      fetcher: async () => {
        calls++;
        return new Response("{}", { status: 202 });
      },
    });
    expect(result.status).toBe("synced");
    expect(calls).toBe(1);
  });
  it("prunes expired queue entries before applying the queue capacity limit", async () => {
    const root = await workspace();
    await mkdir(join(root, ".hivemind/local"));
    await mkdir(join(root, ".hivemind/local/queue"));
    const queue = join(root, ".hivemind/local/queue"),
      past = new Date(Date.now() - 8 * 86400000);
    for (let i = 0; i < 128; i++) {
      const file = join(queue, `${i.toString(16).padStart(64, "0")}.json`);
      await writeFile(file, "{}");
      await utimes(file, past, past);
    }
    const result = await runHook({
      root,
      client: "cursor",
      event: "decision",
      input: { cwd: root },
    });
    expect(result.status).toBe("queued");
    expect(await readdir(queue)).toHaveLength(1);
  });
});
