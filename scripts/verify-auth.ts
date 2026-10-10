import assert from "node:assert/strict";
import express from "express";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

// Exercise username signup and session handling without creating real users.
const target = process.argv[2];
const server = target
  ? null
  : express()
      .use(express.static(resolve("apps/dashboard/dist")))
      .get(["/signup", "/login"], (_req, res) =>
        res.sendFile(resolve("apps/dashboard/dist/index.html")),
      )
      .listen(0, "127.0.0.1");
if (server) await new Promise<void>((r) => server.once("listening", r));
const address = server?.address();
const base =
  target ??
  `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/config", (r) =>
    r.fulfill({
      json: {
        supabaseUrl: "https://oadeofxsspwkmoyjmfdn.supabase.co",
        supabasePublishableKey: "fixture-publishable-key",
      },
    }),
  );
  let signups = 0;
  const user = {
    id: "00000000-0000-4000-8000-000000000001",
    email: "signup_user@users.hivemind.invalid",
    aud: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const token = `${Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.fixture`;
  await page.route("**/api/brains", (r) => r.fulfill({ json: { brains: [] } }));
  await page.route("**/auth/v1/signup**", async (r) => {
    signups++;
    assert.equal(r.request().postDataJSON().email, user.email);
    await r.fulfill({
      json: {
        user,
        access_token: token,
        refresh_token: "fixture-refresh",
        token_type: "bearer",
        expires_in: 3600,
      },
    });
  });
  await page.route("**/auth/v1/logout**", (r) => r.fulfill({ status: 204 }));
  await page.route("**/auth/v1/token**", (r) =>
    r.fulfill({
      status: 400,
      json: {
        error_code: "invalid_credentials",
        msg: "Invalid login credentials",
      },
    }),
  );
  await page.goto(base + "/signup");
  await expect(
    page.getByRole("heading", { name: "Create your account" }),
  ).toBeVisible();
  await page.getByLabel("Username", { exact: true }).fill("Signup_USER");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Fixture-password-123");
  await page.getByLabel("Confirm password").fill("Fixture-password-456");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert")).toHaveText("Passwords do not match.");
  assert.equal(signups, 0);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Fixture-password-123");
  await page.getByLabel("Confirm password").fill("Fixture-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  assert.equal(signups, 1);
  assert.equal(new URL(page.url()).pathname, "/");
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto(base + "/login");
  await page.getByLabel("Username", { exact: true }).fill("signup_user");
  await page.getByLabel("Password", { exact: true }).fill("Wrong-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Check your username and password",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/signup");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Username signup, mismatch validation, immediate session, refresh, sign-out, invalid login, and mobile layout passed (mocked Auth responses).",
  );
} finally {
  await browser.close();
  server?.close();
}
