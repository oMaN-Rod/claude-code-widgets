# Attic

`attic-widget`, command `/attic-widget [on|off|show|keep <tool>|stow <tool>|clear]`

## What it shows

Which tools Claude actually calls in this project, counted across sessions, and where each tool's schema therefore lives: listed in every request, or put away behind ToolSearch. Tools with no calls in the last N sessions here go to the attic; tools that sit behind ToolSearch by the engine's rule but get fetched in most sessions (MCP tools, mostly) are brought to the front. The card gives the measured size of the tool schemas before and after.

- At rest: `11 tools in the attic, 3 brought forward. Tool schemas 14.2k -> 8.9k per request.`
- Before it has enough history: `Watching: session 2 of 5. Nothing moved yet. 9 tools never called here so far.`
- Best moment: `Claude fetched NotebookEdit from the attic; it stays listed from next session.` Or the first session in which a daily MCP tool is called with no ToolSearch step in front of it.

## Why it is remarkable

Closest existing widgets: `amendments-widget` hooks `tool.describe` but only reads descriptions; `context-widget` shows the tools category but cannot change it; `diet-widget` (waiting) trims tool output, not tool schemas. No shipped or waiting widget moves a tool, and none uses `isDeferred`.

What Attic adds: it is the first widget that changes what every request carries, from evidence and not from opinion, and it corrects itself. A tool put away and then needed comes back the next session; a tool brought forward and then unused goes back. The saving is a measured figure from the context breakdown, not an estimate. A person would say to a colleague: "it noticed I never use half the tools in this repo and took them out of every request."

## Sharpened

1. The first sessions are a dry run. With fewer than N sessions of tallies for the project, nothing moves and the card says what it would move and what that would free. This keeps the first impression honest and removes the risk of putting away a tool on no evidence.
2. The figure on the card comes from the breakdown's own rows: `ContextCategory` carries `tokens` and `isDeferred`, so the listed and on-demand schema sizes are both the engine's numbers. No arithmetic on description length.
3. Placements are fixed once per session, at the first `tool.describe`, from tallies loaded before it. They change mid-session only on the person's own verb.

## API it needs

All checked in `C:\Users\O\AppData\Local\Temp\claude\bundled-skills\2.1.289\7e86a5cb299e5f2a0c576d91ea4bd376\plugin-authoring\types\claude-code.d.ts`.

- `on("tool.describe")`: input `{ tool, description, isDeferred?: true, provider }`; answer `{ ...e, isDeferred: true | false }` (`ToolDescribeResult`, `ToolDeferral`). Fires once per tool at first render and is cached for the session.
- `on("tool.call")`: count calls per tool; a `ToolSearch` call's query (`select:<name>`) names a tool fetched from the attic.
- `on("session.start")`, `on("command.run")`, `on("ui.render")`.
- `$.tool.list()`: `ToolInfo { name, description, mcp }`.
- `$.session.usage({ breakdown: "summary" })`: rows of `ContextCategory { name, tokens, isDeferred, kind }`.
- `$.store` for per-project tallies and the keep and stow lists; `$.state` for this session's placements.
- `$.ui.invalidate("tool.describe")` only after the switch or a verb.

## Cost

No model calls and nothing added to prompts. While on it lowers the tokens of every request. The person pays one prompt-cache miss when the widget is switched or a verb moves a tool mid-session, and one extra ToolSearch step the first time Claude needs a tool that was put away. Attention: one card line that changes only when a tool moves.

## Risks the designer must settle

1. **Tools that must never be put away.** Fix a floor list (Bash, Read, Edit, Write, Grep, Glob, ToolSearch itself, and whatever else the session cannot work without) and say how it is kept current. Decide whether tools provided by plugins (`provider` is not the engine) are left alone; a widget's own tool, such as board-widget's `pin`, should not vanish.
2. **No ToolSearch, no attic.** If ToolSearch is not among `$.tool.list()` in this session, a deferred tool is a lost tool. The widget must then move nothing and say so.
3. **A tool out of sight may never be asked for.** A deferred tool is still named to the model, but Claude may reach for it less. "Zero calls" then confirms itself. Settle how a stowed tool gets a fair chance to return, for example by returning every stowed tool to the list for one session in every so many, or by treating a person's prompt that names the tool as a call.
4. **Timing.** `tool.describe` may fire before `session.start` has finished. The tallies must be readable synchronously at the first `tool.describe`, or the first session after a change is wrong. `$.store` is read once per session; confirm it is ready by then.
5. **Cache stability.** The answer for a tool must be the same every time it is asked in a session. Never decide from a tally that is still being counted in this session.
6. **What counts as a session and a call.** Choose N and the "most sessions" threshold; decide whether subagent calls count (`agentId` on the call), and whether a session with no tool calls at all counts toward N.
7. **Before and after must be comparable.** The breakdown in a session with the widget on has no "before" of its own. Say where the before figure comes from: the last dry-run session's rows, or the sum of this session's listed and stowed rows.
8. **Project key.** Tallies are per project; use the same folder key from every worktree, as ledger-widget does.
9. **Tests and the demo page.** `claude plugin test` and `docs/engine.js` must be able to raise `tool.describe` and return a breakdown with deferred rows; if the stand-in lacks them, the card still has to boot there.
