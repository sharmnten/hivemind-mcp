# Client setup and compatibility

Documentation checked against official references on October 9, 2026. Hook
adapters and the MCP SDK are tested locally; vendor application UIs are not
assumed tested. Client releases and organization policies can change support.

| Client                          | Remote MCP retrieval/writes                      | Automatic ledger upload                             | Important limit                                                                               |
| ------------------------------- | ------------------------------------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Claude Code                     | HTTP with individual bearer header               | SessionStart, Stop, SessionEnd, matched PostToolUse | Requires project trust and installed hooks; background hooks may be interrupted               |
| Cursor                          | HTTP with environment-interpolated bearer header | sessionStart, stop, sessionEnd, afterFileEdit       | Session-start context injection is fire-and-forget                                            |
| VS Code / Copilot Local harness | HTTP with bearer header                          | Preview SessionStart, Stop, PostToolUse             | Requires trusted workspace and enabled Local hooks; Agent Host has separate provider behavior |
| ChatGPT                         | Tool-driven where custom MCP is enabled          | No conversation lifecycle adapter implemented       | Requires a reachable endpoint and supported user OAuth setup; plan/admin settings apply       |
| Claude desktop/web chat         | Tool-driven remote connector                     | No conversation lifecycle adapter implemented       | Client-supported header/OAuth configuration and reachable endpoint required                   |

All automatic capture means uploading the assistant-maintained structured
`.hivemind/notes.json` ledger. It does not mean reading/extracting conversations.
Use [shared instructions](../integrations/shared/project-memory.md) so the
assistant records minimal facts during normal development. No provider key is
needed by Hivemind. Your coding assistant's own account/subscription is separate.

## Common setup

Build Hivemind, create a brain, enroll exactly one approved project root, and
provide `HIVEMIND_ACCESS_TOKEN` through the client's secure process environment.
Use an individual Supabase session token. It expires; refresh it via Supabase Auth
and update/restart clients as necessary. Do not place tokens in project files.
Automatic refresh is handled by the dashboard's Supabase SDK; static MCP header
examples and hooks do not independently refresh credentials.

Replace `/ABSOLUTE/PATH/TO/hivemind-mcp` and `/ABSOLUTE/PATH/TO/PROJECT` in hook
examples. Paths with spaces need normal shell quoting. Commands do not interpolate
event input. Enrollment validates all supplied workspace roots and rejects a
nested or different root. Replace localhost MCP URLs with your trusted HTTPS
host for remote use. Merge configurations, preserving existing client entries.

## Claude Code

Merge [MCP](../integrations/claude-code/mcp.json) into project `.mcp.json` and
[hooks](../integrations/claude-code/settings.json) into `.claude/settings.json`.
Append the shared instructions to `CLAUDE.md`. Environment syntax is
`${HIVEMIND_ACCESS_TOKEN}`. SessionStart runs synchronously to return context;
write/task hooks use supported asynchronous commands. Stop uploads facts and
SessionEnd records the lifecycle event. Hook commands return no follow-up prompt,
so they do not request another agent turn.

Verify connection with `/mcp` and a harmless `list_brains` call. See the official
[MCP configuration](https://code.claude.com/docs/en/mcp) and
[hooks reference](https://code.claude.com/docs/en/hooks).

## Cursor

Merge [MCP](../integrations/cursor/mcp.json) into `.cursor/mcp.json` and
[hooks](../integrations/cursor/hooks.json) into `.cursor/hooks.json`. Put the shared
instructions in a project rule such as `.cursor/rules/hivemind.mdc` with
`alwaysApply: true` front matter. Cursor uses `${env:HIVEMIND_ACCESS_TOKEN}`.
Session-start context may arrive after the agent begins, so instructions should
also permit an explicit context retrieval call. File events upload the ledger,
never the changed file itself. See official
[MCP](https://cursor.com/docs/mcp) and [hooks](https://cursor.com/docs/hooks).

## VS Code / GitHub Copilot

Merge [MCP](../integrations/vscode/mcp.json) into `.vscode/mcp.json` and put
[hooks](../integrations/vscode/hooks.json) in `.github/hooks/hivemind.json` for the
Local harness. Add shared instructions to `.github/copilot-instructions.md`.
Enable the preview `chat.useHooks` setting and trust the workspace. Local uses
PascalCase events and `type: command`. It has no SessionEnd mapping here.
PostToolUse can be frequent; content-addressed events deduplicate identical facts.

This configuration targets Local harness hooks. Agent Host Copilot/Claude/Codex
harnesses have different hook discovery; do not assume these settings configure
them. See official [MCP reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)
and [hook preview](https://code.visualstudio.com/docs/agent-customization/hooks).

## ChatGPT and Claude chat

Use the same 14 tools and explicit brain instructions through a supported custom
remote MCP connection. There is no chat scraper, desktop filesystem hook, or
guaranteed end-of-conversation callback. Tool writes depend on the assistant,
client tool approval, and workspace policy. Never import personal memory profiles.

Do not register an unauthenticated server to work around client limitations.
OAuth-only clients need an authorization server that authenticates individual
Supabase users and issues Supabase-verifiable, resource-bound access tokens.
`MCP_OAUTH_ISSUER` advertises discovery; it does not implement authorization,
registration, login or consent endpoints. A complete OAuth consent application
is outside the current no-external-provisioning implementation. Clients that
support a secure individual bearer header can use that route instead.

ChatGPT's official [MCP server guide](https://developers.openai.com/plugins/build/mcp-server)
describes user OAuth and endpoint requirements; Claude's
[custom connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
describes remote connector configuration. Confirm available authentication
options in your client before deployment. A cloud client cannot reach your
ordinary localhost URL. No hosted connection has been provisioned or tested.

## Cross-developer example

Developer A's enrolled Claude Code repository records inventory authority in its
notes ledger. Stop automatically submits a screened, idempotent sync event.
Developer B, explicitly invited to that brain, retrieves the resulting fact
through Cursor or an MCP `search_memories` call. Another brain stays isolated.
Admins review assumptions, promote verified knowledge, resolve conflicts and
purge inappropriate memories through the dashboard.
