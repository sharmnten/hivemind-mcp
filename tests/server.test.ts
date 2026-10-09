import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { request as httpRequest } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "../apps/server/src/app.js";
import { validateClaims } from "../apps/server/src/auth.js";
import { HivemindService } from "../apps/server/src/service.js";
import { ADMIN, MEMBER, OUTSIDER, database } from "./helpers/database.js";
import { pgRepository } from "./helpers/repository.js";
import type { PGlite } from "@electric-sql/pglite";
let db: PGlite, server: Server, url: string;
const fact = {
  topic: "inventory authority",
  content: "Inventory data is authoritative on the server.",
  type: "architecture",
  provenance: "team_decision",
};
beforeAll(async () => {
  db = await database();
  const app = createApp({
    publicUrl: "http://127.0.0.1:3000",
    allowedOrigins: ["http://localhost:5173"],
    authenticate: async (token) => {
      const actor = (
        {
          "admin-token": ADMIN,
          "member-token": MEMBER,
          "outsider-token": OUTSIDER,
        } as Record<string, string>
      )[token];
      if (!actor) return null;
      return { actorId: actor, repository: pgRepository(db, actor) };
    },
    ready: async () => true,
    browserConfig: {
      supabaseUrl: "http://127.0.0.1:54321",
      supabasePublishableKey: "local-publishable-test-only",
    },
    rateLimit: 200,
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing address");
  url = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  if (server?.listening)
    await new Promise<void>((r) => server.close(() => r()));
  await db?.close();
});
async function post(path: string, body: unknown, token = "admin-token") {
  return fetch(url + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}
describe("remote server boundaries", () => {
  it("returns newest memories ahead of older verified facts in recent retrieval", async () => {
    const service = new HivemindService(ADMIN, pgRepository(db, ADMIN));
    const brain = await service.mutate("create_brain", { name: "Recent Game" });
    const brain_id = String(brain.id);
    const older = await service.mutate("write_memory", { brain_id, ...fact });
    await service.mutate("update_memory", {
      brain_id,
      memory_id: older.id,
      expected_version: 1,
      ...fact,
      promote: true,
    });
    await db.query(
      "update public.memories set updated_at=now()-interval '1 day' where id=$1",
      [older.id],
    );
    const newer = await service.mutate("write_memory", {
      brain_id,
      ...fact,
      topic: "combat state machine",
      content: "The combat system uses a state machine.",
    });
    const recent = await service.recent(brain_id);
    expect(recent.memories[0]?.id).toBe(newer.id);
  });
  it("requires individual authentication and rejects hostile origins and hosts", async () => {
    expect((await fetch(url + "/api/brains")).status).toBe(401);
    expect(
      (
        await fetch(url + "/api/brains", {
          headers: { Authorization: "Bearer invalid" },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await fetch(url + "/api/brains", {
          headers: {
            Authorization: "Bearer admin-token",
            Origin: "https://evil.invalid",
          },
        })
      ).status,
    ).toBe(403);
    const hostileHost = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        url + "/api/brains",
        {
          headers: {
            Authorization: "Bearer admin-token",
            Host: "evil.invalid",
          },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode!);
        },
      );
      req.on("error", reject);
      req.end();
    });
    expect(hostileHost).toBe(403);
    expect((await fetch(url + "/health")).status).toBe(200);
    const policy = (await fetch(url + "/health")).headers.get(
      "Content-Security-Policy",
    );
    expect(policy).toContain("connect-src 'self' http://127.0.0.1:54321;");
    expect(policy).not.toContain("https://*.supabase.co");
  });
  it("checks expiration, subject, issuer and resource audience after token verification", () => {
    const base = {
      sub: ADMIN,
      iss: "https://project.supabase.co/auth/v1",
      aud: "https://memory.example/mcp",
      exp: Math.floor(Date.now() / 1000) + 60,
    };
    expect(validateClaims(base, ADMIN, base.iss, base.aud)).toBe(true);
    expect(validateClaims({ ...base, exp: 1 }, ADMIN, base.iss, base.aud)).toBe(
      false,
    );
    expect(
      validateClaims(
        { ...base, aud: "authenticated" },
        ADMIN,
        base.iss,
        base.aud,
      ),
    ).toBe(false);
    expect(
      validateClaims({ ...base, sub: OUTSIDER }, ADMIN, base.iss, base.aud),
    ).toBe(false);
    expect(
      validateClaims(
        { ...base, is_anonymous: true },
        ADMIN,
        base.iss,
        base.aud,
      ),
    ).toBe(false);
  });
  it("returns only stable error codes without echoing submitted private data", async () => {
    const res = await post("/api/actions", {
      action: "create_brain",
      payload: { name: "My home address" },
    });
    expect(res.status).toBe(422);
    expect(await res.text()).not.toContain("My home address");
    const malformed = await fetch(url + "/api/actions", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: '{"private',
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.text()).not.toContain("private");
  });
  it("connects a real MCP SDK client and shares a queued decision across actors", async () => {
    const created = (await (
      await post("/api/actions", {
        action: "create_brain",
        payload: {
          name: "Cross Client Game",
          overview: "Game inventory architecture.",
        },
      })
    ).json()) as { id: string };
    const brain_id = created.id;
    expect(brain_id).toBeTruthy();
    await post("/api/actions", {
      action: "set_member",
      payload: { brain_id, actor_id: MEMBER, role: "member" },
    });
    const sync = await post(
      "/api/sync",
      {
        brain_id,
        event_key: "c".repeat(64),
        session_key: "d".repeat(64),
        client: "claude-code",
        event: "task_completed",
        facts: [fact],
      },
      "member-token",
    );
    expect(sync.status).toBe(202);
    const event = (await sync.json()) as { id: string };
    const status = await fetch(
      `${url}/api/sync/${event.id}?brain_id=${brain_id}`,
      { headers: { Authorization: "Bearer member-token" } },
    );
    expect(await status.json()).toMatchObject({ status: "completed" });
    const client = new Client({
      name: "developer-b-cursor-test",
      version: "1.0.0",
    });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(url + "/mcp"), {
        requestInit: { headers: { Authorization: "Bearer admin-token" } },
      }),
    );
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name)).toEqual(
        expect.arrayContaining([
          "list_brains",
          "select_brain",
          "search_memories",
          "write_memory",
          "get_memory_history",
          "create_handoff",
          "request_memory_deletion",
        ]),
      );
      const result = await client.callTool({
        name: "search_memories",
        arguments: { brain_id, query: "inventory server" },
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        untrusted_data: true,
        memories: [{ content: fact.content, status: "unverified" }],
      });
      const invalid = await client.callTool({
        name: "write_memory",
        arguments: {
          brain_id: "44444444-4444-4444-8444-444444444444",
          ...fact,
        },
      });
      expect(invalid.isError).toBe(true);
      expect(invalid.structuredContent).toMatchObject({
        success: false,
        error: "FORBIDDEN",
      });
    } finally {
      await client.close();
    }
  });
  it("keeps selection explicit and does not leak studio global by inheritance", async () => {
    const admin = new HivemindService(ADMIN, pgRepository(db, ADMIN));
    const outsider = new HivemindService(OUTSIDER, pgRepository(db, OUTSIDER));
    const brain = await admin.mutate("create_brain", {
      name: "Studio Global",
      is_global: true,
    });
    await expect(outsider.context(String(brain.id), 1000)).rejects.toThrow(
      "FORBIDDEN",
    );
  });
});
