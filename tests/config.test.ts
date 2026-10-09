import { describe, expect, it } from "vitest";
import { config } from "../apps/server/src/config.js";

const hosted = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-publishable-key-only",
  NODE_ENV: "production",
  RENDER_EXTERNAL_URL: "https://mio-hivemind.onrender.com",
  HOST: "0.0.0.0",
  PORT: "10000",
};

describe("hosted configuration", () => {
  it("uses Vercel's stable production domain and isolates preview domains", () => {
    const env = {
      ...hosted,
      RENDER_EXTERNAL_URL: undefined,
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "mio-hivemind.vercel.app",
      VERCEL_URL: "mio-hivemind-unique.vercel.app",
    };
    expect(config(env).PUBLIC_URL).toBe("https://mio-hivemind.vercel.app");
    expect(config(env).ALLOWED_ORIGINS).toBe("https://mio-hivemind.vercel.app");
    expect(config({ ...env, VERCEL_ENV: "preview" }).PUBLIC_URL).toBe(
      "https://mio-hivemind-unique.vercel.app",
    );
    expect(
      config({ ...env, PUBLIC_URL: "https://memory.example" }).PUBLIC_URL,
    ).toBe("https://memory.example");
  });

  it("uses Render's assigned URL for host, origin, and MCP audience defaults", () => {
    const actual = config(hosted);
    expect(actual.PUBLIC_URL).toBe(hosted.RENDER_EXTERNAL_URL);
    expect(actual.ALLOWED_ORIGINS).toBe(hosted.RENDER_EXTERNAL_URL);
    expect(actual.PORT).toBe(10000);
    expect(actual.HOST).toBe("0.0.0.0");
    expect(actual.MCP_TOKEN_AUDIENCE).toBeUndefined();
  });

  it("lets an explicit custom domain override the Render URL", () => {
    const actual = config({ ...hosted, PUBLIC_URL: "https://memory.example" });
    expect(actual.PUBLIC_URL).toBe("https://memory.example");
    expect(actual.ALLOWED_ORIGINS).toBe("https://memory.example");
  });

  it("still rejects insecure public URLs and generic MCP audiences", () => {
    expect(() =>
      config({ ...hosted, RENDER_EXTERNAL_URL: "http://memory.example" }),
    ).toThrow("HTTPS");
    expect(() =>
      config({ ...hosted, MCP_TOKEN_AUDIENCE: "authenticated" }),
    ).toThrow("resource-specific");
  });
});
