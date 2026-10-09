import { AppError } from "./errors.js";
import { memoryInput, type MemoryInput } from "./schemas.js";

export const PROJECT_TERMS =
  /\b(project|game|roblox|luau|lua|code|coding|commit|file|module|script|architecture|inventory|combat|multiplayer|matchmaking|server|client|database|api|bug|implementation|task|convention|design|knit|rojo|studio|test|build|deployment|enemy|spawning|state machine|documentation|replication|datastore|workspace)\b/i;
const PERSONAL =
  /\b(home|address|birthday|birthdate|phone|contact|email|family|wife|husband|partner|pregnant|relationship|health|medical|medication|diabetes|depression|salary|finance|bank|academic|school|university|personal|private conversation|lives in|my name|developer name)\b|\b(I|I'm|I've|my|mine)\b/i;
const SECRET =
  /\b(password|passwd|secret|credential|api[ _-]?key|access[ _-]?token|refresh[ _-]?token|private[ _-]?key|authorization|bearer)\b|sk-[a-z0-9_-]{8,}|gh[pousr]_[a-z0-9]{16,}|AKIA[A-Z0-9]{16}|-----BEGIN|\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+/i;
const PII =
  /[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?\d[\d ()-]{8,}\d)|\b\d{1,5}\s+\w+\s+(street|road|avenue|lane|drive)\b/i;
const INJECTION =
  /ignore\s+(all\s+)?(previous|prior|system)|system\s*(prompt|message|instruction)|reveal\s+(secrets|tokens)|developer\s+message|<\/?(system|assistant|user)>|you\s+(must|are required to)|execute\s+(this|the following)|do\s+not\s+follow/i;
const OPAQUE_SECRET = /\b[A-Za-z0-9+/=_-]{40,}\b/;

export function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "")
    .trim();
}
export function screenText(value: string, projectRequired = true): string {
  const clean = normalizeText(value);
  if (
    /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(clean) ||
    PERSONAL.test(clean) ||
    SECRET.test(clean) ||
    PII.test(clean) ||
    INJECTION.test(clean) ||
    OPAQUE_SECRET.test(clean)
  ) {
    throw new AppError("PRIVACY_REJECTED", 422);
  }
  if (projectRequired && !PROJECT_TERMS.test(clean))
    throw new AppError("PROJECT_RELEVANCE_UNCERTAIN", 422);
  return clean;
}
export function screenMemory(value: unknown): MemoryInput {
  const parsed = memoryInput.safeParse(value);
  if (!parsed.success) throw new AppError("INVALID_INPUT", 400);
  const fact = parsed.data;
  const result: MemoryInput = {
    ...fact,
    topic: screenText(fact.topic, false).toLowerCase(),
    content: screenText(fact.content),
  };
  if (fact.source?.file) {
    const file = screenText(fact.source.file, false);
    if (
      !/^[\w./-]+$/.test(file) ||
      file.startsWith("/") ||
      file
        .split("/")
        .some((segment) => !segment || segment === ".." || segment === ".") ||
      /(^|\/)(\.env[^/]*|credentials[^/]*|id_rsa|\.aws|\.ssh|\.git)(\/|$)/i.test(
        file,
      )
    ) {
      throw new AppError("UNSAFE_SOURCE", 422);
    }
    result.source = { ...fact.source, file };
  }
  return result;
}
