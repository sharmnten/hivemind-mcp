import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../../../packages/core/src/errors.js";
export type Row = Record<string, unknown>;
export interface SelectOptions {
  columns?: string;
  filters?: Record<string, string | number | boolean>;
  limit?: number;
  order?: string;
  ascending?: boolean;
}
export interface Repository {
  select(table: string, options?: SelectOptions): Promise<Row[]>;
  rpc(name: string, args: Row): Promise<unknown>;
}
const codes: Record<string, number> = {
  FORBIDDEN: 403,
  ADMIN_REQUIRED: 403,
  UNAUTHENTICATED: 401,
  NOT_FOUND: 404,
  PRIVACY_REJECTED: 422,
  PROJECT_RELEVANCE_UNCERTAIN: 422,
  UNSAFE_SOURCE: 422,
  INVALID_INPUT: 400,
  UNKNOWN_ACTION: 400,
  VERSION_CONFLICT: 409,
  LAST_ADMIN: 409,
  IDEMPOTENCY_CONFLICT: 409,
  SUPERSEDED: 409,
  INVALID_RESOLUTION: 409,
  CONFLICT_REQUIRES_REVIEW: 409,
  RATE_LIMITED: 429,
};
export function databaseError(error: {
  message?: string;
  code?: string;
}): AppError {
  const message = error.message ?? "";
  if (message in codes) return new AppError(message, codes[message]);
  if (error.code === "23505") return new AppError("DUPLICATE_CONTENT", 409);
  if (error.code === "23503") return new AppError("NOT_FOUND", 404);
  if (error.code?.startsWith("22") || error.code === "23514")
    return new AppError("INVALID_INPUT", 400);
  return new AppError("DATABASE_UNAVAILABLE", 503);
}
export function supabaseRepository(client: SupabaseClient): Repository {
  return {
    async select(table, options = {}) {
      let query = client.from(table).select(options.columns ?? "*");
      for (const [key, value] of Object.entries(options.filters ?? {}))
        query = query.eq(key, value);
      if (options.order)
        query = query.order(options.order, {
          ascending: options.ascending ?? false,
        });
      const { data, error } = await query.limit(options.limit ?? 100);
      if (error) throw databaseError(error);
      return (data ?? []) as unknown as Row[];
    },
    async rpc(name, args) {
      const { data, error } = await client.rpc(name, args);
      if (error) throw databaseError(error);
      return data as unknown;
    },
  };
}
