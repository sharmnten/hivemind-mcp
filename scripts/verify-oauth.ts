import assert from "node:assert/strict";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Operator supplies credentials through the environment. Never print tokens or passwords.
const base = process.env.HIVEMIND_URL ?? "https://mio-hivemind.vercel.app";
const username = process.env.HIVEMIND_USERNAME,
  password = process.env.HIVEMIND_PASSWORD;
assert(
  username && password,
  "Supply HIVEMIND_USERNAME and HIVEMIND_PASSWORD through the environment.",
);
const config = await fetch(base + "/api/config").then((r) => r.json());
const auth = createClient(config.supabaseUrl, config.supabasePublishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const signed = await auth.auth.signInWithPassword({
  email: `${username.toLowerCase()}@users.hivemind.invalid`,
  password,
});
assert(!signed.error && signed.data.session, "Dashboard sign-in failed.");
const headers = {
  Authorization: `Bearer ${signed.data.session.access_token}`,
  "Content-Type": "application/json",
};
const metadata = await fetch(
  base + "/.well-known/oauth-protected-resource",
).then((r) => r.json());
assert.equal(metadata.resource, base + "/mcp");
assert.equal(
  metadata.authorization_servers[0],
  config.supabaseUrl + "/auth/v1",
);
const discovery = await fetch(
  config.supabaseUrl + "/.well-known/oauth-authorization-server/auth/v1",
).then((r) => r.json());
const callback = "http://127.0.0.1:45454/callback";
let clientId: string | undefined, brainId: string | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let mcp: Client | undefined;
async function action(action: string, payload: unknown) {
  const r = await fetch(base + "/api/actions", {
    method: "POST",
    headers,
    body: JSON.stringify({ action, payload }),
  });
  assert.equal(r.status, 200, `Action ${action} failed`);
  return r.json();
}
async function token(body: Record<string, string>) {
  const r = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });
  const data = await r.json();
  return { status: r.status, data };
}
try {
  const registration = await fetch(discovery.registration_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_name: "Hivemind OAuth verification",
      redirect_uris: [callback],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  assert.equal(registration.status, 201);
  clientId = (await registration.json()).client_id;
  assert(clientId);
  console.log(JSON.stringify({ fixtureClientId: clientId }));
  const verifier = randomBytes(32).toString("base64url"),
    state = randomUUID();
  const authorize = new URL(discovery.authorization_endpoint);
  Object.entries({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callback,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    scope: "openid profile",
    state,
    resource: base + "/mcp",
  }).forEach(([key, value]) => authorize.searchParams.set(key, value));
  browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  let result: URL | undefined;
  await page.route(callback + "**", (r) => {
    result = new URL(r.request().url());
    return r.fulfill({ body: "OAuth callback received." });
  });
  await page.goto(authorize.href);
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Connect your assistant" }),
  ).toBeVisible();
  await expect(
    page.getByText("Hivemind OAuth verification requests access"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Allow access", exact: true }).click();
  await expect(page).toHaveURL(new RegExp("^http://127.0.0.1:45454/callback"));
  assert(result);
  assert.equal(result.searchParams.get("state"), state);
  const code = result.searchParams.get("code");
  assert(code);
  const exchanged = await token({
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: callback,
    code_verifier: verifier,
    code,
  });
  assert.equal(exchanged.status, 200);
  const claims = JSON.parse(
    Buffer.from(
      exchanged.data.access_token.split(".")[1],
      "base64url",
    ).toString(),
  );
  assert.equal(claims.aud, base + "/mcp");
  assert.equal(claims.sub, signed.data.user!.id);
  brainId = (
    await action("create_brain", {
      name: "OAuth verification",
      overview: "Temporary project for testing assistant authorization.",
      is_global: false,
    })
  ).id;
  mcp = new Client({ name: "oauth-verification", version: "1" });
  await mcp.connect(
    new StreamableHTTPClientTransport(new URL(base + "/mcp"), {
      requestInit: {
        headers: { Authorization: `Bearer ${exchanged.data.access_token}` },
      },
    }),
  );
  assert.equal((await mcp.listTools()).tools.length, 14);
  const context = await mcp.callTool({
    name: "get_brain_context",
    arguments: { brain_id: brainId, token_budget: 8000 },
  });
  assert(!context.isError);
  await mcp.close();
  mcp = undefined;
  const refreshed = await token({
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: exchanged.data.refresh_token,
  });
  assert.equal(refreshed.status, 200);
  const reused = await token({
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: callback,
    code_verifier: verifier,
    code,
  });
  assert(reused.status >= 400);
  // Switching the consent browser account must not revoke existing assistants.
  await page.goto(base + "/oauth/consent");
  await page
    .getByRole("button", { name: "Sign out and use another account" })
    .click();
  await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
  mcp = new Client({ name: "oauth-verification", version: "1" });
  await mcp.connect(
    new StreamableHTTPClientTransport(new URL(base + "/mcp"), {
      requestInit: {
        headers: { Authorization: `Bearer ${refreshed.data.access_token}` },
      },
    }),
  );
  assert.equal((await mcp.listTools()).tools.length, 14);
  await mcp.close();
  mcp = undefined;
  await page.goto(base + "/connections");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Connected assistants" }),
  ).toBeVisible();
  const grantHeading = page.getByRole("heading", {
    name: "Hivemind OAuth verification",
    exact: true,
  });
  await grantHeading
    .locator("..")
    .getByRole("button", { name: "Revoke access" })
    .click();
  await expect(grantHeading).toHaveCount(0);
  const rejectedRefresh = await token({
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: refreshed.data.refresh_token,
  });
  assert(rejectedRefresh.status >= 400);
  const rejectedAccess = await fetch(base + "/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${refreshed.data.access_token}`,
    },
    body: "{}",
  });
  assert.equal(rejectedAccess.status, 401);
  result = undefined;
  await page.goto(authorize.href);
  await expect(
    page.getByRole("heading", { name: "Connect your assistant" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Deny", exact: true }).click();
  await expect(page).toHaveURL(new RegExp("^http://127.0.0.1:45454/callback"));
  assert(result);
  assert.equal((result as URL).searchParams.get("error"), "access_denied");
  console.log(
    "Live discovery, registration, username consent, PKCE exchange, 14 MCP tools, brain access, refresh, code replay rejection and immediate revocation passed.",
  );
} finally {
  const cleanupFailures: string[] = [];
  const cleanup: [string, () => Promise<unknown>][] = [
    ["MCP client", async () => mcp?.close()],
    ["browser", async () => browser?.close()],
    [
      "temporary brain",
      async () => brainId && action("delete_brain", { brain_id: brainId }),
    ],
    [
      "OAuth grant",
      async () => {
        if (clientId) {
          const { error } = await auth.auth.oauth.revokeGrant({ clientId });
          if (error) throw new Error("Grant cleanup failed.");
        }
      },
    ],
    [
      "dashboard session",
      async () => {
        const { error } = await auth.auth.signOut({ scope: "local" });
        if (error) throw new Error("Session cleanup failed.");
      },
    ],
  ];
  for (const [name, run] of cleanup) {
    try {
      await run();
    } catch {
      cleanupFailures.push(name);
    }
  }
  assert.equal(
    cleanupFailures.length,
    0,
    `Cleanup failed: ${cleanupFailures.join(", ")}`,
  );
}
