import { z } from "zod";

export const uuid = z.uuid();
export const memoryTypes = [
  "overview",
  "architecture",
  "convention",
  "technical_fact",
  "design",
  "completed_task",
  "bug",
  "discovery",
  "handoff",
  "documentation",
] as const;
export const provenanceTypes = [
  "suggestion",
  "agent_assumption",
  "team_decision",
  "code_change",
] as const;
export const sourceInput = z
  .object({
    file: z.string().min(1).max(240).optional(),
    commit: z
      .string()
      .regex(/^[a-f0-9]{7,40}$/)
      .optional(),
  })
  .strict();
export const memoryInput = z
  .object({
    topic: z.string().trim().min(3).max(100),
    content: z.string().trim().min(10).max(3000),
    type: z.enum(memoryTypes),
    provenance: z.enum(provenanceTypes).default("agent_assumption"),
    source: sourceInput.optional(),
  })
  .strict();
export type MemoryInput = z.infer<typeof memoryInput>;
export const brainInput = z
  .object({
    name: z.string().trim().min(3).max(80),
    overview: z.string().trim().max(1000).default(""),
    is_global: z.boolean().default(false),
  })
  .strict();
export const searchInput = z
  .object({
    brain_id: uuid,
    query: z.string().trim().max(500).default(""),
    type: z.enum(memoryTypes).optional(),
    layer: z.enum(["working", "established"]).optional(),
    status: z
      .enum(["unverified", "verified", "disputed", "superseded"])
      .optional(),
    limit: z.number().int().min(1).max(30).default(10),
    token_budget: z.number().int().min(32).max(8000).default(2000),
  })
  .strict();
export const syncInput = z
  .object({
    brain_id: uuid,
    event_key: z.string().regex(/^[a-f0-9]{64}$/),
    session_key: z.string().regex(/^[a-f0-9]{64}$/),
    client: z.enum(["claude-code", "cursor", "vscode", "cli"]),
    event: z.enum([
      "session_start",
      "decision",
      "task_completed",
      "session_end",
      "file_changed",
    ]),
    facts: z.array(memoryInput).max(20),
  })
  .strict();
export type SyncInput = z.infer<typeof syncInput>;
export const brainRef = z.object({ brain_id: uuid }).strict();
export const memoryRef = z.object({ brain_id: uuid, memory_id: uuid }).strict();
export const writeInput = brainRef.extend(memoryInput.shape).strict();
export const updateInput = memoryRef
  .extend({
    expected_version: z.number().int().positive(),
    ...memoryInput.shape,
    promote: z.boolean().default(false),
  })
  .strict();
export const reportInput = memoryRef
  .extend({
    reason: z.enum([
      "personal_information",
      "secret",
      "unrelated",
      "incorrect",
      "prompt_injection",
    ]),
    request_deletion: z.boolean().default(false),
  })
  .strict();
export const memberInput = brainRef
  .extend({ actor_id: uuid, role: z.enum(["admin", "member"]) })
  .strict();
export const resolutionInput = memoryRef
  .extend({
    superseded_memory_id: uuid,
    expected_version: z.number().int().positive(),
    expected_superseded_version: z.number().int().positive(),
  })
  .strict();

export interface Brain {
  id: string;
  name: string;
  overview: string;
  is_global: boolean;
  created_at: string;
}
export interface Membership {
  brain_id: string;
  actor_id: string;
  role: "admin" | "member";
}
export interface Memory {
  id: string;
  brain_id: string;
  topic: string;
  content: string;
  type: (typeof memoryTypes)[number];
  provenance: (typeof provenanceTypes)[number];
  layer: "working" | "established";
  status: "unverified" | "verified" | "disputed" | "superseded";
  version: number;
  created_at: string;
  updated_at: string;
  actor_id: string;
  source?: z.infer<typeof sourceInput>;
  score?: number;
}
export interface SyncEvent {
  id: string;
  brain_id: string;
  status: "pending" | "completed" | "failed";
  attempts: number;
  error_code: string | null;
  created_at: string;
}
