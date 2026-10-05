# Tap

`tap-widget`

## What it shows

One line per tap. A tap is one tool of an MCP server the person already has connected, called by the widget itself on a timer, with no model involved: open pull requests, today's errors, the next meeting. Each line carries the tap's label, a one-line reading of the latest result, how long ago it was read, and a mark when the result changed since the call before.

- At rest: "Name a server and a tool: /tap add <server> <tool> [json]".
- At its best: three taps, one line each, and a toast "tap 2 changed: 3 new errors" while Claude is busy with something else.
- When a call fails or the server is not connected: the line says so in words ("not connected", "the server answered an error") and never shows a stale value as current.

Commands: `/tap add <server> <tool> [json] [every <n>m]`, `/tap list` (servers and tools on offer), and on `/tap-widget`: `on`, `off`, `drop <number>`, `run <number>`, `show <number>` (the whole last result), `clear`.

## Why it is remarkable

Every MCP server a person has connected is a data source that only the model can reach today, at the price of a turn. `$.mcp.call` lets a widget use the engine's own connection and credentials, so any connected server becomes a dashboard tile for zero tokens. It is one widget that turns into as many as the person has servers.

Closest existing widgets, and what Tap adds:

- `watch-widget` reruns a shell command after edits and shows pass or fail. Tap reads a remote service through MCP, on a clock, with the person's existing sign-in.
- `notify-widget` only pushes out to a webhook. Tap pulls in.
- `usage-widget`, `git-widget`: fixed sources. Tap's source is whatever the person names.

No shipped or waiting widget calls `$.mcp` at all (checked: no hooks module in `plugins/` or `factory/floor/reference/` uses it).

## Sharpened

- Adding a tap makes the first call at once and shows what came back, so the first call is the person's own act and they see the result before any timer starts. A tap whose first call errors is not saved.
- The reading of a result is fixed and stated, not clever: `structuredContent` if present, else the first text block parsed as JSON, else the text. An array reads as its length and its first item's first short string field; an object as its first short string or number fields; text as its first non-empty line. An optional `pick <dot.path>` on `add` chooses the part to read. "Changed" compares that reading, not the raw result, so a timestamp in the payload does not light the line on every call.
- Results stay on the card. Nothing is sent to Claude.

## API it needs

Checked in `C:/Users/O/AppData/Local/Temp/claude/bundled-skills/2.1.289/7e86a5cb299e5f2a0c576d91ea4bd376/plugin-authoring/types/claude-code.d.ts`.

- `$.mcp.call(server, tool, args?) => Promise<McpToolResult>` (line 2616). `McpToolResult` is `{ content: McpContentBlock[], isError: boolean, structuredContent?: unknown }` (line 5829). Server by the name `/mcp` lists; the `claude_ai_Gmail` spelling is accepted too. "No permission prompt: the plugin's call ... is the grant."
- `$.tool.list() => Promise<ToolInfo[]>` (line 2909) for `/tap list`. `ToolInfo` is only `{ name, description, mcp }` (line 12411): no input schema and no read-only flag.
- `$.clock.every(ms, fn)` (line 3362) started and stopped in `sync()`.
- `$.ui.toast` (line 2363), `$.store` for the saved taps, `$.state` for the latest readings, `command.run`, `session.start`, `ui.render`.
- Second command `/tap` as the adder, like `/watch` and `/note`.

## Cost

No model tokens and nothing added to the context. One MCP request per tap per interval (default ten minutes, floor one minute) against that server's own quota. One toast when a reading changes. `widget.json` cost must say that it makes calls to the person's MCP servers on its own.

## Risks the designer must settle

1. Tools that change things. `$.mcp.call` asks nobody, and `ToolInfo` cannot tell a read from a write, so `/tap add ... create_draft` on a timer would create a draft every ten minutes. Settle a rule: only tools the person typed are ever called, the add reply says in plain words "this tool will be called every 10m without asking", and decide whether tool names that look like writes (create, send, delete, update, post) need an explicit confirmation word. Never call a tool the person did not name, including for `/tap list`.
2. Fitting a card. MCP results are often long JSON or prose. The fixed reading above must be proven against at least three real result shapes (a list, an object, plain text) and must cut to the card's width; `show <number>` is the escape hatch, capped.
3. Typing JSON arguments in a slash command. Decide how quoting works for server names with spaces (`"claude.ai Google Calendar"`) and the JSON tail; report a parse error with the position, do not guess.
4. One timer. The standard allows one timer handle: one tick that calls whichever taps are due, with calls not overlapping themselves when a server is slow.
5. Failure and backoff. `isError`, a rejected call, a server that needs sign-in, and a `cached` server dialed on first use each need their own words on the line; back off after repeated errors instead of calling every minute.
6. Several sessions. `$.store` is read once per session and every open session with the widget on will poll. Decide whether that is acceptable (state it in cost) or whether a file under `$.plugin.root` shares the last reading.
7. Untrusted text. Result text and server names come from outside: draw as plain text, strip control sequences, never as markup.
8. A cap on taps (the card holds a handful of lines) and on stored result size.
9. Live proof. Whether a plugin's `$.mcp.call` reaches the claude.ai connectors in practice must be shown in a live test before build, in a throwaway session and not the user's own (live tests leave no trace).
