import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { chromium } from "@playwright/test";
import { setTimeout as sleep } from "node:timers/promises";

// Requires operator-created disposable Auth fixtures, never real user passwords.
// This does not provision identities or disable email confirmation.
const path = process.argv[2];
assert(path, "Provide a private disposable-fixture file");
const fixture = JSON.parse(await readFile(path, "utf8")) as {
  url: string;
  publishableKey: string;
  password: string;
  users: Array<{ id: string; email: string }>;
};
assert.equal(
  fixture.url,
  process.env.SUPABASE_URL,
  "Fixtures must target the configured backend",
);
assert(
  fixture.users.length === 3 &&
    fixture.users.every((u) =>
      /^mio-verify-[a-f0-9-]+@example\.invalid$/.test(u.email),
    ),
  "Only disposable verification identities are allowed",
);
const url = "http://127.0.0.1:3000";
const clients = fixture.users.map(() =>
  createClient(fixture.url, fixture.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }),
);
const tokens: string[] = [];
let brain_id: string | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  for (let i = 0; i < clients.length; i++) {
    const signed = await clients[i]!.auth.signInWithPassword({
      email: fixture.users[i]!.email,
      password: fixture.password,
    });
    assert(!signed.error && signed.data.session, "Hosted Auth sign-in failed");
    assert.equal(signed.data.user!.id, fixture.users[i]!.id);
    tokens.push(signed.data.session.access_token);
    const verified = await clients[i]!.auth.getUser();
    assert(
      !verified.error && verified.data.user,
      "Hosted Auth verification failed",
    );
  }
  async function request(path: string, payload?: unknown, actor = 0) {
    const r = await fetch(url + path, {
      method: payload === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${tokens[actor]}`,
        ...(payload === undefined
          ? {}
          : { "Content-Type": "application/json" }),
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    return {
      status: r.status,
      data: (await r.json()) as Record<string, unknown>,
    };
  }
  async function action(
    name: string,
    payload: Record<string, unknown>,
    actor = 0,
  ) {
    return request("/api/actions", { action: name, payload }, actor);
  }
  assert.equal((await fetch(url + "/ready")).status, 200);
  const made = await action("create_brain", {
    name: "Hosted Verification Game",
    overview: "Game inventory architecture.",
  });
  assert.equal(made.status, 200);
  brain_id = String(made.data.id);
  assert.equal(
    (
      await action("set_member", {
        brain_id,
        actor_id: fixture.users[1]!.id,
        role: "member",
      })
    ).status,
    200,
  );
  const fact = {
    topic: "inventory authority",
    content: "Inventory data is authoritative on the server.",
    type: "architecture",
    provenance: "team_decision",
  };
  const { randomUUID, createHash } = await import("node:crypto");
  const hash = (s: string) => createHash("sha256").update(s).digest("hex");
  const sync = await request("/api/sync", {
    brain_id,
    event_key: hash(randomUUID()),
    session_key: hash(randomUUID()),
    client: "claude-code",
    event: "task_completed",
    facts: [fact],
  });
  assert.equal(sync.status, 202);
  const polled = await request(
    `/api/sync/${sync.data.id}?brain_id=${brain_id}`,
  );
  assert.equal(polled.status, 200);
  // Bypass the HTTP processor so only hosted Cron can recover this durable job.
  const queued = await clients[0]!.rpc("hivemind_mutate", {
    action: "enqueue_sync",
    payload: {
      brain_id,
      event_key: hash(randomUUID()),
      session_key: hash(randomUUID()),
      client: "cli",
      event: "task_completed",
      facts: [fact],
    },
  });
  assert(!queued.error && queued.data, "Unable to enqueue Cron recovery probe");
  const queuedId = (queued.data as { id: string }).id;
  let recovered = false;
  for (let i = 0; i < 45; i++) {
    const state = await clients[0]!
      .from("synchronization_events")
      .select("status")
      .eq("id", queuedId)
      .single();
    assert(!state.error, "Unable to inspect recovery probe");
    if (state.data.status === "completed") {
      recovered = true;
      break;
    }
    await sleep(1000);
  }
  assert(
    recovered,
    "Hosted Cron did not recover the queued job within 45 seconds",
  );
  const member = new Client({
    name: "hosted-member-verification",
    version: "1.0.0",
  });
  await member.connect(
    new StreamableHTTPClientTransport(new URL(url + "/mcp"), {
      requestInit: { headers: { Authorization: `Bearer ${tokens[1]}` } },
    }),
  );
  try {
    const result = await member.callTool({
      name: "search_memories",
      arguments: { brain_id, query: "inventory" },
    });
    assert(!result.isError);
    assert(JSON.stringify(result.structuredContent).includes(fact.content));
  } finally {
    await member.close();
  }
  assert.equal(
    (await request(`/api/brains/${brain_id}/context`, undefined, 2)).status,
    403,
  );
  const outsider = await clients[2]!
    .from("memories")
    .select("id")
    .eq("brain_id", brain_id);
  assert(!outsider.error);
  assert.deepEqual(outsider.data, []);
  const direct = await clients[2]!.rpc("hivemind_mutate", {
    action: "write_memory",
    payload: { brain_id, ...fact },
  });
  assert(direct.error?.message === "FORBIDDEN");
  const denied = await clients[0]!.rpc("hivemind_mutate", {
    action: "write_memory",
    payload: { brain_id, ...fact, content: "The server password is hunter2." },
  });
  assert(denied.error?.message === "PRIVACY_REJECTED");
  const records = await request("/api/search", {
    brain_id,
    query: "inventory",
  });
  const memory = (
    records.data.memories as Array<{ id: string; version: number }>
  )[0]!;
  assert(memory);
  const results = await Promise.all(
    [
      "The inventory server validates writes.",
      "The inventory server validates updates.",
    ].map((content) =>
      action("update_memory", {
        brain_id,
        memory_id: memory.id,
        expected_version: memory.version,
        ...fact,
        content,
      }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(url);
  await page.getByLabel("Studio email").fill(fixture.users[0]!.email);
  await page.getByLabel("Password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page
    .getByRole("heading", { name: "Hosted Verification Game", exact: true })
    .waitFor();
  await page
    .getByRole("heading", { name: "inventory authority", exact: true })
    .waitFor();
  console.log(
    JSON.stringify({
      backend: "hosted-supabase",
      status: "passed",
      checks: [
        "real Auth sign-in and getUser",
        "server readiness",
        "durable sync",
        "automatic Cron queue recovery",
        "MCP sharing across developers",
        "RLS outsider denial",
        "SQL privacy boundary",
        "multi-connection optimistic concurrency",
        "browser with real Auth",
      ],
    }),
  );
} finally {
  await browser?.close();
  if (brain_id && tokens[0])
    await fetch(url + "/api/actions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens[0]}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "delete_brain", payload: { brain_id } }),
    }).catch(() => {});
  for (const client of clients) await client.auth.signOut();
}
