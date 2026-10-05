# Landmarks (`landmarks-widget`)
## Purpose
For anyone forty turns into a session who needs "where the test first went red" or "the part where it asked me about the schema" and would otherwise scroll for it. Landmarks keeps a numbered table of contents of the session as it happens (prompts, each file's first edit, a check turning red or green, commits, Claude's questions) and pressing a line, or `go <n>`, scrolls the transcript to that row. It is the first widget that moves the transcript. No model call. Kept from the idea: the five kinds, stable numbers, the press and the keyboard route, a capped card that folds, plain words when a jump is refused. Settled, with the reason:
- Message rows are not targets. The types give a tool row's id (`tool_use_id`, "the same value as the row's `requestId`") but never say that `session.append`'s `uuid` is the id a `UserMessage` row is drawn under. So a prompt anchors to the first tool row of its turn and is marked `near`; a prompt whose turn made no tool call is listed with no jump. `session.append` is not hooked.
- The card names the layout, not a command: `/tui fullscreen` is not in the types, so the line reads `Jumping needs the fullscreen layout`.
- A resumed session starts empty: nothing is rebuilt from `$.session.messages()`, because no id there is promised to be a drawn row's.
- No "back to the bottom" control: the API gives none for the transcript.
- Added `list`: `go <n>` must reach folded lines, so the person needs to read their numbers. Cut: subagent calls (their rows are not in the main transcript), `NotebookEdit`, anything kept across sessions, a `session.compact` hook (a row that is gone is found out by the denied jump).
## Terms
- Main call: a `tool.call` with `e.agentId` absent whose result has no `deny`. Only main calls are read.
- Label: whitespace runs collapsed to one space, trimmed, cut to 48 characters. Line: `<kind>: <label>`, or the kind alone when the label is empty.
- Kinds, each landmark carrying the turn count and a row (a `tool_use_id`, or `''`):
  - `you`: at `turn.start` with non-blank `e.text`; label from its first non-blank line; row `''` until the first main call of that turn, whose id it takes with `isNear` true.
  - `edit`: an `Edit` or `Write` main call without `isError` on a path not yet edited (compared through `folder()`); label is the file's base name.
  - `red`, `green`: a `Bash` main call whose command's first line matches the regex of `checks-widget`, `/\b(test|tests|pytest|jest|vitest|tsc|lint|eslint|build|check|clippy)\b/`; failed means `isError === true`, as there. A failed check while the mood is not `red` adds `red`; a passed check while the mood is `red` adds `green`; every check sets the mood. Label: that first line.
  - `commit`: a `Bash` main call without `isError` whose first line matches `/\bgit\b.*\bcommit\b/`; label is the subject in `[branch hash] subject` from `stdout`, else empty. Added after any check landmark of the same call.
  - `asked`: an `AskUserQuestion` main call; label from `questions[0].question`.
- Number: the first landmark is 1, each later one the last number plus one, never reused until `clear` or off. The list holds the newest 200.
- Jump: `$.ui.scroll({ to: { requestId: row }, block: 'start' })`, called only inside a `Button` `onPress` or the `command.run` of `go`. A call that throws counts as denied with its message.
- Known default layout: `isFullscreen === false` (the render's `e.viewport?.isFullscreen` for a press, `e.presentation.isFullscreen` for `go`). Absent counts as able to jump.
## Card
Title `Landmarks`. Note `plural(n, 'landmark')` over the whole list, the bare count under 30 columns, none when empty. One row per landmark in number order: `<n> t<turn> <line>`, numbers right-aligned, cut at the end with `…`; a right-hand dim fact `near` or `gone` (`gone` wins). Under 30 columns: no `t<turn>`, no fact. A row with a row id is a `Button plain` keyed `go:<n>` (`dimColor` when gone); one without is dim `Text`. With more than 8 landmarks the card shows 7: non-prompts newest first, then the newest prompts to fill, drawn in number order under a first dim row `… <k> more in /landmarks-widget list` (`… <k> more` under 30). Last, one dim foot row, first that applies: known default layout, `Jumping needs the fullscreen layout` (`Needs fullscreen`); the last jump's answer if any; `Press a line or go <n>` (`go <n> jumps`).
```
Empty: on, nothing yet.
│ Landmarks                            │
│ No landmarks yet. Prompts, first     │
│ edits, red and green checks, commits │
│ and questions are listed here; press │
│ one to jump to it.                   │
Working: one turn in.
│ Landmarks                3 landmarks │
│ 1 t1 you: fix the login test    near │
│ 2 t1 edit: auth.ts                   │
│ 3 t1 red: npm test                   │
│ Press a line or go <n>               │
Best moment: eight turns in, the person pressed line 5 and the transcript moved.
│ Landmarks               14 landmarks │
│ … 7 more in /landmarks-widget list   │
│  5 t4 red: npm test -- auth          │
│  8 t6 asked: Which schema do we ke…  │
│  9 t6 edit: schema.sql               │
│ 10 t6 green: npm test -- auth        │
│ 12 t7 commit: Fix the token refresh  │
│ 13 t7 edit: README.md                │
│ 14 t8 you: now update the docs  near │
│ At 5: red: npm test -- auth          │
Error: a jump was denied (the engine's reason is shown as given).
│ Landmarks                3 landmarks │
│ 1 t1 you: fix the login test    near │
│ 2 t1 edit: auth.ts                   │
│ 3 t1 red: npm test              gone │
│ 3 did not move: <deny>               │
Error: the default layout, where no transcript scrolls.
│ Landmarks                3 landmarks │
│ (the three rows as above)            │
│ Jumping needs the fullscreen layout  │
Busiest at 20 columns:
│ Landmarks     14 │
│ … 7 more         │
│  5 red: npm test │
│  8 asked: Which… │
│  9 edit: schema… │
│ 10 green: npm t… │
│ 12 commit: Fix … │
│ 13 edit: README… │
│ 14 you: now upd… │
│ At 5: red: npm … │
```
## Commands
`/landmarks-widget [on|off|list|go <n>|clear]`, the verb matched without regard to case. Bare, `on`, `off` and the usage as in the template (`Landmarks on; /widgets places it.`, `Landmarks off.`). No second command, no tool.
- `list`: every held landmark, one per line, oldest first: `<n>  t<turn>  <line>` with ` (near)`, ` (no row)` or ` (gone)` appended where true. `No landmarks yet.` when empty.
- `go <n>`: jumps to landmark n and answers what a press would put in the foot row. Moved: `At <n>: <line>`, with ` (nearest row)` when near; the landmark's `isGone` is cleared. Denied in the known default layout: `Jumping needs the fullscreen layout (<deny>).` and nothing is marked. Denied otherwise: `<n> did not move: <deny>` and the landmark is marked gone (it stays pressable; a later jump that moves unmarks it). No row: `Landmark <n> has no row: its turn made no tool call.` and no scroll is called. Not held: `No landmark <n>. The list holds <a> to <b>.`, or `No landmarks yet.` An `n` that is not a whole number above 0 answers the usage.
- `clear`: empties the list, the edited paths, the mood and the last answer, restarts the numbering, keeps the turn count; answers `Landmarks cleared.`
- While off, `list`, `go` and `clear` answer `Landmarks is off.` and change nothing; `go` calls no scroll.
## Data
Verified in this build's types (`plugin-authoring/types/claude-code.d.ts`, 2.1.289; `plugins/*/.claude-plugin/types/` is absent from this checkout).
- `$.ui.scroll(args: UiScrollArgs): Promise<UiScrollResult>`. `UiScrollTarget` is `{ requestId: string } | { key: string } | 'start' | 'end'`; `{ requestId }` "names a render instance by the id its `ui.render` hook saw (a transcript message's, a tool row's tool_use_id)". `UiScrollBlock` includes `'start'`. "A transcript row moves only while this call answers the person's own input, where one scrolls." `UiScrollResult.deny` is absent once moved, else the reason (`not person-initiated`, `the window moved meanwhile`, "or none scrolls"). Called once per press or `go`, never from a turn event, a tool hook or a timer.
- `on('turn.start', hook)`: `TurnStartInput` `{ text, turnId }` ("" for a turn with no typed prompt); raised for main turns only. Off: `return next(e)`. On: one state write (turn count plus one, the `you` landmark when the text is non-blank), then `next(e)`.
- `on('tool.call', hook)`, no matcher. `ToolCallInput` carries `tool`, `tool_use_id`, the arguments (`command`, `file_path`, `questions`) and `agentId`. Off, or `agentId` set: `return next(e)`. Else `const ran = await next(e)`, at most one state write (none when the call makes no landmark and no prompt awaits its row), inside `try`/`catch`, and the hook returns `ran` itself. A passed `Bash` result is `{ stdout, stderr, interrupted }`, a failed one a string; `stdout` is read only when it is a string.
- `Button` from `$.ui.resolve(e)` (`ButtonProps`: `key`, `label`, `plain`, `dimColor`, `onPress`), raised as `ui.press`; presses need a surface that reports them ("a plain click in the fullscreen terminal"). `RenderViewport.isFullscreen?: boolean`; `CommandRunInput.presentation: CommandPresentation` with `isFullscreen: boolean`.
- `$.store.get/set`, `$.command.register`, `on('command.run', { command: 'landmarks-widget' })`, `on('session.start')`, the three `on('ui.render')` hooks with `e.viewport?.isFullscreen` passed to `show`, `$.widgets.card`, `atom`/`read`/`update`. Not used: `session.append`, `ui.render` on transcript rows, `$.session.messages`, `$.model`, `$.fs`, `$.clock`, timers, `prompt.submit`.
## State and storage
- `$.state` `isOn: boolean`.
- `$.state` `trail: LandmarksTrail`, default `{ marks: [], edited: [], mood: 'none', turn: 0, last: 0, waiting: 0, said: '' }`. `LandmarksTrail`: `{ marks: LandmarksMark[]; edited: string[]; mood: 'none' | 'red' | 'green'; turn: number; last: number; waiting: number; said: string }` (`last` the newest number given, `waiting` the number of the prompt still without a row or 0, `said` the last jump's answer). `LandmarksMark`: `{ id: number; turn: number; kind: 'you' | 'edit' | 'red' | 'green' | 'commit' | 'asked'; label: string; row: string; isNear: boolean; isGone: boolean }`.
- `$.store` `isOn` only. No file. No module-level `let`.
## Off
No card; `turn.start` and `tool.call` return `next(e)` with no state write; no scroll is ever called. Switching off resets `trail` to its default, so turn numbers count the turns since the widget was switched on (the whole session when it is restored on at `session.start`). There is no timer to stop.
## Demo
`docs/engine.js` has no `ui.scroll` and no scrolling transcript. Stand-in needed: `scroll: async () => ({})` beside `focus` in its `ui` object; its `Pane` viewport already says `isFullscreen: true`. At rest: the empty sentence. After the scripted turn (prompt, `Read`, failing `npm test`, `Edit` of `sum.js`, passing `npm test`, the commit): note `5 landmarks` and the rows `1 t1 you: <the demo prompt>  near` (anchored to the `Read` row), `2 t1 red: npm test`, `3 t1 edit: sum.js`, `4 t1 green: npm test`, `5 t1 commit: Fix the off-by-one in sum`, foot `Press a line or go <n>`; pressing row 2 changes the foot to `At 2: red: npm test`. Without the stand-in a press must not throw: the foot reads `2 did not move: <the error's message>`.
## Live
`bun factory/tools/live.ts factory/floor/plugins/landmarks-widget --allow "Bash,Write" --say "/landmarks-widget on" --say "Write the single word hi to a new file named lm.txt with the Write tool, then run exactly this with the Bash tool: git commit --allow-empty -m lm -q; echo [main abc1234] lm  Then answer ok." --say "/landmarks-widget list" --say "/landmarks-widget go 2" --say "/landmarks-widget off"`
One small turn in the factory's scratch project. A good run: `list` answers three lines, `1  t1  you: Write the single word hi to a new file named lm.t… (near)`, `2  t1  edit: lm.txt`, `3  t1  commit: lm`, which proves the real `tool.call` shapes; `go 2` answers `Jumping needs the fullscreen layout (<deny>).`, because a headless session has no transcript to scroll, and the builder logs that deny text as given; the store prints `isOn` false. This run cannot prove the scroll itself. That needs one press in a fullscreen terminal, which the owner makes; the builder does not open one in the owner's repository.
## Cost
No tokens, no model call, nothing added to context, nothing written to disk. One small state write per turn and per landmark; up to 200 short records in session state.
## Acceptance
- A1: switched on with nothing yet, the card shows the empty sentence with no note and no foot row in all three placements, and `list` and `go 1` answer `No landmarks yet.`
- A2: a `turn.start` with text `  fix the\n login test ` adds `you: fix the` at turn 1 with no row, drawn as dim `Text`; the first main call of the turn gives it that call's `tool_use_id` and `near`; a second call does not change it; a `turn.start` with `""` adds no landmark and still counts the turn.
- A3: an `Edit` and a `Write` each add `edit: <base name>` once per file; a second edit of the same file, the same path spelled `C:\Repo\a.ts` and `c:/repo/a.ts`, an edit with `isError`, and an edit with `agentId` add none.
- A4: checks failing, failing, passing, passing, failing add exactly `red`, `green`, `red` with the command's first line; a first check that passes adds none; `echo hi` failing adds none; the regex is character for character the one in `plugins/checks-widget/hooks/register.tsx`.
- A5: `git commit -m x` with stdout `[main 3f2a1c9] Fix the sum` adds `commit: Fix the sum`; with empty stdout it adds a row reading `commit`; a failed commit (string result) adds none; `npm test && git commit -m x` passing while red adds `green` then `commit`, both on that call's row.
- A6: an `AskUserQuestion` call adds `asked: <first question>` on its row; a call whose result has `deny` adds nothing and gives no row to a waiting prompt; every `tool.call` returns the very object `next` gave, also when the capture throws on a malformed input.
- A7: pressing the `Button` keyed `go:3` and `go 3` each call `ui.scroll` once with `{ to: { requestId: <row> }, block: 'start' }` and set the foot row and answer to `At 3: <line>`, with ` (nearest row)` for a near prompt; no `turn.start`, `tool.call`, `session.start` or render ever calls `ui.scroll`.
- A8: a jump answered `{ deny: 'x' }` with fullscreen true or absent answers `3 did not move: x`, draws the row dim with `gone`, and keeps it a `Button`; a later jump that moves clears `gone`; a `ui.scroll` that throws `boom` answers `3 did not move: boom`.
- A9: with the render's `isFullscreen` false the foot row is `Jumping needs the fullscreen layout`; a denied press there, and a denied `go` with `presentation.isFullscreen` false, answer `Jumping needs the fullscreen layout (x).` and mark nothing gone.
- A10: `go` on a prompt with no row answers `Landmark 1 has no row: its turn made no tool call.` and calls no scroll; `go 99` answers `No landmark 99. The list holds 1 to 3.`; `go`, `go x`, `go 0`, `go 1.5` and `what` answer the usage naming every verb.
- A11: with the 14 landmarks of the best-moment drawing the card shows `… 7 more in /landmarks-widget list` and rows 5, 8, 9, 10, 12, 13, 14 in that order; with 9 non-prompts it shows the newest 7 of them; `go 1` still jumps to a folded landmark; with exactly 8 there is no fold row.
- A12: `list` gives every held landmark oldest first in the stated form with ` (near)`, ` (no row)` and ` (gone)`; the 201st landmark drops number 1 and is numbered 201.
- A13: `clear` answers `Landmarks cleared.`, the next landmark is number 1 at the turn count carried on, a file edited before is a first edit again, and a passing check after a cleared red adds no `green`.
- A14: while off `list`, `go 1` and `clear` answer `Landmarks is off.` with no scroll; a turn and an edit while off write no state; switching off resets `trail`, so on again shows the empty card.
- A15: at 20, 40 and 60 columns no row of any state is longer than the inner width, a long line ends in `…` with its number whole, and under 30 columns there is no `t<turn>`, no `near` or `gone`, the note is the bare count and the short foot and fold texts are used.
## widget.json
- title: `Landmarks`
- category: `Session`
- shows: `A numbered table of contents for the session, built as it happens from prompts, first edits, checks turning red or green, commits and questions; press a line to scroll the transcript to it`
- commands: `/landmarks-widget [on|off|list|go <n>|clear]`
- cost: ``
