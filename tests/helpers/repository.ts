import type { PGlite } from "@electric-sql/pglite";
import { asActor } from "./database.js";
import type {
  Repository,
  SelectOptions,
  Row,
} from "../../apps/server/src/repository.js";
const tables = new Set([
  "brains",
  "brain_members",
  "memories",
  "memory_revisions",
  "memory_sources",
  "sessions",
  "session_handoffs",
  "synchronization_events",
  "privacy_reports",
]);
export function pgRepository(db: PGlite, actor: string): Repository {
  return {
    async select(table: string, options: SelectOptions = {}) {
      if (!tables.has(table)) throw new Error("Unsafe test table");
      const filters = Object.entries(options.filters ?? {});
      const column = options.order ?? "created_at";
      if (
        !/^[a-z_]+$/.test(column) ||
        filters.some(([k]) => !/^[a-z_]+$/.test(k))
      )
        throw new Error("Unsafe test column");
      const where = filters.length
        ? " where " + filters.map(([k], i) => `${k}=$${i + 1}`).join(" and ")
        : "";
      return asActor(
        db,
        actor,
        async () =>
          (
            await db.query<Row>(
              `select ${options.columns ?? "*"} from public.${table}${where}${options.order ? ` order by ${column} ${options.ascending ? "asc" : "desc"}` : ""} limit ${options.limit ?? 100}`,
              filters.map(([, v]) => v),
            )
          ).rows,
      );
    },
    async rpc(name, args) {
      const calls: Record<string, { sql: string; values: unknown[] }> = {
        hivemind_mutate: {
          sql: "select public.hivemind_mutate($1,$2::jsonb) result",
          values: [args.action, JSON.stringify(args.payload)],
        },
        process_sync_event: {
          sql: "select public.process_sync_event($1) result",
          values: [args.p_event_id],
        },
        search_memories: {
          sql: "select * from public.search_memories($1,$2,$3,$4,$5,$6,$7)",
          values: [
            args.p_brain_id,
            args.p_query,
            args.p_limit,
            args.p_type,
            args.p_layer,
            args.p_status,
            args.p_recent ?? false,
          ],
        },
      };
      const call = calls[name];
      if (!call) throw new Error("Unknown test RPC");
      return asActor(db, actor, async () => {
        const rows = (await db.query<Row>(call.sql, call.values)).rows;
        return name === "search_memories" ? rows : rows[0]?.result;
      });
    },
  };
}
