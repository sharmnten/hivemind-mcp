import assert from "node:assert/strict";
import express from "express";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

// Exercise UI error/confirmation flows without sending email or creating users.
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
  await page.route("**/auth/v1/signup**", async (r) => {
    signups++;
    assert.equal(
      new URL(r.request().url()).searchParams.get("redirect_to"),
      base + "/",
    );
    assert.equal(r.request().postDataJSON().email, "signup@example.invalid");
    await r.fulfill({
      json: {
        id: "fixture-user",
        email: "signup@example.invalid",
        identities: [],
      },
    });
  });
  await page.route("**/auth/v1/resend**", (r) => r.fulfill({ json: {} }));
  await page.route("**/auth/v1/token**", (r) =>
    r.fulfill({
      status: 400,
      headers: { "x-supabase-api-version": "2024-01-01" },
      json: { error_code: "email_not_confirmed", msg: "Email not confirmed" },
    }),
  );
  await page.goto(base + "/signup");
  await expect(
    page.getByRole("heading", { name: "Create your account" }),
  ).toBeVisible();
  await page
    .getByLabel("Email", { exact: true })
    .fill("signup@example.invalid");
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
  await expect(page.getByRole("status")).toContainText("Check your inbox");
  assert.equal(signups, 1);
  await page.getByRole("button", { name: "Resend confirmation email" }).click();
  await expect(page.getByRole("status")).toContainText(
    "If you already confirmed",
  );
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome to Hivemind" }),
  ).toBeVisible();
  await page
    .getByLabel("Email", { exact: true })
    .fill("signup@example.invalid");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Fixture-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText("Confirm your email");
  await expect(
    page.getByRole("button", { name: "Resend confirmation email" }),
  ).toBeVisible();
  await page.goto(base + "/#error=access_denied&error_description=Expired");
  await expect(page.getByRole("alert")).toContainText("expired or is invalid");
  assert.equal(new URL(page.url()).hash, "");
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
    "Signup, mismatch validation, resend, unconfirmed login, expired callback, and mobile layout passed (mocked Auth responses). ",
  );
} finally {
  await browser.close();
  server?.close();
}
