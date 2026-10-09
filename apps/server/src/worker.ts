import { createClient } from "@supabase/supabase-js";
import { setTimeout as sleep } from "node:timers/promises";
import { config } from "./config.js";
const c = config();
if (!c.SUPABASE_WORKER_KEY)
  throw new Error(
    "The optional worker requires a server-only SUPABASE_WORKER_KEY.",
  );
const db = createClient(c.SUPABASE_URL, c.SUPABASE_WORKER_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
  },
});
let running = true,
  lastRetention = 0;
for (const s of ["SIGTERM", "SIGINT"])
  process.on(s, () => {
    running = false;
  });
while (running) {
  const { error } = await db.rpc("drain_sync_events", { p_batch_size: 20 });
  if (error)
    process.stderr.write(
      JSON.stringify({ event: "worker_error", code: "DATABASE_UNAVAILABLE" }) +
        "\n",
    );
  if (Date.now() - lastRetention > 3600000) {
    const result = await db.rpc("apply_retention");
    if (!result.error) lastRetention = Date.now();
  }
  await sleep(3000);
}
