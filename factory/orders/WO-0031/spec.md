# Attic (`attic-widget`)
## Purpose
For anyone whose every request carries the schemas of tools Claude never calls in this project. Attic counts, per project and across sessions, which tools Claude calls; after 5 counted sessions it answers `tool.describe` so that unused built-in tools wait behind ToolSearch and on-demand tools Claude calls in most sessions are listed up front. It corrects itself: a stowed tool that gets called is listed again from the next session, a forwarded tool that falls out of use goes back. The card reports the engine's own figure for schemas held on demand, against a baseline taken while nothing was moved. Settled, with the reason:
- Evidence is a call, by any loop (a subagent's call shows the project needs the tool). A stowed tool that Claude fetches and calls is a call like any other, so no ToolSearch query is parsed.
- A session is counted at its first tool call while on; a session with no tool call does not count. `n` is the number this session has or would get: stored `sessions` + 1 until it is counted.
- Window: the 5 counted sessions before this one (`n-5 .. n-1`). Calls of session `n` never enter a decision of session `n`, so a tool's answer is the same every time it is asked (prompt cache).
- Dry run: while `n <= 5` evidence moves nothing. Airing: when `n % 10 === 0` evidence moves nothing either, so a stowed tool gets a session in full view and "never called" cannot confirm itself. The person's `keep` and `stow` hold in every session.
- Floor, a constant: `ToolSearch, Bash, Read, Edit, Write, Grep, Glob`. Never stowed, by evidence or by `stow`. Any other tool is one ToolSearch step away when stowed, so the list needs no upkeep; a name missing from a session is harmless.
- Evidence stows only tools whose `provider.plugin` is `engine`: a plugin's or an MCP server's tool is never put away unless the person says `stow`. Evidence forwards any tool the engine defers.
- No ToolSearch in `$.tool.list()`: nothing moves in either direction and the card says so. Counting goes on.
- The figure is the sum of `tokens` over breakdown rows of `kind` `deferred`, the engine's number; rows are never told apart by `name`, so there is no "listed schemas" figure and no "would free" figure in the dry run (built-in tools have no per-tool size in the types). Baseline: the same sum from the latest session in which the plan was empty.
- Timing: the plan is a pure function of the stored book, made at `session.start`. `$.tool.list()` is never called inside the `tool.describe` hook (it might raise the event again). A describe that arrives before the plan is ready passes through; `session.start` then calls `$.ui.invalidate('tool.describe')` once when the plan has moves, which costs nothing if no request has been sent.
- Two live sessions in one project: the store is read once per session, so the later writer's book wins. Evidence from one session can be lost; nothing breaks.
## Card
Title `Attic`. Note: `watching <n>/5` in the dry run, `airing`, `no search`, else `<a> away`; under 30 columns `<n>/5` for the first. Sentences wrap; a tool name is cut at its end with `…`. Tokens are written by `kilo`: under 1000 as is, else one decimal and `k` (`8.4k`), from 100k no decimal.
```
Empty: on, no tool recorded for this project yet.
│ Attic                   watching 1/5 │
│ Counting the tools Claude calls in   │
│ this project. After 5 sessions the   │
│ unused ones wait behind ToolSearch.  │
Working: the dry run, tools recorded.
│ Attic                   watching 2/5 │
│ Nothing moved yet.                   │
│ 9 tools never called here so far.    │
│ On demand now: 3.1k tokens           │
At rest: evidence has moved tools.
│ Attic                        11 away │
│ 11 tools in the attic, 3 forward.    │
│ On demand 3.1k -> 8.4k tokens        │
│ 5.3k less in every request           │
Best moment: a stowed tool was called.
│ Attic                        11 away │
│ Claude fetched PowerShell from the   │
│ attic. Listed again next session.    │
│ 11 tools in the attic, 3 forward.    │
│ On demand 3.1k -> 8.4k tokens        │
│ 5.3k less in every request           │
Airing (every 10th session).
│ Attic                         airing │
│ Airing: every tool is where the      │
│ engine puts it this session, so a    │
│ stowed tool can earn its way back.   │
Error: the session has no ToolSearch.
│ Attic                      no search │
│ No ToolSearch in this session, so    │
│ nothing is moved. Still counting.    │
Busiest at 20 columns:
│ Attic    11 away │
│ fetched PowerSh… │
│ 11 away, 3 fwd   │
│ 3.1k -> 8.4k     │
│ -5.3k/request    │
```
Rules: the counts row counts the plan's moves (`away`, `forward`), the person's included; in airing and no-search sessions it follows the sentence only when the person's lists move something. The fetch row names the latest fetched tool, and `<tool> and <k> more` after several; when that tool is stowed by the person the second sentence is `Stowed by you, so it stays.` Figure rows: with a baseline and moves, the two rows drawn (`<d> more in every request` and `+<d>/request` when on-demand tokens fell; `No change in a request` and `+0/request` when equal); without a baseline or without moves, `On demand now: <x> tokens` (`<x> on demand` under 30); nothing before the first measure or when the breakdown has no `deferred` row. The dry-run row reads `Every tool has been called here.` at 0; under 30 the dry-run rows are `nothing moved` and `<k> never called`, the empty, airing and no-search sentences are unchanged.
## Commands
`/attic-widget [on|off|show|keep <tool>|stow <tool>|clear]`; the verb is matched without regard to case, the tool name likewise against the book's names and `$.tool.list()`, and the stored name is the tool's own spelling. Bare, `on`, `off` and usage as in the template (`Attic on; /widgets places it.`, `Attic off.`). No second command, no tool.
- `show`: line 1 `Attic, session <n> in <project folder name>: <a> away, <f> forward.` (dry run: `Attic, session <n> of 5 in <name>: watching, nothing moved.`; then airing or no-search adds the card's sentence). Then one row per tool, away first, then forward, then kept, by name: `away <tool>: no call in the last 5 sessions` | `away <tool>: stowed by you` | `forward <tool>: called in <k> of the last 5 sessions` | `forward <tool>: kept by you` | `kept <tool>: kept by you` (listed by the engine already); in the dry run `would go <tool>: never called here`. Last line: the figure row of the 40-column card as one line, when there is one.
- `stow <tool>`: adds the tool to the project's stow list and removes it from keep; moves it now. Answers `<tool> is in the attic from the next request. One prompt-cache miss.` On a floor tool: `<tool> is never put away.` Repeated on a stowed-by-you tool it releases it: `<tool> is back to evidence.`
- `keep <tool>`: adds to keep, removes from stow; the tool is listed (forwarded when the engine defers it) and evidence never stows it. Answers `<tool> stays listed.`; repeated, it releases as above. Both verbs: an unknown name answers `No tool named <x> in this session.`; a missing name answers the usage. Both write the book at once and call `$.ui.invalidate('tool.describe')` only when the tool's place changed.
- `clear`: deletes this project's book (tallies, baseline, both lists); the dry run starts over at session 1; invalidates when the plan had moves. Answers `Attic cleared: <plural tools> forgotten for <name>.`
- While off, `show`, `keep`, `stow` and `clear` answer `Attic is off.` and change nothing.
## Data
Verified in `plugin-authoring/types/claude-code.d.ts` (2.1.289).
- `on('tool.describe', hook)`: input `ToolDescribeInput` `{ tool, description, isDeferred?: true, provider }` (`provider.plugin` is `engine` for a built-in). Once per tool per session, again after an invalidate. While on and the plan is ready: `const answer = await next(e)`; record `{ isEngine, isDeferred: e.isDeferred === true, seen: n, since }` for the tool in the book; return `{ ...answer, isDeferred: true }` for an `away` move, `{ ...answer, isDeferred: false }` for `forward`, else `answer` itself (`ToolDescribeResult`, `ToolDeferral`). Any throw in the widget's own work still returns `answer`.
- `on('tool.call', hook)`: reads `e.tool` only (`e.agentId` not consulted), then returns `next(e)` untouched. First call of the session sets `sessions = n`; first call of each tool appends `n` to its `used`; a call to a tool whose move is `away` appends it to `fetched`. State only, no store write.
- `on('turn.complete', hook)`: skipped when `e.agentId` is present. If the session is counted and the book changed, one `$.store.set`. If no measure has been taken since the plan was made or changed and a request has been sent, one `$.session.usage({ breakdown: 'summary' })`: sum `tokens` of `context.breakdown.categories` with `kind === 'deferred'` (`ContextCategory`); with an empty plan that sum becomes the book's `base`.
- `$.tool.list()` (`ToolInfo { name, description, mcp }`): at `session.start` while on, at switching on, and in `keep`/`stow`; only `name` is read.
- Project key: `folder((await $.session.repo())?.root ?? (await $.session.root()))`; `SessionRepo.root` is "the main working tree's for a worktree", so every worktree shares one book. The name on `show` is the key's last path segment.
- `plan(book, n, hasSearch)`, pure. Without ToolSearch: no moves. Person first: `stow` gives `away`; `keep` gives `forward` when the book says the engine defers the tool. Then, unless dry run or airing, for tools on neither list: `away` when `isEngine`, not deferred, not on the floor, `since <= n-5`, `seen >= n-5` and no `used` entry in the window; `forward` when deferred and `used` has 3 or more entries in the window.
- `$.ui.invalidate('tool.describe')` (`InvalidatableEventName`): only at `session.start` with moves, at the switch with moves, and after a verb that changed a place. `$.store`, `$.command.register`, `on('command.run')`, `on('session.start')`, the three `ui.render` hooks, `$.widgets.card`. Not used: timers, `prompt.submit`, `$.ui.toast`, `$.fs`, `$.process`.
## State and storage
- `$.state` `isOn: boolean`.
- `$.state` `book: AtticBook` `{ key: string; sessions: number; base: number; keep: string[]; stow: string[]; tools: Record<string, AtticTool> }`; `base` -1 is no baseline; `AtticTool` `{ isEngine: boolean; isDeferred: boolean; since: number; seen: number; used: number[] }`. At each write `used` keeps entries `>= n-5` and a tool with `seen < n-5` on neither list is dropped.
- `$.state` `plan: AtticPlan` `{ isReady: boolean; n: number; mode: 'dry' | 'airing' | 'blind' | 'live'; moves: Record<string, 'away' | 'forward'> }`.
- `$.state` `run: AtticRun` `{ isCounted: boolean; isDirty: boolean; isMeasured: boolean; onDemand: number; fetched: string[] }`; `onDemand` -1 is not measured or no `deferred` row.
- `$.store` `isOn`; `book:<project key>`, the `AtticBook` without `key`. No file. No module-level `let`.
## Off
No card. The `tool.describe`, `tool.call` and `turn.complete` hooks return `next(e)` after reading the switch: no placement, no counting, no usage call, no store write. Switching off resets `book`, `plan` and `run` and, when the plan had moves, invalidates `tool.describe` so every tool returns to the engine's place on the next request. Stored books stay until `clear`.
## Demo
`docs/engine.js` lacks all of this; stand-ins needed, for `attic-widget` only: a seeded store `book:<ROOT>` with `sessions` 11, `base` 3100, `PowerShell`, `Artifact`, `SendFeedback` and `ReportFindings` as engine tools since 1 with no `used`, a deferred `WebFetch` with `used` `[8, 9, 11]`, and `Read`, `Edit`, `Bash` used throughout; `tool.list` answering those names and `ToolSearch`; one breakdown row `{ name: 'Tools on demand', tokens: 8400, kind: 'deferred', isDeferred: true }`; an `AFTER['attic-widget']` call to `PowerShell`. At rest: note `4 away`, `4 tools in the attic, 1 forward.` and no figure yet. After the scripted turn: the best-moment card, `Claude fetched PowerShell from the attic. Listed again next session.`, the counts row, `On demand 3.1k -> 8.4k tokens`, `5.3k less in every request`. Without the stand-ins the card must still boot to the empty state.
## Live
`bun factory/tools/live.ts factory/floor/plugins/attic-widget --say "/attic-widget on" --say "/attic-widget stow Skill" --say "Call ToolSearch once with the query select:Skill, then answer with the one word ok." --say "/attic-widget show" --say "/attic-widget clear" --say "/attic-widget off"`
One turn with one tool call, in the factory's scratch project under the factory's own config directory; the last two lines leave its store as it was found. A good run: `stow` answers `Skill is in the attic from the next request. One prompt-cache miss.`; the ToolSearch result lists `Skill` among its `matches`, which only a deferred tool can be, proving the `tool.describe` answer moved it; `show` reads `Attic, session 1 of 5 in scratch-project: watching, nothing moved.`, the row `away Skill: stowed by you`, and `On demand now: <x> tokens` with `x` above 0, proving the `deferred` rows are read; `clear` answers with a count of 1 or more. If `stow` answers `No tool named Skill in this session.`, the builder reruns with any non-floor name the session lists. If `matches` lacks the tool, or `show` has no figure, the builder logs which and sends the order back to design.
## Cost
No tokens added and no model call; one `summary` usage call per session (one more after each verb that moves a tool). While tools are away every request is smaller by the figure on the card. One prompt-cache miss when a verb or the switch moves a tool mid-session, and one extra ToolSearch step the first time Claude needs a stowed tool.
## Acceptance
- A1: on in a project with no book the card shows the empty sentence and `watching 1/5` in all three placements; a `tool.describe` raised then resolves to the very object `next` gave and records the tool with `since` and `seen` 1.
- A2: in a dry-run session (stored `sessions` 2) describes carry no `isDeferred` beyond what `next` gave, the card reads `watching 3/5`, `Nothing moved yet.` and `<k> tools never called here so far.` (`Every tool has been called here.` at 0); after a turn the store holds `sessions` 3 and `used` `[3]` for each called tool, written once; a session with no tool call writes no book and leaves `sessions` unchanged.
- A3: with a book of 7 counted sessions, `plan` gives `away` to an engine tool with no call in the window and to no tool that is on the floor, has a non-engine provider, has `since` inside the window, has a call in the window or is kept; it gives `forward` to a deferred tool with 3 calls in the window and not to one with 2; the describe answers are `{ ...answer, isDeferred: true }` and `{ ...answer, isDeferred: false }` with the description untouched.
- A4: a tool's describe answer is identical when raised again after that tool and others were called in this session, and `tool.call` resolves to the very object `next` gave.
- A5: at the first main-loop `turn.complete` the card gains `On demand 3.1k -> 8.4k tokens` and `5.3k less in every request` from a stored `base` of 3100 and `deferred` rows summing 8400; with rows summing 2000 it reads `1.1k more in every request`; with no `base` it reads `On demand now: 8.4k tokens`; with no `deferred` row there is no figure row; a `turn.complete` carrying `agentId` makes no usage call; a second turn makes none.
- A6: a call to an `away` tool, by the main loop or with an `agentId`, puts the fetch sentence on the card (two tools: `<tool> and 1 more`); a new session over the resulting store answers that tool's describe with no `isDeferred` added; a forwarded tool with one call left in the window is no longer forwarded; a fetched tool stowed by the person reads `Stowed by you, so it stays.` and stays `away` next session.
- A7: with `tool.list` lacking `ToolSearch` no describe answer is changed even with both lists filled, the card shows note `no search` and its sentence, and calls are still counted and stored.
- A8: when `n` is 10 evidence moves nothing, a tool on `stow` is still `away`, the card shows `airing` and its sentence; in a session whose plan is empty the first measure is stored as `base`, and with any move `base` is left as it was.
- A9: `stow PowerShell` during the dry run makes the next describe of it deferred, writes the book at once, calls `$.ui.invalidate('tool.describe')` once and answers the specified sentence; `stow bash` answers `Bash is never put away.`; `keep` on a deferred tool forwards it and on a listed one exempts it from evidence without an invalidate; repeating either verb releases the tool; `stow nosuch` and a bare `stow` answer the specified sentences; a name typed in another case is stored in the tool's own spelling.
- A10: `show` prints the first line and the rows in the specified order and wording for a plan holding an evidence stow, a personal stow, an evidence forward, a kept deferred tool and a kept listed tool, with the figure as its last line; in the dry run it prints the watching line and `would go` rows.
- A11: `clear` deletes `book:<key>` and no other project's, returns the card to the empty state at `watching 1/5`, invalidates only when the plan had moves and answers `Attic cleared: <plural tools> forgotten for <name>.`
- A12: `session.start` while on calls `$.ui.invalidate('tool.describe')` once when the plan has moves and never when it has none; a describe raised before `session.start` resolves to what `next` gave; switching on with moves invalidates once, and switching off invalidates once, resets `book`, `plan` and `run`, and later describes are untouched; `$.tool.list` is never called from inside the describe hook.
- A13: while off, `show`, `keep X`, `stow X` and `clear` answer `Attic is off.`, and a describe, a tool call and a `turn.complete` change no answer, write no state or store key and make no usage call.
- A14: at 20, 40 and 60 columns no row of any state breaks the border; under 30 the note, fetch, counts and figure rows take the narrow forms drawn, and a long MCP tool name ends in `…`.
- A15: `SHOW` is accepted as `show`; `attic`, `keep a b` and `show all` answer `Usage: /attic-widget [on|off|show|keep <tool>|stow <tool>|clear]` and change nothing; no verb switches the widget on; a session in a worktree (`session.repo` root `C:\Work\App`) and one in the main tree (`c:/work/app/`) read and write the same `book:` key.
## widget.json
- title: `Attic`
- category: `Session`
- shows: `Counts which tools Claude calls in this project, puts the unused ones behind ToolSearch, lists the daily ones up front, and reports how many schema tokens each request no longer carries`
- commands: `/attic-widget [on|off|show|keep <tool>|stow <tool>|clear]`
- cost: `Changes which tool schemas each request carries; one prompt-cache miss when you move a tool mid-session, and one extra ToolSearch step when Claude needs a stowed tool`
