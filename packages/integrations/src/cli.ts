import { parseArgs } from "node:util";
import { enroll, runHook } from "./hook.js";
import { safeError } from "../../core/src/errors.js";
const { values } = parseArgs({
  options: {
    enroll: { type: "boolean" },
    root: { type: "string" },
    brain: { type: "string" },
    server: { type: "string" },
    client: { type: "string" },
    event: { type: "string" },
  },
});
try {
  if (values.enroll) {
    if (!values.brain || !values.server)
      throw new Error("Missing enrollment arguments");
    const result = await enroll(values.root ?? process.cwd(), {
      brain_id: values.brain,
      server_url: values.server,
    });
    process.stdout.write(JSON.stringify(result) + "\n");
  } else {
    let input = "",
      oversized = false;
    for await (const chunk of process.stdin) {
      if (!oversized) {
        input += String(chunk);
        if (Buffer.byteLength(input) > 64000) {
          input = "";
          oversized = true;
        }
      }
    }
    if (oversized) throw new Error("Hook event exceeds local limit");
    const client = values.client,
      event = values.event;
    if (
      !["claude-code", "cursor", "vscode", "cli"].includes(client ?? "") ||
      ![
        "session_start",
        "decision",
        "task_completed",
        "session_end",
        "file_changed",
      ].includes(event ?? "")
    )
      throw new Error("Unknown hook");
    const result = await runHook({
      root: values.root ?? process.cwd(),
      client: client as "claude-code" | "cursor" | "vscode" | "cli",
      event: event as
        | "session_start"
        | "decision"
        | "task_completed"
        | "session_end"
        | "file_changed",
      input: input ? (JSON.parse(input) as unknown) : {},
      token: process.env.HIVEMIND_ACCESS_TOKEN,
    });
    if (result.output)
      process.stdout.write(JSON.stringify(result.output) + "\n");
    if (result.status === "queued")
      process.stderr.write(
        "Mio Hivemind: sanitized project notes queued locally.\n",
      );
  }
} catch (error) {
  process.stderr.write(`Mio Hivemind: ${safeError(error).code}\n`);
  if (values.enroll)
    process.exitCode = 1; /* Hooks fail open for workflow availability, never for data capture. */
}
