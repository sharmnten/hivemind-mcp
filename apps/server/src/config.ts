import { z } from "zod";
const configSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  PUBLIC_URL: z.url().default("http://127.0.0.1:3000"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default("127.0.0.1"),
  ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:5173,http://127.0.0.1:3000"),
  MCP_TOKEN_AUDIENCE: z.string().optional(),
  MCP_OAUTH_ISSUER: z.url().optional(),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  SUPABASE_WORKER_KEY: z.string().optional(),
});
export function config(env: NodeJS.ProcessEnv = process.env) {
  const publicUrl =
    env.PUBLIC_URL ?? env.RENDER_EXTERNAL_URL ?? "http://127.0.0.1:3000";
  const parsed = configSchema.safeParse({
    ...env,
    PUBLIC_URL: publicUrl,
    ALLOWED_ORIGINS:
      env.ALLOWED_ORIGINS ??
      (env.NODE_ENV === "production" ? publicUrl : undefined),
  });
  if (!parsed.success)
    throw new Error(
      "Missing or invalid server configuration. See .env.example.",
    );
  const c = parsed.data;
  if (c.NODE_ENV === "production" && !c.PUBLIC_URL.startsWith("https://"))
    throw new Error("Production PUBLIC_URL must use HTTPS.");
  if (c.NODE_ENV === "production" && c.MCP_TOKEN_AUDIENCE === "authenticated")
    throw new Error(
      "Production MCP requires a resource-specific token audience.",
    );
  return c;
}
