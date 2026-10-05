# Rehearsal (`rehearsal-widget`)
## Purpose
For anyone about to hand Claude a long turn and walk away. Rehearsal keeps one real example of each kind of tool call Claude has made in this project, across sessions, and every 5 seconds puts each one to the engine's own permission decision as a query (`$.tool.check`: nothing runs, no dialog opens). The card names the calls that would stop for a yes or be refused right now, and the lines move when the mode or the rules change. Settled, with the reason:
- Calls are collected in the widget's own `tool.check` hook, on real calls only (`tool_use_id` present): its `{ tool, input }` is exactly what a query takes, and `next(e)` is the first verdict, so collecting costs no query. A query (no `tool_use_id`, this widget's or another's) is never collected.
- Liveness is one timer. No event announces a Shift+Tab mode switch or an "always allow" answer, so `classic.ConfigChange`, `classic.PermissionRequest`, `$.settings.read` and a debounce are all cut: the 5-second rehearsal covers every cause.
- Mode is read from `permission_mode` on any classic hook input and is used for wording only. Unknown, `default`, `acceptEdits` and `plan` are dialog modes: an `ask` is `Would stop and ask`. In `auto`, `dontAsk` and `bypassPermissions` no dialog decides, so an `ask` is `Not settled by rules` and the card never says "stop". The mode can lag a Shift+Tab until the next classic event; verdicts do not lag.
- Wording: "would run" always carries "by the rules"; PreToolUse hooks and the classifier are not asked by a query, and the count is of calls seen here. The card never says "safe".
- Shape (`shapeOf(tool, input, root)`, pure) gives `{ key, label, input }`. The first string field among `command`, `file_path`, `notebook_path`, `path`, `url` is the subject. `command`: split on whitespace; drop a leading `cd <dir>` segment (up to and including the first `&&` or `;` token); head = the leading words, at most 3, ending before an operator token (`&&`, `||`, `;`, `|`) or a word containing any of `/ \ . = " ' $ @`; key `<tool>:<head>`, label the whole command with whitespace collapsed. A path: class `out` when it is absolute and not under `root` (compared through `folder()`), else `dot` when any segment below the root starts with `.`, else `in`; key `<tool>:<class>`, label `<tool> <path>`, the path relative to the root with `/` when inside. `url`: key `<tool>:<host>`, label `<tool> <host>`. No subject: key and label are the tool name, input `{}`.
- The checked input is the real one with every top-level string other than the subject replaced by `''` (no file content or edit text is kept); other fields stay. The whole command is checked and shown, compound or not: what the card shows is what was checked. The latest call of a shape replaces its example.
- Secrets: a command over 300 characters, or matching `/token|secret|passw|api[_-]?key|bearer|authorization/i`, `/:\/\/[^\/\s:]+:[^\/\s@]+@/` or `/[A-Za-z0-9+\/_=-]{32,}/`, is rehearsed this session and never written to the store (`isKept` false).
- Cap: 40 shapes per project; past it the least recently seen is dropped. A check that rejects (a stale path, a tool gone) makes that call `unknown`; it never throws into a real call.
## Card
Title `Rehearsal`. Note: empty state none; `all clear`; with refused or ask rows `<s> of <n>` (`<s>/<n>` under 30 columns), `s` counting refused plus ask; in a non-dialog mode `auto`, `dontAsk` or `bypass` instead; `no check` in the error state. Sentences wrap; a call row is one line cut at its end with `…`.
```
Empty: on, no call recorded for this project.
│ Rehearsal                            │
│ No calls seen in this project yet.   │
│ Each kind Claude makes is kept and   │
│ put to the permission check, unrun.  │
Working: some calls would stop.
│ Rehearsal                    4 of 41 │
│ Would be refused: 1 of 41            │
│ ✗ rm -rf build                       │
│ Would stop and ask: 3 of 41          │
│ ? bun install                        │
│ ? git push origin main               │
│ ? Write ../shared/config.json        │
│ 37 would run by the rules.           │
Best moment: nothing would stop.
│ Rehearsal                  all clear │
│ All 41 calls seen here would run.    │
│ By the rules now. Hooks are not      │
│ asked; a new kind of call may ask.   │
A non-dialog mode.
│ Rehearsal                       auto │
│ Not settled by rules: 3 of 41        │
│ ? bun install                        │
│ ? git push origin main               │
│ ? Write ../shared/config.json        │
│ 38 would run by the rules.           │
│ auto mode decides these, no dialog.  │
Error: every check rejected.
│ Rehearsal                   no check │
│ The permission check did not answer. │
│ Nothing is known about 41 calls.     │
Busiest at 20 columns:
│ Rehearsal   4/41 │
│ 1 of 41 refused  │
│ ✗ rm -rf build   │
│ 3 of 41 ask      │
│ ? bun install    │
│ ? git push orig… │
│ ? Write ../shar… │
│ 37 would run     │
```
Rules: rows are refused (`✗`, red), then ask (`?`, yellow), then unknown (`!`, dim), each group by label; a group's heading is drawn only when the group has a call. At most 4 call rows in all, then `and <k> more` (dim). Unknown calls (when not all are unknown) get the heading `<u> could not be checked` (`<u> unchecked` under 30) and are not counted in `s`. The would-run row counts `allow` verdicts and is drawn whenever any other row is; at 0 it reads `None would run by the rules.` (`0 would run`). From 50 columns a call row with a rule or reason ends ` · <why>` (dim), inside the same cut line. Under 30 the ask heading is `<a> of <n> ask`, in a non-dialog mode `<a> of <n> open`, and the mode row is `<mode> decides`. The mode word is `bypass` for `bypassPermissions`.
## Commands
`/rehearsal-widget [on|off|show|forget <n>|clear]`; the verb is matched without regard to case. Bare, `on`, `off` and usage as in the template (`Rehearsal on; /widgets places it.`, `Rehearsal off.`). No second command, no tool.
- `show`: rehearses first, then answers. Line 1 `Rehearsal in <project folder name>, <mode> mode: <a> would stop, <d> refused, <r> would run, of <n> seen here.` (`mode not seen yet` when unknown; `<a> not settled` in a non-dialog mode; `<u> unchecked, ` before `of` when any). With no calls the whole answer is `Rehearsal in <name>: no calls seen here yet.` Then one numbered row per call in the card's order, `allow` last: `<i>. refuse <label>`, `<i>. ask <label>`, `<i>. unchecked <label>`, `<i>. run <label>`, each followed by ` (<why>)` when the engine gave a rule or reason and ` [this session only]` when `isKept` is false. Last line: `By the rules as they stand; PreToolUse hooks and the auto-mode classifier are not asked.`
- `forget <n>`: drops row `n` of the latest `show`, writes the store at once and answers `Forgot: <label>.` No such row, or no `show` yet this session: `No row <n>; /rehearsal-widget show lists them.` A missing or non-numeric `n` answers the usage.
- `clear`: deletes this project's list and answers `Rehearsal cleared: <plural calls> forgotten for <name>.`
- While off, `show`, `forget` and `clear` answer `Rehearsal is off.` and change nothing.
## Data
Verified in `plugin-authoring/types/claude-code.d.ts` (2.1.289).
- `on('tool.check', hook)`: input `ToolCheckInput` `{ tool, input, tool_use_id? }`. `const verdict = await next(e)`; when on and `e.tool_use_id !== undefined`, upsert `shapeOf(e.tool, e.input, root)` with `seenAt` now and record `verdict` for it; always return `verdict` itself. Every real call; state only.
- `$.tool.check({ tool, input })` (`ToolCheckArgs`), resolving `ToolCheckResult` `{ decision: 'allow' | 'ask' | 'deny', reason?, rule?, hook? }`: `rehearse($)` asks it once per held call, in turn, each in its own try/catch (a rejection is `unknown`); `why` is `rule ?? reason ?? ''`. Run at `session.start` while on, at switching on, on a mode change, in `show`, and on each timer tick. It writes `verdicts` only when a verdict differs; a tick with no calls, or while a rehearsal is running, does nothing.
- `$.clock.every(5000, fn)` (`TimerCall`, `Timer.cancel`): started and stopped in `sync`, running exactly while the widget is on.
- `on('classic.*', hook)` (`Glob`; `BaseHookInput.permission_mode?: string`): when on and `e.permission_mode` is a string that differs from the held mode, store it and rehearse; always `return next(e)` untouched (`classic.PreToolUse` carries no such field and passes through).
- `on('turn.complete', hook)`: skipped when `e.agentId` is present; when on and the book is dirty, one `$.store.set` of the kept calls.
- `$.session.root()` for the project root; project key `folder(root)`; the name on `show` and `clear` is its last segment. `$.store.get/set/delete`, `$.command.register`, `on('command.run')`, `on('session.start')`, the three `ui.render` hooks, `$.widgets.card`. Not used: `tool.call`, `prompt.submit`, `$.settings`, `$.fs`, `$.process`, `$.ui.toast`, any model call.
## State and storage
- `$.state` `isOn: boolean`.
- `$.state` `book: RehearsalBook` `{ key: string; name: string; root: string; isDirty: boolean; calls: RehearsalCall[] }`; `RehearsalCall` `{ key: string; tool: string; input: Record<string, unknown>; label: string; seenAt: number; isKept: boolean }`.
- `$.state` `verdicts: Record<string, RehearsalVerdict>` by call key, `{ decision: 'allow' | 'ask' | 'deny' | 'unknown'; why: string }`.
- `$.state` `run: RehearsalRun` `{ mode: string; isRehearsing: boolean; shown: string[] }`; `mode` `''` is unknown, `shown` the call keys of the latest `show` in row order.
- `$.store` `isOn`; `calls:<project key>`: the calls with `isKept` true, each without `isKept`. Verdicts are never stored. No file. The timer handle is the only module-level `let`.
## Off
No card. The `tool.check`, `classic.*` and `turn.complete` hooks return `next(e)` after reading the switch: nothing collected, no query, no store write. Switching off cancels the timer and resets `book`, `verdicts` and `run`; a dirty book is not written. Stored lists stay until `clear`.
## Demo
`docs/engine.js` answers every `$.tool.check` with `allow` and raises no classic event, so the mode stays unknown (dialog wording). Stand-ins needed, for `rehearsal-widget` only: a seeded store `calls:/demo/project` holding Bash `npm test`, Bash `git status`, Read `src/sum.js`, Edit `src/sum.js`, Bash `git push origin main` and Bash `bun install`; and a `tool.check` query answer of `{ decision: 'ask' }` for a command starting `git push`, `bun install` or `git checkout`, `{ decision: 'allow', rule: 'Bash(npm test:*)' }` for `npm test`, else `allow`. At rest: note `2 of 6`, `Would stop and ask: 2 of 6`, `? bun install`, `? git push origin main`, `4 would run by the rules.` After the scripted turn the four new shapes (`cat .env`, `git checkout -- src/sum.js`, `npm install sum-utils-fast lodash@3.10.1`, `git commit -am "Fix the off-by-one in sum"`) have joined: note `3 of 10`, three ask rows with `? git checkout -- src/sum.js` among them, `7 would run by the rules.` Without the stand-ins the card must still boot to the empty state and reach `all clear` after the turn's next tick.
## Live
`bun factory/tools/live.ts factory/floor/plugins/rehearsal-widget --allow "Read" --say "/rehearsal-widget on" --say "Read README.md, then call the Write tool once to put the word hi in a new file named rehearsal.txt. If it is refused do not retry. Answer with the one word ok." --say "/rehearsal-widget show" --say "/rehearsal-widget clear" --say "/rehearsal-widget off"`
One turn with two tool calls, in the factory's scratch project under the factory's own config directory; the Write is refused by the headless host, so no file is made, and the last two lines leave the store as it was found. A good run: `show` opens `Rehearsal in scratch-project, default mode: 1 would stop, 0 refused, 1 would run, of 2 seen here.` and lists `1. ask Write rehearsal.txt` and `2. run Read README.md` (a why in brackets may follow), which only the query can have produced since `show` rehearses first; `clear` answers `Rehearsal cleared: 2 calls forgotten for scratch-project.` More rows are fine if Claude made other calls. If a row reads `unchecked` (the query refused an input with blanked strings), or the first line says `mode not seen yet` (no classic event carried `permission_mode`), the builder logs which and sends the order back to design.
## Cost
No tokens, no model call, nothing added to a prompt. While on, up to 40 local permission queries every 5 seconds. One store entry per project, written at most once per turn: one example command or path per kind of call, in plain text, never file content, and never a command that looks like it carries a secret.
## Acceptance
- A1: on in a project with no stored calls the card shows the empty sentences and no note in all three placements, and timer ticks make no `tool.check` query.
- A2: a `tool.check` carrying `tool_use_id` resolves to the very object `next` gave and adds its shape with that verdict; one without `tool_use_id` adds nothing; a second call of the same shape replaces the example and `seenAt` without adding a row.
- A3: `shapeOf` gives `Bash:git push --force` and `Bash:git push origin` for those two commands, `Bash:bun test` for `cd /c/x && bun test tests/a.test.ts` with the whole command as label, `PowerShell:git commit -am` for a PowerShell `git commit -am "x"`, `Write:in`, `Write:dot` (`.env`, `.github/a.yml`) and `Write:out` for paths against root `C:\Work\App` given as `c:/work/app/src/a.ts` and the like, `WebFetch:example.com`, and the bare tool name with input `{}` for an MCP tool; an Edit's `old_string` and `new_string` and a Bash `description` come back `''` while `command`, `file_path` and non-string fields are unchanged.
- A4: with verdicts of 1 deny, 3 ask and 37 allow the 40-column card shows note `4 of 41`, the refused heading and row, the ask heading and rows and `37 would run by the rules.` in the order drawn; with 6 ask it shows 4 call rows and `and 2 more`; at 60 columns a row whose verdict has a rule ends ` · <rule>`.
- A5: when every verdict is `allow` the card shows note `all clear` and `All <n> calls seen here would run.` with the two caveat lines, and no call row.
- A6: advancing the clock 5 seconds makes one query per held call with exactly the stored `{ tool, input }`; when the answer for a call changes from `ask` to `allow` with a rule the row leaves the card and the counts move; a tick whose answers are unchanged writes no state; a tick during a running rehearsal makes no query.
- A7: a classic event carrying `permission_mode: 'auto'` resolves to the very object `next` gave, triggers one rehearsal at once, and turns the card to note `auto`, `Not settled by rules: <a> of <n>` and `auto mode decides these, no dialog.`; `bypassPermissions` reads `bypass`; `acceptEdits`, `plan` and no mode at all keep `Would stop and ask`; a `classic.PreToolUse` event passes through and changes nothing.
- A8: a query that rejects for one call leaves the others' verdicts intact and shows `1 could not be checked` with a `!` row; when every query rejects the card shows note `no check` and the two error sentences; a real `tool.check` still resolves to what `next` gave while queries reject.
- A9: the first main-loop `turn.complete` after a collected call writes `calls:<key>` once, without `isKept`; a `turn.complete` with `agentId`, or with nothing changed, writes nothing; a command containing `--token abc`, one with `https://user:pw@host`, one with a 32-character run and one over 300 characters are rehearsed and shown this session and are absent from the written list.
- A10: a new session over a stored list rehearses at `session.start` while on and shows the working card before any call; a 41st shape drops the least recently seen; sessions whose root is `C:\Work\App` and `c:/work/app/` read and write the same `calls:` key.
- A11: `show` makes a fresh query per call, then prints the first line, the numbered rows in the order refuse, ask, unchecked, run with `(<why>)` and `[this session only]` where due, and the last line; with no calls it prints the one empty sentence; with mode unknown the first line says `mode not seen yet`, and in `auto` it says `<a> not settled`.
- A12: `forget 2` after a `show` removes that row's call from the card and the store at once and answers `Forgot: <label>.`; `forget 9`, and `forget 1` before any `show`, answer `No row <n>; /rehearsal-widget show lists them.`; bare `forget` and `forget x` answer the usage.
- A13: `clear` deletes `calls:<key>` and no other project's, returns the card to the empty state and answers `Rehearsal cleared: <plural calls> forgotten for <name>.`
- A14: while off, `show`, `forget 1` and `clear` answer `Rehearsal is off.`; a real `tool.check`, a classic event, a `turn.complete` and 30 seconds of clock collect nothing, make no query and write no state or store key; switching off after use cancels the timer, so later ticks make no query, and writes no list.
- A15: at 20, 40 and 60 columns no row of any state breaks the border, under 30 the note and headings take the narrow forms drawn and a long command ends in `…`; `SHOW` is accepted as `show`; `rehearse`, `show all` and `forget 1 2` answer `Usage: /rehearsal-widget [on|off|show|forget <n>|clear]` and change nothing; no verb switches the widget on.
## widget.json
- title: `Rehearsal`
- category: `Session`
- shows: `Which of the commands and edits Claude has made in this project would stop for permission or be refused right now, asked of the engine's own permission check without running anything`
- commands: `/rehearsal-widget [on|off|show|forget <n>|clear]`
- cost: `Up to 40 local permission queries every 5 seconds; keeps one example command or path per kind of call in the plugin store, in plain text`
