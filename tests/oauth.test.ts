import { describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { safeOAuthRedirect } from "../apps/dashboard/src/OAuth.js";
import { supabaseAuthentication } from "../apps/server/src/auth.js";
describe("MCP OAuth authentication gate", () => {
  it.each([
    {
      name: "active grant",
      oauth: true,
      active: true,
      status: 200,
      accepted: true,
    },
    {
      name: "revoked grant",
      oauth: true,
      active: false,
      status: 200,
      accepted: false,
    },
    {
      name: "unavailable session check",
      oauth: true,
      active: true,
      status: 500,
      accepted: false,
    },
    {
      name: "missing OAuth claims",
      oauth: false,
      active: true,
      status: 200,
      accepted: false,
    },
  ])("handles $name", async ({ oauth, active, status, accepted }) => {
    const actor = "11111111-1111-4111-8111-111111111111";
    const resource = "https://memory.example/mcp";
    const claims = {
      sub: actor,
      iss: "https://project.supabase.co/auth/v1",
      aud: resource,
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...(oauth
        ? {
            client_id: "22222222-2222-4222-8222-222222222222",
            session_id: "33333333-3333-4333-8333-333333333333",
          }
        : {}),
    };
    const token = `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith("/auth/v1/user"))
        return Response.json({
          id: actor,
          app_metadata: {},
          user_metadata: {},
        });
      expect(url).toContain("/rest/v1/rpc/hivemind_oauth_session_active");
      return Response.json(
        status === 200 ? active : { message: "Unavailable" },
        { status },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const authenticate = supabaseAuthentication(
        "https://project.supabase.co",
        "public-key",
        resource,
      );
      const principal = await authenticate(token, "mcp");
      expect(principal?.actorId ?? null).toBe(accepted ? actor : null);
      expect(fetchMock).toHaveBeenCalledTimes(oauth ? 2 : 1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
describe("OAuth callback validation", () => {
  it.each([
    "https://client.example/callback?code=test&state=test",
    "http://localhost:1234/callback",
    "http://127.0.0.1:1234/callback",
  ])("allows secure registered callbacks %s", (value) =>
    expect(safeOAuthRedirect(value)).toBe(value),
  );
  it.each([
    "javascript:alert(1)",
    "data:text/html,test",
    "http://client.example/callback",
    "https://user:password@client.example",
    "//client.example",
  ])("rejects unsafe callbacks %s", (value) =>
    expect(() => safeOAuthRedirect(value)).toThrow(),
  );
});
describe("Supabase OAuth audience hook", () => {
  it("binds OAuth sessions to MCP, preserves password sessions and denies user invocation", async () => {
    const db = new PGlite();
    try {
      await db.exec(
        "create role anon; create role authenticated; create role supabase_auth_admin;",
      );
      await db.exec(
        await readFile(
          "supabase/migrations/20261010005236_mcp_oauth_audience.sql",
          "utf8",
        ),
      );
      const claims = {
        sub: "user",
        aud: "authenticated",
        exp: 12345,
        role: "authenticated",
        user_metadata: { client_id: "spoofed" },
      };
      const invoke = async (value: unknown) =>
        (
          await db.query<{ result: { claims: Record<string, unknown> } }>(
            "select public.hivemind_access_token_hook($1::jsonb) as result",
            [JSON.stringify({ claims: value })],
          )
        ).rows[0]!.result.claims;
      expect(await invoke(claims)).toEqual(claims);
      expect(await invoke({ ...claims, client_id: "oauth-client" })).toEqual({
        ...claims,
        client_id: "oauth-client",
        aud: "https://mio-hivemind.vercel.app/mcp",
      });
      await db.exec("set role authenticated;");
      await expect(invoke(claims)).rejects.toThrow("permission denied");
      await db.exec("reset role; set role supabase_auth_admin;");
      expect((await invoke({ ...claims, client_id: "oauth-client" })).aud).toBe(
        "https://mio-hivemind.vercel.app/mcp",
      );
    } finally {
      await db.close();
    }
  });
});

describe("OAuth session revocation", () => {
  it("rejects revoked grants, removed sessions, and another account's session", async () => {
    const { database, asActor, ADMIN, OUTSIDER } =
      await import("./helpers/database.js");
    const db = await database();
    const session = "44444444-4444-4444-8444-444444444444",
      client = "55555555-5555-4555-8555-555555555555";
    try {
      await db.query(
        "insert into auth.sessions(id,user_id,oauth_client_id) values ($1,$2,$3)",
        [session, ADMIN, client],
      );
      await db.query(
        "insert into auth.oauth_consents(user_id,client_id) values ($1,$2)",
        [ADMIN, client],
      );
      const active = (actor: string) =>
        asActor(db, actor, async () => {
          await db.query("select set_config('request.jwt.claims', $1, true)", [
            JSON.stringify({
              sub: actor,
              session_id: session,
              client_id: client,
            }),
          ]);
          return (
            await db.query<{ active: boolean }>(
              "select public.hivemind_oauth_session_active() as active",
            )
          ).rows[0]!.active;
        });
      expect(await active(ADMIN)).toBe(true);
      expect(await active(OUTSIDER)).toBe(false);
      await db.exec("update auth.oauth_consents set revoked_at = now()");
      expect(await active(ADMIN)).toBe(false);
      await db.exec(
        "update auth.oauth_consents set revoked_at = null; delete from auth.sessions;",
      );
      expect(await active(ADMIN)).toBe(false);
    } finally {
      await db.close();
    }
  });
});
