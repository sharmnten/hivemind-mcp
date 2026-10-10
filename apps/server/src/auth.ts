import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { supabaseRepository, type Repository } from "./repository.js";
export interface Principal {
  actorId: string;
  repository: Repository;
}
export type Authenticate = (
  token: string,
  resource: "api" | "mcp",
) => Promise<Principal | null>;
const claimsSchema = z.object({
  sub: z.uuid(),
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]),
  exp: z.number(),
  nbf: z.number().optional(),
  is_anonymous: z.boolean().optional(),
});
export function validateClaims(
  input: unknown,
  actorId: string,
  issuer: string,
  audience: string,
): boolean {
  const parsed = claimsSchema.safeParse(input);
  if (!parsed.success) return false;
  const c = parsed.data,
    now = Date.now() / 1000;
  return (
    c.sub === actorId &&
    c.iss === issuer &&
    (Array.isArray(c.aud) ? c.aud.includes(audience) : c.aud === audience) &&
    c.exp > now &&
    (c.nbf === undefined || c.nbf <= now) &&
    !c.is_anonymous
  );
}
export function supabaseAuthentication(
  url: string,
  publishableKey: string,
  mcpAudience: string,
): Authenticate {
  return async (token, resource) => {
    if (token.length > 8192 || token.split(".").length !== 3) return null;
    const client = createClient(url, publishableKey, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(8000) }),
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    try {
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user || data.user.is_anonymous) return null;
      // Decode only after authenticating the token with Supabase; this is an extra claim gate.
      const claims: unknown = JSON.parse(
        Buffer.from(token.split(".")[1]!, "base64url").toString("utf8"),
      );
      if (
        !validateClaims(
          claims,
          data.user.id,
          `${url.replace(/\/$/, "")}/auth/v1`,
          resource === "mcp" ? mcpAudience : "authenticated",
        )
      )
        return null;
      if (resource === "mcp" && mcpAudience !== "authenticated") {
        const oauth = z
          .object({ client_id: z.uuid(), session_id: z.uuid() })
          .safeParse(claims);
        if (!oauth.success) return null;
        const { data: active, error: sessionError } = await client.rpc(
          "hivemind_oauth_session_active",
        );
        if (sessionError || active !== true) return null;
      }
      return { actorId: data.user.id, repository: supabaseRepository(client) };
    } catch {
      return null;
    }
  };
}
