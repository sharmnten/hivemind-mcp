import { resolve } from "node:path";
import { config } from "./config.js";
import { supabaseAuthentication } from "./auth.js";
import { createApp } from "./app.js";

export function configuredApp(env: NodeJS.ProcessEnv = process.env) {
  const c = config(env);
  const app = createApp({
    publicUrl: c.PUBLIC_URL,
    allowedOrigins: c.ALLOWED_ORIGINS.split(",").map((x) => x.trim()),
    authenticate: supabaseAuthentication(
      c.SUPABASE_URL,
      c.SUPABASE_PUBLISHABLE_KEY,
      c.MCP_TOKEN_AUDIENCE ?? `${c.PUBLIC_URL.replace(/\/$/, "")}/mcp`,
    ),
    browserConfig: {
      supabaseUrl: c.SUPABASE_URL,
      supabasePublishableKey: c.SUPABASE_PUBLISHABLE_KEY,
    },
    dashboardDir: env.VERCEL ? undefined : resolve("apps/dashboard/dist"),
    oauthIssuer: c.MCP_OAUTH_ISSUER,
    ready: async () => {
      const response = await fetch(`${c.SUPABASE_URL}/auth/v1/health`, {
        headers: { apikey: c.SUPABASE_PUBLISHABLE_KEY },
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    },
    audit: (record) => process.stdout.write(JSON.stringify(record) + "\n"),
  });
  return { app, config: c };
}
