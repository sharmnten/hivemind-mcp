import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { readFile, readdir } from "node:fs/promises";

export const ADMIN = "11111111-1111-4111-8111-111111111111";
export const MEMBER = "22222222-2222-4222-8222-222222222222";
export const OUTSIDER = "33333333-3333-4333-8333-333333333333";
const connections = new WeakMap<PGlite, Promise<void>>();
export async function database() {
  const db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create schema extensions;
    create table auth.users (id uuid primary key);
    create table auth.sessions (id uuid primary key, user_id uuid, oauth_client_id uuid, not_after timestamptz);
    create table auth.oauth_consents (user_id uuid, client_id uuid, revoked_at timestamptz);
    insert into auth.users values ('${ADMIN}'), ('${MEMBER}'), ('${OUTSIDER}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    grant usage on schema auth to authenticated, anon, service_role;
    grant execute on all functions in schema auth to authenticated, anon, service_role;
  `);
  const files = (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files)
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  return db;
}
export async function asActor<T>(
  db: PGlite,
  actor: string,
  operation: () => Promise<T>,
  role = "authenticated",
): Promise<T> {
  const previous = connections.get(db) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  connections.set(
    db,
    previous.then(() => current),
  );
  await previous;
  // Each test request runs in a separate transaction, just like PostgREST.
  await db.exec("begin");
  try {
    await db.query(
      "select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)",
      [actor, JSON.stringify({ sub: actor, role })],
    );
    await db.exec(`set local role ${role}`);
    const result = await operation();
    await db.exec("commit");
    return result;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  } finally {
    release();
  }
}
export async function mutate(
  db: PGlite,
  actor: string,
  action: string,
  payload: unknown,
): Promise<Record<string, unknown>> {
  return asActor(db, actor, async () => {
    const result = await db.query<{ result: Record<string, unknown> }>(
      "select public.hivemind_mutate($1, $2::jsonb) as result",
      [action, JSON.stringify(payload)],
    );
    return result.rows[0]!.result;
  });
}
export async function createBrain(
  db: PGlite,
  name = "Inventory Game",
): Promise<string> {
  return (
    await mutate(db, ADMIN, "create_brain", {
      name,
      overview: "Game inventory architecture.",
      is_global: false,
    })
  ).id as string;
}
