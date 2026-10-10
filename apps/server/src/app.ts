import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { AppError, safeError } from "../../../packages/core/src/errors.js";
import type { Authenticate } from "./auth.js";
import { HivemindService } from "./service.js";
import { createMcpServer } from "./mcp.js";

export interface AppOptions {
  publicUrl: string;
  allowedOrigins: string[];
  authenticate: Authenticate;
  ready: () => Promise<boolean>;
  rateLimit?: number;
  dashboardDir?: string;
  oauthIssuer?: string;
  browserConfig?: { supabaseUrl: string; supabasePublishableKey: string };
  audit?: (record: {
    event: string;
    request_id: string;
    status: number;
    duration_ms: number;
  }) => void;
}
export class RateLimiter {
  private readonly entries = new Map<
    string,
    { start: number; count: number }
  >();
  constructor(
    private readonly limit = 120,
    private readonly maxKeys = 10000,
  ) {}
  consume(key: string, now = Date.now()) {
    let row = this.entries.get(key);
    if (!row || now - row.start >= 60000) {
      if (this.entries.size >= this.maxKeys) {
        for (const [k, v] of this.entries)
          if (now - v.start >= 60000) this.entries.delete(k);
        if (this.entries.size >= this.maxKeys)
          throw new AppError("RATE_LIMITED", 429);
      }
      row = { start: now, count: 0 };
      this.entries.set(key, row);
    }
    if (++row.count > this.limit) throw new AppError("RATE_LIMITED", 429);
  }
}
export function createApp(options: AppOptions) {
  const app = express();
  app.disable("x-powered-by");
  const limiter = new RateLimiter(options.rateLimit),
    ipLimiter = new RateLimiter((options.rateLimit ?? 120) * 2);
  const host = new URL(options.publicUrl).hostname;
  const resource = `${options.publicUrl.replace(/\/$/, "")}/mcp`;
  const metadata = `${options.publicUrl.replace(/\/$/, "")}/.well-known/oauth-protected-resource`;
  const authOrigin = options.browserConfig
    ? new URL(options.browserConfig.supabaseUrl).origin
    : "";
  app.use((req, res, next) => {
    const id = randomUUID(),
      start = Date.now();
    res.setHeader("X-Request-ID", id);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Security-Policy",
      `default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' ${authOrigin}; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'`,
    );
    res.once("finish", () =>
      options.audit?.({
        event: "http_request",
        request_id: id,
        status: res.statusCode,
        duration_ms: Date.now() - start,
      }),
    );
    try {
      if (req.hostname !== host) throw new AppError("HOST_NOT_ALLOWED", 403);
      const origin = req.headers.origin;
      if (origin) {
        if (!options.allowedOrigins.includes(origin))
          throw new AppError("ORIGIN_NOT_ALLOWED", 403);
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-ID",
        );
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader(
          "Access-Control-Expose-Headers",
          "WWW-Authenticate, X-Request-ID",
        );
      }
      ipLimiter.consume(req.socket.remoteAddress ?? "unknown");
      if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
      }
      next();
    } catch (e) {
      next(e);
    }
  });
  app.use(express.json({ limit: "96kb", strict: true }));
  app.get("/health", (_req, res) =>
    res.json({ status: "ok", service: "mio-hivemind" }),
  );
  app.get("/ready", async (_req, res) => {
    const ready = await options.ready().catch(() => false);
    res
      .status(ready ? 200 : 503)
      .json({ status: ready ? "ready" : "unavailable" });
  });
  app.get("/api/config", (_req, res) => res.json(options.browserConfig ?? {}));
  app.get("/.well-known/oauth-protected-resource", (_req, res) =>
    res.json({
      resource,
      ...(options.oauthIssuer
        ? { authorization_servers: [options.oauthIssuer] }
        : {}),
      bearer_methods_supported: ["header"],
      resource_name: "Mio Hivemind",
    }),
  );
  app.use(["/api", "/mcp"], async (req, res, next) => {
    if (req.path === "/config") {
      next();
      return;
    }
    try {
      const auth = req.headers.authorization;
      if (!auth?.startsWith("Bearer ") || auth.length > 8200)
        throw new AppError("UNAUTHENTICATED", 401);
      const principal = await options.authenticate(
        auth.slice(7),
        req.baseUrl === "/mcp" ? "mcp" : "api",
      );
      if (!principal) throw new AppError("UNAUTHENTICATED", 401);
      limiter.consume(principal.actorId);
      res.locals.service = new HivemindService(
        principal.actorId,
        principal.repository,
      );
      res.locals.actorId = principal.actorId;
      next();
    } catch (e) {
      next(e);
    }
  });
  function route(
    method: "get" | "post",
    path: string,
    handler: (req: Request, service: HivemindService) => Promise<unknown>,
    status = 200,
  ) {
    app[method](path, async (req, res, next) => {
      try {
        res
          .status(status)
          .json(await handler(req, res.locals.service as HivemindService));
      } catch (e) {
        next(e);
      }
    });
  }
  route("get", "/api/me", async (_req, s) => ({ actor_id: s.actorId }));
  route("get", "/api/brains", async (_req, s) => s.listBrains());
  route("get", "/api/brains/:brainId", async (req, s) => ({
    brain: await s.brain(String(req.params.brainId)),
    members: await s.members(String(req.params.brainId)),
  }));
  route("get", "/api/brains/:brainId/context", async (req, s) =>
    s.context(String(req.params.brainId)),
  );
  route("get", "/api/brains/:brainId/activity", async (req, s) =>
    s.activity(String(req.params.brainId)),
  );
  route("get", "/api/brains/:brainId/reports", async (req, s) =>
    s.reports(String(req.params.brainId)),
  );
  route("get", "/api/brains/:brainId/sync", async (req, s) =>
    s.syncStatus(String(req.params.brainId)),
  );
  route("get", "/api/memories/:memoryId/history", async (req, s) =>
    s.history(String(req.query.brain_id ?? ""), String(req.params.memoryId)),
  );
  route("post", "/api/search", async (req, s) => s.search(req.body));
  route("post", "/api/actions", async (req, s) => {
    const parsed = z
      .object({ action: z.string(), payload: z.unknown() })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) throw new AppError("INVALID_INPUT");
    return {
      success: true,
      ...(await s.mutate(parsed.data.action, parsed.data.payload)),
    };
  });
  route(
    "post",
    "/api/sync",
    async (req, s) => {
      const job = await s.enqueue(req.body);
      // Only sanitized durable facts exist by this point; raw request context is never queued.
      setImmediate(() => {
        void s.process(String(job.id)).catch(() => {});
      });
      return job;
    },
    202,
  );
  route("get", "/api/sync/:eventId", async (req, s) =>
    s.syncStatus(String(req.query.brain_id ?? ""), String(req.params.eventId)),
  );
  app.post("/mcp", async (req, res, next) => {
    const server = createMcpServer(res.locals.service as HivemindService, () =>
      limiter.consume(String(res.locals.actorId)),
    );
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.once("close", () => {
      void server.close().catch(() => {});
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      next(e);
    }
  });
  app.all("/mcp", (_req, res) =>
    res.status(405).json({ error: "METHOD_NOT_ALLOWED" }),
  );
  if (options.dashboardDir) {
    app.use(express.static(options.dashboardDir, { index: "index.html" }));
    app.get(["/signup", "/login"], (_req, res) =>
      res.sendFile(resolve(options.dashboardDir!, "index.html")),
    );
  }
  app.use((_req, res) => res.status(404).json({ error: "NOT_FOUND" }));
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      const bodyError = error as { type?: string };
      const safe =
        bodyError.type === "entity.parse.failed"
          ? new AppError("INVALID_JSON")
          : bodyError.type === "entity.too.large"
            ? new AppError("PAYLOAD_TOO_LARGE", 413)
            : safeError(error);
      if (safe.status === 401)
        res.setHeader(
          "WWW-Authenticate",
          `Bearer resource_metadata="${metadata}"`,
        );
      if (safe.status === 429) res.setHeader("Retry-After", "60");
      res.status(safe.status).json({ success: false, error: safe.code });
    },
  );
  return app;
}
