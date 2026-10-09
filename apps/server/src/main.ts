import { configuredApp } from "./runtime.js";
const { app, config: c } = configuredApp();
const server = app.listen(c.PORT, c.HOST, () =>
  process.stdout.write(
    JSON.stringify({ event: "server_started", port: c.PORT }) + "\n",
  ),
);
server.requestTimeout = 15000;
server.headersTimeout = 10000;
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  });
