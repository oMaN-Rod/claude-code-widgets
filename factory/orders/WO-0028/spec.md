# Amendments (`amendments-widget`)
## Purpose
For anyone who has said "Claude feels different today" after an update. Every Claude Code release rewrites what Claude is told (the system prompt's sections, the built-in tools' descriptions) and nobody publishes that changelog. Amendments saves that text once per engine version and, the first turn after an update, lists what was added, dropped or rewritten since the version last run on this machine, with a line diff one verb away. No model call, nothing added to a prompt, both hooks return the engine's answer untouched. Settled, with the reason:
- The engine's own text, not a neighbour's: after `await next(e)` the hook reads the `returned` of the `next.trace` entry whose `plugin` is `engine`, so another plugin's rewrite is never reported as a release change. Only when no such entry exists is what `next(e)` resolved used.
- Release against yours: only sections with `scope` `shared` and no `:` in the id, and tools whose `e.provider.plugin` is `engine`, are saved. Memory, environment, plugin and MCP text never enter the file.
- Text that varies inside one build is not an amendment: an entry seen with two texts under one version becomes loose and is left out of every comparison (the Agent tool's list of agent types, a section that carries a path). This is checked by the widget itself, session after session, not assumed.
- Like with like: one book per key; one key per session (the first main render); subagent, teammate and `/context` renders are kept out by the main-render rule below. A model switch mid-session is picked up by the next session.
- Tools: `tool.describe` fires only when a schema is first rendered, so a tool is compared only once described under both versions. A tool appearing or disappearing is never reported.
- Compared with the version last run here, and the card says which (`2.1.287 → 2.1.289`); a downgrade reads the same way round. Two snapshots a book, four books.
- Cut: a toast, history beyond one step back, section sizes in characters, reading `$.tool.list` or `$.prompt.compose()`.
## Terms
- Main render: a `prompt.compose` whose `e.traits` holds neither `teammate` nor `analysis` and whose engine answer opens with a section id of `intro`, `lean_body` or `bare`.
- Key: `e.promptModel`, the other traits sorted and joined with `+`, and `e.outputStyle?.name ?? ''`, joined with `|`.
- Entry: `s/<id>` for a saved section (label `<id>`), `t/<tool>` for a saved tool (label `<tool> tool`); its value is the text.
- Capture: while on and `held.key` is `''`, the first main render sets `held.key` and puts its entries in `held.texts`. While on, each engine tool described is added to `held.texts`. Nothing else is done in either hook.
- Flush: at `turn.complete`, when on, `held.key` is set and `held.texts` is not empty: read the file once and take the book of the key. No book: `now` is a shot of `held.texts`, `before` null. `now.version` is another version: `before` becomes the old `now`, `now` a new shot. Same version: a held tool not in `now` is added; a held entry whose text differs from `now`, and (when the flush carries sections) a section on one side only, joins `loose`; `now` keeps its text. Then `last` is the key, only the four books with the newest `now.at` stay, the file is written if it changed, `held.texts` is emptied and the report rebuilt.
- Amendments of a book with a `before`: over entries not loose, sorted by id: a section only in `now` is `new`, only in `before` `dropped`; an entry in both with different text is `+a -b` (lines added and removed). Numbered from 1.
- Diff: split on `\n`, drop the common head and tail, longest common subsequence on the middle when the two lengths multiply to 250,000 or less, else every old middle line removed and every new one added.
- Look: at `session.start` when on, and at `on`: read `$.session.version()` and the file and build the report for the book of `last`. Any throw leaves the empty report; a file that is not the shape below is a fault.
## Card
Title `Amendments`. Notes at 30 columns and wider: `baseline`, `new`, `unchanged`, `plural(n, 'amendment')`, `error`; under 30 only the bare count, when there are amendments. Sentences wrap. An amendment row is `<n> <label>` cut with `…`, its fact (`new`, `dropped`, `+a -b`) whole at the right. At most 6 amendment rows, then dim `… <k> more in show` (`… <k> more` under 30), dim `<before> → <now>`, dim `show <n>: before and after` (`show <n>` under 30).
```
Empty: on, no book yet.
│ Amendments                           │
│ No baseline yet. After your next     │
│ turn what Claude Code tells Claude   │
│ is saved, and each update is         │
│ compared with it.                    │
Baseline: the first flush of a key.
│ Amendments                  baseline │
│ 14 sections, 9 tools                 │
│ Baseline taken at 2.1.289. The next  │
│ update is compared with it.          │
Working: a session opens on a version the book has not seen.
│ Amendments                       new │
│ 2.1.289 is new here (was 2.1.287).   │
│ Compared after your next turn.       │
At rest: compared, nothing moved.
│ Amendments                 unchanged │
│ 14 sections, 31 tools                │
│ No change since 2.1.287.             │
│ 2.1.289 here for 9d 4h               │
Best moment: the first turn after an update.
│ Amendments              3 amendments │
│ 1 session_guidance               new │
│ 2 tone                         +4 -2 │
│ 3 Bash tool                    +0 -3 │
│ 2.1.287 → 2.1.289                    │
│ show <n>: before and after           │
Error: the file is not what the widget wrote, or a write failed.
│ Amendments                     error │
│ The snapshot file could not be read. │
│ /amendments-widget clear starts      │
│ again.                               │
Busiest at 20 columns (9 amendments):
│ Amendments     9 │
│ 1 actions  +2 -2 │
│ 2 doing_t… +9 -1 │
│ 3 intro  dropped │
│ 4 session_g… new │
│ 5 tone     +4 -2 │
│ 6 Bash to… +0 -3 │
│ … 3 more         │
│ 2.1.287 → 2.1.2… │
│ show <n>         │
```
The write fault reads `The snapshot file could not be written.` with the same second sentence.
## Commands
`/amendments-widget [on|off|show [n]|clear]`, verb matched without regard to case. Bare, `on`, `off` and the usage as in the template (`Amendments on; /widgets places it.`, `Amendments off.`). No second command, no tool.
- `show`: reads the file and answers for this session's book (the book of `last` before the first capture). No book: `No baseline yet.` No `before`: `Baseline taken at <version>: <s> sections, <t> tools. Nothing to compare yet.` Else `<before> → <now> (<key>): <plural amendments>` (`No change since <before> (<key>).` with none), then one line per amendment `<n>  <label>  <fact>`, then, when any, `Left out, varies within one build: <loose labels, comma separated>`, then `Compared: shared sections and built-in tool descriptions as the engine wrote them, against the version last run here.` A fault answers the card's sentence.
- `show <n>`: `<n> <label>: <fact>, <before> → <now>`, then the diff: changed lines prefixed `- ` and `+ `, two context lines prefixed with two spaces each side of a run, a line `…` between runs, cut after 200 lines with `… <k> more lines`. `new` is every line `+ `, `dropped` every line `- `. Not held: `No amendment <n>. There are <count>.` An `n` that is not a whole number above 0, or a second word, answers the usage.
- `clear`: writes the file as `{ "last": "", "books": {} }`, resets `held` and the report, answers `Amendments cleared. A new baseline is taken at your next turn.` It also clears a fault.
- While off, `show` and `clear` answer `Amendments is off.` and touch nothing.
## Data
Verified in this build's types (`plugin-authoring/types/claude-code.d.ts`, 2.1.289; `plugins/*/.claude-plugin/types/` is absent from this checkout).
- `on('prompt.compose', hook)`: `PromptComposeInput` `{ model, promptModel, surfaces, tools, outputStyle, traits }`; `next(e)` resolves `PromptComposeResult` `{ sections }`, each `PromptComposeSection` `{ id, text, scope }`, `PromptComposeScope` `'shared' | 'session'`, `PromptComposeTrait` including `'teammate'` and `'analysis'`. "The full prompt opens `intro`, `system`, `doing_tasks`, `actions`, `tools`, `tone`; the short one opens `lean_body` instead; `--bare`'s one section is `bare`"; "`shared` text reads the same for everyone on this build and model". Raised for every prompt sent: the hook is `const answer = await next(e)`, one state read, at most one state write per session, inside `try`/`catch`, and returns `answer` itself. Off: `return next(e)`.
- `on('tool.describe', hook)`: `ToolDescribeInput` `{ tool, description, isDeferred?, provider }`, `provider: Origin` (`{ plugin: "engine", tier: "core" }` for a built-in); `ToolDescribeResult` `{ description, isDeferred? }`; "fires once per tool, when the engine first renders the tool's schema in a session". Same form: await, record the engine's `description`, return the answer itself. Never `$.ui.invalidate`.
- `next.trace`: `readonly TraceEntry[]`, "an entry per link beneath, nearest first, the engine's last", each with `plugin` (`"engine"` for the engine's own) and `returned`.
- `on('turn.complete', hook)`: the flush, then `return next(e)`; no work when nothing is held.
- `$.session.version(): Promise<SessionVersion>` `{ version, base?, builtAt? }`; `version` is used. Once per look and per flush.
- `$.fs.read`, `$.fs.write` on `${$.plugin.root}/amendments.json`: one read per look, flush, `show`; a write only when the book changed and at `clear`. `$.clock.now` for `at` and the age. `$.store`, `$.command.register`, `on('command.run')`, `on('session.start')`, the three `ui.render` hooks, `$.widgets.card`, `atom`/`read`/`update`. Not used: `prompt.section`, `$.prompt.compose`, `$.tool.list`, `$.model`, timers, `prompt.submit`.
## State and storage
- `$.state` `isOn: boolean`.
- `$.state` `held: AmendmentsHeld` `{ key: string; texts: Record<string, string> }`, default `{ key: '', texts: {} }`.
- `$.state` `report: AmendmentsReport` `{ kind: 'none' | 'new' | 'baseline' | 'same' | 'changed' | 'fault'; version: string; since: string; age: string; sections: number; tools: number; rows: AmendmentsRow[]; fault: '' | 'read' | 'write' }`, `AmendmentsRow` `{ id: string; label: string; fact: string }`; `age` is `span()` of now less `now.at`, taken when the report is built. `kind` is `new` only from a look that finds `now.version` other than the running one.
- File `${$.plugin.root}/amendments.json`: `{ last: string; books: Record<string, AmendmentsBook> }`; `AmendmentsBook` `{ now: AmendmentsShot; before: AmendmentsShot | null; loose: string[] }`; `AmendmentsShot` `{ version: string; at: number; texts: Record<string, string> }`. About 100 KB a shot, under 1 MB in all.
- `$.store` `isOn` only. No module-level `let`.
## Off
No card; the three hooks return `next(e)` with no state read past the switch, no trace read, no file access. Switching off resets `held` and `report`; the file stays for the next time (only `clear` wipes it). No timer exists.
## Demo
`docs/engine.js` has no `prompt.compose`, `tool.describe`, `session.version` or `next.trace`. Stand-ins needed: `session.version` answering `{ version: '2.1.289', base: '2.1.289' }`; at the start of the scripted turn one `prompt.compose` dispatch (`promptModel: 'claude-demo'`, no traits, null style; shared `intro`, `system`, `doing_tasks`, `actions`, `tools`, `tone`, `session_guidance`, session `memory`) and a `tool.describe` each for `Read`, `Edit`, `Bash` with the engine as provider (without `next.trace` the widget takes the dispatch's answer, as specified); and a seeded `amendments.json` under the plugin root with a book `claude-demo||` at `2.1.287` lacking `session_guidance`, with two other lines in `tone` and three more lines in `t/Bash`. At rest: the working card, `2.1.289 is new here (was 2.1.287).` After the turn: the best-moment card exactly as drawn. With no stand-in the card shows the empty sentence and never throws.
## Live
`bun factory/tools/live.ts factory/floor/plugins/amendments-widget --say "/amendments-widget on" --say "Answer with the single word ok." --say "/amendments-widget show" --say "/amendments-widget off"`
One tool-less turn in the factory's scratch project and config. A good run: `show` answers `Baseline taken at <the running version>: <s> sections, <t> tools. Nothing to compare yet.` with `s` at least 1, and the store prints `isOn` false. The builder then reads `~/.claude-factory/live/amendments-widget/amendments-widget/amendments.json` (it survives until the next run) and logs: the key (its model must be the session's main model, not a side call's), the section ids (none session-scoped, none with `:`), the tool names, and whether `t` is 0 (tools described before the switch came on are missed that session, by design). Run it a second time, keeping the first file aside: the two `texts` must match entry for entry; any that differ are logged by id, and they are exactly what the loose rule exists for. The comparison across versions cannot be run live and is proved by the tests with fabricated snapshots.
## Cost
None: no tokens, no model call, nothing added to context, the prompt cache untouched. One state read per request; one file read and at most one write per turn that described something new.
## Acceptance
- A1: on with no file, the card shows the empty sentence with no note in all three placements, `show` answers `No baseline yet.`, and nothing is written to disk before a `turn.complete`.
- A2: a main render (shared `intro`, `tone`; session `memory`; shared `acme:policy`) plus `tool.describe` for `Bash` (engine) and `mcp__x__y` (provider `mcp:x`), then `turn.complete`, writes one book under the key with `now.texts` holding exactly `s/intro`, `s/tone`, `t/Bash`, `before` null and `last` the key; the card reads `baseline`, `2 sections, 1 tool` and the baseline sentence; both hooks returned the very object `next` gave.
- A3: with a plugin beneath that rewrites `tone` and the `Bash` description, the saved texts are the engine's (from `next.trace`), and the model still gets the rewritten ones; with no `engine` trace entry the saved texts are what `next` resolved; a hook body that throws on a malformed answer still returns that answer.
- A4: renders with `teammate`, with `analysis`, or opening with an id other than `intro`, `lean_body`, `bare` capture nothing; after one capture a second main render with another key changes neither `held` nor the file, and writes no state.
- A5: a book at `2.1.287` and a session at `2.1.289` whose render adds `session_guidance`, drops `system`, changes four lines for two in `tone`, and whose `Bash` description loses three lines: after the turn the note is `4 amendments`, the rows are `1 session_guidance new`, `2 system dropped`, `3 tone +4 -2`, `4 Bash tool +0 -3` in that order, then `2.1.287 → 2.1.289` and the hint; `before` is the old `now`.
- A6: the same texts under a new version give the card `unchanged`, `No change since 2.1.287.` and `2.1.289 here for <span>`; a downgrade to `2.1.286` with changed `tone` reads `2.1.289 → 2.1.286`.
- A7: at `session.start` while on, and at `on`, with a file whose `last` book is at another version, the card reads `2.1.289 is new here (was 2.1.287).` with note `new`; with the same version it draws that book's report; a `$.session.version` that throws leaves the empty card.
- A8: a tool in `now` only or in `before` only makes no row; described in a later turn of the new version with other text, it becomes a row at that turn's flush; a turn that describes nothing new reads and writes no file.
- A9: a second session on the same version with another `tone` text, a section missing and an extra section marks those three loose, leaves `now.texts` as stored and adds a tool not yet in `now`; after the next update none of the three makes a row, and `show` lists them under `Left out, varies within one build:`.
- A10: a render with another `promptModel`, trait set or output style opens its own book as a baseline and never compares with the first; a fifth book drops the one with the oldest `now.at`.
- A11: `show 3` in A5 answers the header and a diff with `- ` and `+ ` lines, two context lines, `…` between runs, and the same counts as the card; `show 1` is all `+ `, `show 2` all `- `; a 300-line change is cut at 200 lines with `… <k> more lines`; middles of 600 by 600 lines take the remove-all, add-all path.
- A12: `show 9` answers `No amendment 9. There are 4.`; `show 0`, `show x`, `show 1 2`, `SHOW` (accepted as `show`) and `what` behave as specified, the usage naming every verb.
- A13: a file holding `nope` or `{}` gives the error card and the read sentence from `show`, and no flush writes over it; a write that throws gives the written sentence; `clear` writes the empty shape, resets `held`, answers its sentence, and the next turn takes a baseline.
- A14: while off, `show` and `clear` answer `Amendments is off.`; a render, a describe and a `turn.complete` write no state and touch no file; switching off resets `held` and `report` and leaves the file byte for byte.
- A15: at 20, 40 and 60 columns no row of any state breaks the border; a long label ends in `…` with its fact whole; 9 amendments show 6 rows and `… 3 more in show` (`… 3 more` under 30); under 30 the note is the bare count or nothing and the short hint is used.
## widget.json
- title: `Amendments`
- category: `Session`
- shows: `What changed in the system prompt and the built-in tool descriptions Claude Code gives Claude since the version you last ran, with the before and after one command away`
- commands: `/amendments-widget [on|off|show [n]|clear]`
- cost: ``
