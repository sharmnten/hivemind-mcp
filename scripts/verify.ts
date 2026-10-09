import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import express from "express";
import { chromium, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "../apps/server/src/app.js";
import {
  supabaseAuthentication,
  type Authenticate,
} from "../apps/server/src/auth.js";
import {
  database,
  ADMIN,
  MEMBER,
  OUTSIDER,
} from "../tests/helpers/database.js";
import { pgRepository } from "../tests/helpers/repository.js";
import { enroll, runHook } from "../packages/integrations/src/hook.js";

// No production credentials or data: the optional status file must describe a loopback stack.
const statusFile = process.argv[2];
const fixture = !statusFile;
const server = createServer();
server.listen(0, "127.0.0.1");
await new Promise<void>((r, j) => {
  server.once("listening", r);
  server.once("error", j);
});
const address = server.address();
assert(address && typeof address !== "string");
const url = `http://127.0.0.1:${address.port}`;
const emails = [0, 1, 2].map(
  (i) => `mio-verification-${randomUUID()}-${i}@example.invalid`,
);
const password = `Fixture-${randomUUID()}`;
const actors: string[] = [],
  tokens: string[] = [];
let db: Awaited<ReturnType<typeof database>> | undefined;
let adminClient: ReturnType<typeof createClient> | undefined;
let supabaseUrl = `${url}/supabase`,
  key = "local-test-publishable-key-only";
let authenticate: Authenticate;
const outer = express();
let brainId: string | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const root = await mkdtemp(join(tmpdir(), "mio-verify-"));
try {
  if (fixture) {
    db = await database();
    actors.push(ADMIN, MEMBER, OUTSIDER);
    for (const id of actors)
      tokens.push(
        `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600, iss: supabaseUrl + "/auth/v1", aud: "authenticated" })).toString("base64url")}.fixture`,
      );
    authenticate = async (token) => {
      const i = tokens.indexOf(token);
      return i < 0
        ? null
        : { actorId: actors[i]!, repository: pgRepository(db!, actors[i]!) };
    };
    const user = (i: number) => ({
      id: actors[i],
      aud: "authenticated",
      role: "authenticated",
      email: emails[i],
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      created_at: new Date().toISOString(),
    });
    outer.use("/supabase", express.json());
    outer.post("/supabase/auth/v1/token", (req, res) => {
      const i = emails.indexOf(String(req.body.email));
      if (i < 0 || req.body.password !== password) {
        res.status(400).json({ msg: "Invalid login credentials" });
        return;
      }
      res.json({
        access_token: tokens[i],
        refresh_token: "fixture-refresh",
        token_type: "bearer",
        expires_in: 3600,
        user: user(i),
      });
    });
    outer.get("/supabase/auth/v1/user", (req, res) => {
      const i = tokens.indexOf(req.headers.authorization?.slice(7) ?? "");
      if (i < 0) {
        res.sendStatus(401);
        return;
      }
      res.json(user(i));
    });
    outer.post("/supabase/auth/v1/logout", (_req, res) => res.sendStatus(204));
  } else {
    const status = JSON.parse(
      await readFile(resolve(statusFile!), "utf8"),
    ) as Record<string, string>;
    supabaseUrl = status.API_URL!;
    key = status.PUBLISHABLE_KEY ?? status.ANON_KEY!;
    const local = new URL(supabaseUrl);
    assert(
      ["127.0.0.1", "localhost", "[::1]"].includes(local.hostname),
      "Only local Supabase is allowed",
    );
    const privileged = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
    assert(privileged && key, "Missing local status credentials");
    adminClient = createClient(supabaseUrl, privileged, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    for (const email of emails) {
      const made = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      assert(
        !made.error && made.data.user,
        "Unable to create local fixture user",
      );
      actors.push(made.data.user.id);
      const client = createClient(supabaseUrl, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const signed = await client.auth.signInWithPassword({ email, password });
      assert(!signed.error && signed.data.session, "Unable to sign in fixture");
      tokens.push(signed.data.session.access_token);
    }
    authenticate = supabaseAuthentication(supabaseUrl, key, "authenticated");
  }
  outer.use(
    createApp({
      publicUrl: url,
      allowedOrigins: [url],
      authenticate,
      ready: async () => true,
      dashboardDir: resolve("apps/dashboard/dist"),
      browserConfig: { supabaseUrl, supabasePublishableKey: key },
      rateLimit: 1000,
    }),
  );
  server.on("request", outer);
  async function request(path: string, body?: unknown, actor = 0) {
    const response = await fetch(url + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${tokens[actor]}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: response.status,
      data: (await response.json()) as Record<string, unknown>,
    };
  }
  async function action(
    name: string,
    payload: Record<string, unknown>,
    actor = 0,
  ) {
    return request("/api/actions", { action: name, payload }, actor);
  }
  const created = await action("create_brain", {
    name: "Verification Game",
    overview: "Game inventory architecture and project conventions.",
  });
  assert.equal(created.status, 200);
  brainId = String(created.data.id);
  assert.equal(
    (
      await action("set_member", {
        brain_id: brainId,
        actor_id: actors[1],
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
  await enroll(root, { brain_id: brainId, server_url: url });
  await writeFile(
    join(root, ".hivemind/notes.json"),
    JSON.stringify({ facts: [fact] }),
  );
  const hooked = await runHook({
    root,
    client: "claude-code",
    event: "task_completed",
    input: {
      cwd: root,
      session_id: "verification-session",
      transcript_path: "/private/never-read",
    },
    token: tokens[0],
  });
  assert.equal(hooked.status, "synced");
  await request(`/api/brains/${brainId}/sync`);
  const mcp = new Client({
    name: "developer-b-cursor-verification",
    version: "1.0.0",
  });
  await mcp.connect(
    new StreamableHTTPClientTransport(new URL(url + "/mcp"), {
      requestInit: { headers: { Authorization: `Bearer ${tokens[1]}` } },
    }),
  );
  try {
    const found = await mcp.callTool({
      name: "search_memories",
      arguments: { brain_id: brainId, query: "inventory server" },
    });
    assert(!found.isError);
    assert(JSON.stringify(found.structuredContent).includes(fact.content));
  } finally {
    await mcp.close();
  }
  assert.equal(
    (await request(`/api/brains/${brainId}/context`, undefined, 2)).status,
    403,
  );
  const records = await request("/api/search", {
    brain_id: brainId,
    query: "inventory",
  });
  const memory = (
    records.data.memories as Array<{ id: string; version: number }>
  )[0]!;
  assert(memory);
  // Distinct RPC requests compete for the same version. Real Supabase mode uses separate DB connections.
  const updates = await Promise.all(
    [
      "server validates inventory writes.",
      "server validates inventory updates.",
    ].map((content) =>
      action("update_memory", {
        brain_id: brainId,
        memory_id: memory.id,
        expected_version: memory.version,
        ...fact,
        content: `The ${content}`,
      }),
    ),
  );
  assert.deepEqual(updates.map((v) => v.status).sort(), [200, 409]);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(10000);
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.name));
  await page.goto(url);
  await page.getByLabel("Studio email").fill(emails[0]!);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page
    .getByRole("heading", { name: "Verification Game", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "+ Add memory", exact: true }).click();
  await page.getByLabel("Topic", { exact: true }).fill("combat state machine");
  await page
    .getByLabel("Project fact", { exact: true })
    .fill("The combat system uses a state machine for server combat states.");
  await page.getByRole("button", { name: "Save memory", exact: true }).click();
  await page
    .getByText(
      "The combat system uses a state machine for server combat states.",
      { exact: true },
    )
    .waitFor();
  await page.getByLabel("Search project memories").fill("combat");
  console.log("Browser: created a project fact; checking search.");
  await expect(page.locator(".memory-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Edit", exact: true }).waitFor();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("I verified this fact. Promote to established knowledge.")
    .check();
  await page
    .getByRole("button", { name: "Save revision", exact: true })
    .click();
  await page.getByText("verified", { exact: true }).waitFor();
  console.log("Browser: promoted knowledge; checking history and reports.");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page
    .getByRole("heading", {
      name: "History · combat state machine",
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("button", { name: "Close history", exact: true })
    .click();
  await page.getByRole("button", { name: "Report", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Report reason", exact: true })
    .selectOption("incorrect");
  await page.getByLabel("Request permanent deletion").check();
  await page
    .getByRole("button", { name: "Submit report", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Report submitted for admin review." })
    .waitFor();
  await page.screenshot({
    path: "/tmp/mio-hivemind-dashboard.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    "Mobile layout overflows",
  );
  assert.deepEqual(pageErrors, [], "Browser runtime errors");
  const personal = await action("write_memory", {
    brain_id: brainId,
    ...fact,
    content: "My wife is pregnant and the server has a bug.",
  });
  assert.equal(personal.status, 422);
  console.log(
    JSON.stringify({
      mode: fixture ? "postgres-with-auth-fixture" : "local-supabase",
      checks: [
        "hook-to-MCP cross-developer retrieval",
        "outsider denial",
        "concurrent version conflict",
        "browser sign-in/create/search/promote/history/report",
        "mobile layout",
        "privacy rejection",
      ],
      status: "passed",
    }),
  );
} finally {
  await browser?.close();
  if (brainId && tokens[0])
    await fetch(url + "/api/actions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens[0]}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "delete_brain",
        payload: { brain_id: brainId },
      }),
    }).catch(() => {});
  for (const id of actors)
    if (adminClient) await adminClient.auth.admin.deleteUser(id);
  await new Promise<void>((r) => server.close(() => r()));
  await db?.close();
  await rm(root, { recursive: true, force: true });
}
