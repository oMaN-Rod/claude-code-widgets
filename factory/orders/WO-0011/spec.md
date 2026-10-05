# Trial (`trial-widget`)
## Purpose
For anyone who wonders whether a widget that speaks to Claude (lessons, done, stakes) earns its place. Name it once; from then on each session that has Trial switched on runs with that widget on or off, in turn, and Trial counts how many turns end clean in each arm. When both arms hold enough turns the card says whether the difference is more than chance.
## What is dropped from the earlier version
The second command `/trial` (one command, verbs `test` and `clear`); `stop` (`clear` ends and wipes); counting while the card is off; marking a turn unclean when the next prompt looks like a correction (an English word list, not a measure); the silent catch around the switch of the subject (a failed switch is now a state of the card); the `z = 2.3` figure.
## Terms
- Subject: the widget on trial, held as its full command name (`moon-widget`). Arm: `with` or `without`. Run: one session's count, `{ isWith, turns, clean }`.
- The trial file: `${$.plugin.root}/trial.json`, the JSON text of `{ subject, runs }`, shared live by every open session. Reading it: `$.fs.read` then `JSON.parse`; a missing file, text that does not parse, a value of another shape, or a `subject` of `''` all mean no trial. There is no `$.fs` call that removes a file, so ending a trial writes the blank value `{ subject: '', runs: {} }`.
- Counted turn: a `prompt.submit` whose `e.origin.kind` is `composer`, `bridge` or `sdk` opens one; the next `turn.complete` with `e.agentId === undefined` closes it. Closed only while the session is joined.
- Clean: `!e.isAborted && e.reason === 'answer'` and the last check command of the turn did not fail. A check command is a `tool.call` with `e.tool === 'Bash'`, `e.agentId === undefined`, no `deny` in the result, whose command, read as the first line of `String((e as { command?: unknown }).command ?? '')`, matches `/\b(test|tests|pytest|jest|vitest|tsc|lint|eslint|build|check|clippy)\b/`; it failed when the result's `isError === true`. Each `prompt.submit` forgets the last check.
- Join: what a session does 50 ms after each `sync` that finds the widget on, a trial in the state and the phase `idle` (so once after `session.start` or `test`, and once more after off then on). It reads `$.session.id()` and the trial file; takes the arm of its own run in the file if there is one, else `with` when the runs with `turns > 0` number no more `with` than `without`, else `without`; then, if `$.command.list()` (each name with a leading `/` stripped) names the subject, `await $.command.run({ command: subject, args: isWith ? 'on' : 'off' })`. Subject not listed, or the call throws: the session is `stalled` and counts nothing. Two sessions that join before either has a counted turn both take `with`; that is accepted, and the sessions after them take `without` until the runs are level.
- Verdict, from the summed turns `n` and clean `c` of each arm over all runs, this session's included: `need = max(0, 30 - n_with) + max(0, 30 - n_without)`; `need > 0` is too early. Else `p = (c_with + c_without) / (n_with + n_without)`, `s = sqrt(p * (1 - p) * (1 / n_with + 1 / n_without))`, `z = s === 0 ? 0 : (c_with / n_with - c_without / n_without) / s`; `|z| < 1.96` is no difference, else the arm with the higher rate is ahead.
## Card
Inner width is the card width less 4. Long wording at an inner width of 36 or more, short below; no long line passes 36 characters and no short line 16, except the subject row, which truncates (`wrap="truncate-end"`). The empty sentence wraps. Title `Trial`. An arm row is its label and `round(100 * c / n)`%; in the long wording the turns sit dim at the right (`plural()`).
```
Empty: no trial. No note.
│ Trial                                │
│ No trial yet.                        │
│ /trial-widget test <widget> runs it  │
│ on one session and off the next.     │
Working: a trial, too early. Note is this session's arm (`with` | `without`; none until joined).
│ Trial                           with │
│ moon-widget                          │
│ with     93% clean          29 turns │
│ without  67% clean          30 turns │
│ Too early: 1 more turn               │
Best moment: a verdict.
│ Trial                           with │
│ moon-widget                          │
│ with     93% clean          30 turns │
│ without  67% clean          30 turns │
│ With it is ahead, beyond chance.     │
Error: the subject could not be switched. Note `stalled`. No arm rows.
│ Trial                        stalled │
│ moon-widget                          │
│ Could not switch it here.            │
│ This session is not counted.         │
Busiest at 20 columns: the best moment.
│ Trial       with │
│ moon-widget      │
│ on  93% of 30    │
│ off 67% of 30    │
│ with is ahead    │
```
Long and short wording (`long` | `short`):
- Arm rows: `with     93% clean` + `30 turns` | `on  93% of 30`; `without  67% clean` + `30 turns` | `off 67% of 30`. An arm with no turns: `with     no turns yet` | `on  none`. In the short wording a count of 1,000 or more is compacted to one decimal (`on  100% of 1.2k`), so the row stays within 16.
- `Too early: 12 more turns` (`plural()`) | `12 more turns`; `No difference beyond chance.` | `no difference`.
- `With it is ahead, beyond chance.` | `with is ahead`; `Without it is ahead, beyond chance.` | `without is ahead`.
- `Could not switch it here.` | `switch failed`; `This session is not counted.` | `not counted`.
## Commands
- `/trial-widget`, `on`, `off`: the switch, with the template's answers. Unknown, and `test` with no name or a name that fails `/^[a-z0-9][a-z0-9-]*$/`: `Usage: /trial-widget [on|off|test <widget>|clear]`, nothing changed. `argumentHint` `[on|off|test <widget>|clear]`.
- `test <widget>`: `moon` and `moon-widget` both mean `moon-widget`. Reads the trial file first. A trial there: `A trial of moon-widget is running; /trial-widget clear ends it.` The name is `trial-widget` or not in `$.command.list()`: `No widget called tide-widget.` Otherwise writes the trial file as `{ subject, runs: {} }`, puts the same in the state, calls `sync`, and answers `Trial of moon-widget started. This session runs with it, the next without, and so on. Leave its switch alone meanwhile.` Off: `Trial is off.`
- `clear`: reads the trial file. No trial there: `No trial is running.` Otherwise writes the blank value to the trial file, empties the state and answers `Trial of moon-widget ended: with 93% of 30 turns, without 67% of 30 turns. With it is ahead, beyond chance. moon-widget is left on.` The figures are the file's runs with this session's run put in. The middle sentence is the long verdict wording, and the too-early one gains its full stop (`Too early: 12 more turns.`); an arm with no turns reads `with no turns`; the last sentence says `on` or `off` by this session's arm and is absent when the session never joined or stalled. `clear` does not touch the subject's switch. Off: `Trial is off.`
- No second command and no tool.
## Data
- `on('session.start')`: the template's work; then, only when on, one read of the trial file into the state, and `sync`.
- `on('prompt.submit')`: reads `e.origin.kind`; returns `next(e)` unchanged. Once per prompt.
- `on('tool.call')`: awaits `next(e)`, returns it unchanged; reads `e.tool`, `e.agentId`, `e.command`, and the result's `deny` and `isError`. Once per tool call.
- `on('turn.complete')`: awaits `next(e)`, returns it unchanged; reads `e.agentId`, `e.isAborted`, `e.reason`. Once per turn.
- `$.command.list()`: at `test` and at each join. `$.command.run({ command, args })`: once per join, on the subject only, with `on` or `off`. `$.session.id()`: once per join.
- `$.fs.read` of the trial file: at `session.start` when on, at switching on, at each join, after each counted turn, at `test` and at `clear`. `$.fs.write` of the trial file: at `test` (the new trial), after each counted turn (this session's run), at `clear` (the blank value). A read that throws is no trial; a write that throws is caught and the next counted turn writes again.
- `$.clock.after(50, join)`: the one timer, started and cancelled in `sync`. `$.store.get` and `$.store.set` for `isOn` only. No `$.process`, no model call.
- `on('command.run', { command: 'trial-widget' })`, the three `on('ui.render')` hooks, `$.command.register`, `$.widgets.card`: from the template.
- Not verified against the types file: `plugins/*/.claude-plugin/types/claude-code/index.d.ts` is absent from this checkout. Every name above is taken from a shipped widget (`done-widget`, `sieve-widget`, `collision-widget`, and `sessions-widget` for `$.fs.read`, `$.fs.write` and `$.plugin.root`), the kit, or the earlier version; the builder checks each against the types before using it, `$.command.run`'s argument first.
## State and storage
- `$.state` `isOn: boolean`.
- `$.state` `trial: { subject: string; runs: Record<string, { isWith: boolean; turns: number; clean: number }> }`. Blank: `subject` `''`, no runs. Keyed by session id; the runs as last read from the trial file, with this session's run from the join on.
- `$.state` `now: { id: string; phase: 'idle' | 'joined' | 'stalled'; isOpen: boolean; isFailing: boolean }`. Blank: `id` `''`, `idle`, both false.
- `$.store` `isOn`, and nothing else.
- File `${$.plugin.root}/trial.json`: the trial, in the shape of the state's `trial`, one line of JSON. The only place the subject and the runs are kept across and between sessions.
- Writing a run, after each counted turn: read the trial file. No trial there, or its `subject` is not this session's: another session ended the trial, so the state goes blank and nothing is written. Otherwise write the file with this session's run, taken from the state, put into the runs just read, and keep those runs in the state. The read and the write follow one another with nothing awaited between them but those two calls. A run with no turns is never written.
- One module-level `let`: the handle of the join timer.
## Off
`session.start` reads only `isOn` and never the trial file. No join, so the subject's switch is never touched; no timer; `prompt.submit`, `tool.call` and `turn.complete` return `next(e)` at once; no card; `test` and `clear` answer `Trial is off.` and neither read nor write the file. Switching off cancels a pending join and sets `trial` and `now` blank in the state; the trial file and the subject's switch stay as they are. Switching on reads the trial file and calls `sync`, so a session rejoins its own run in the file.
## Demo
The engine gives each widget its own engine: `command.list` names only `trial-widget`, and no file exists under the plugin's root. Stand-ins needed: `command.list` also names `moon-widget` (the bottom of `command.run` already answers it); the engine's files start with `/demo/plugins/trial-widget/trial.json` holding `{ subject: 'moon-widget', runs: { a: with 10/9, b: with 10/9, c: with 9/9, d: without 10/7, e: without 10/6, f: without 10/7 } }` (turns/clean). At rest: the working card, note `with`, `93% clean` of `29 turns`, `67% clean` of `30 turns`, `Too early: 1 more turn`. After the scripted turn (its last `npm test` passes, so it is clean): the best moment, `30 turns` and `With it is ahead, beyond chance.`
## Live
`bun factory/tools/live.ts factory/floor/plugins/trial-widget --say "/trial-widget on" --say "/trial-widget test moon" --say "Reply with the single word one." --say "/trial-widget clear"`
The live tool loads only the layout and this widget, so no subject exists there. A good run answers `No widget called moon-widget.` (the real `$.command.list` was read), then `one` from an ordinary turn the hooks let through untouched, then `No trial is running.` (the real `$.fs.read` of a missing trial file was survived); the store prints `isOn` true and nothing else. No trial is started, so the trial file is never written; the file write and the switch of a real subject by `$.command.run` are not proven by this run, and need a session with a second widget loaded.
## Cost
None: no model call, nothing added to a prompt. One read and one write of a small file per counted turn while a trial runs.
## Acceptance
How the tests prove these: a stand-in plugin registers `moon-widget` and records the args of each run of it; the kit's `session.id` answer names the session; runs are proven through the card and the trial file (the kit's `files`, seeded with `given.files`); "another session" is the test rewriting that file between turns.
- A1: on with no trial, the card says `No trial yet.` and what starts one, with no note; a restored switch at `session.start` with no trial file, with one that does not parse or has the wrong shape, or with the blank value, gives the same card and runs no command.
- A2: `test moon` answers the started sentence, writes the trial file as `{ subject: 'moon-widget', runs: {} }`, stores nothing but `isOn`, and 50 ms later runs `moon-widget` once with `on`; the card then has the note `with`, the row `moon-widget`, both arms `no turns yet` and `Too early: 60 more turns`. `test moon-widget` does the same, and so does a `command.list` that names the subject `/moon-widget`.
- A3: `test tide` answers `No widget called tide-widget.`, `test trial` answers `No widget called trial-widget.`, and `test moon` during a trial, or with a trial of another session in the file, answers `A trial of moon-widget is running; /trial-widget clear ends it.`; each leaves the trial file and the card as they were and runs no command.
- A4: in a joined session a turn ending `reason: 'answer'`, not aborted, with no check command counts as 1 turn, 1 clean; an aborted turn, a turn with another `reason`, and a turn whose last check command had `isError: true` each count as 1 turn, 0 clean; a failed `npm test` followed by a passing one in the same turn is clean, and a failure in one turn does not mark the next.
- A5: a `turn.complete` with an `agentId`, one with no opening prompt, and a turn opened by a prompt of kind `task-notification` or `plugin` are not counted; a failed check from a tool call with an `agentId`, a denied one, a failed Bash call with no `command`, and a failed Bash command that names no check (`cat .env`) leave the turn clean; all three hooks return exactly what `next(e)` returned.
- A6: at `session.start` with runs in the trial file, the session joins `with` when the counted `with` runs are no more than the `without` ones and runs `moon-widget on`, else joins `without` and runs `moon-widget off`; a run with 0 turns is not counted in that choice; a session whose own id has a run in the file takes that run's arm and adds to its counts.
- A7: after each counted turn the trial file's `runs[<session id>]` holds this session's arm, turns and clean; a run another session wrote to the file after this one joined is still in the file after this session's next write, and shows in the card's totals; when the file then holds the blank value, is gone, or names another subject, the next counted turn writes nothing and the card returns to empty.
- A8: with arms of 29 and 30 turns the card says `Too early: 1 more turn`; 30 turns with 28 clean against 30 with 20 clean says `With it is ahead, beyond chance.`; the mirror says `Without it is ahead, beyond chance.`; 30 with 24 against 30 with 22, and two arms that are all clean, say `No difference beyond chance.`; the percentages are `round(100 * clean / turns)`.
- A9: when `$.command.run` throws for the subject, and when the file's subject is not in `$.command.list()`, the card shows the note `stalled`, the subject, `Could not switch it here.` and `This session is not counted.` with no arm rows; turns in that session change no count and write nothing.
- A10: `clear` in a joined `without` session answers the ended sentence with both arms' figures (a run another session wrote since the join included), the verdict and `moon-widget is left off.`, writes the blank value to the trial file, runs no command, and the card returns to empty; a too-early verdict there reads `Too early: 12 more turns.`; in a stalled session the last sentence is absent; an arm with no turns reads `with no turns`; with no trial in the file it answers `No trial is running.` and writes nothing.
- A11: off with a trial in the file, `session.start` runs no command, starts no timer and does not read the file; three clean turns with a failed check write no file and no store key; `test moon` and `clear` answer `Trial is off.` and write nothing; switching off within 50 ms of `test moon` means `moon-widget` is never run; switching off in a joined session stops the counting without changing the trial file, and switching on again runs the subject's command once more, rejoins the same arm and carries on from the file's counts.
- A12: `test`, `test Moon!`, `stop` and `start moon` each answer `Usage: /trial-widget [on|off|test <widget>|clear]` and change neither the switch, the store, the trial file nor the card; `session.start` registers one command, `trial-widget`, and none named `trial`; the store never holds a key other than `isOn`.
- A13: with a subject of 40 characters and arms of 1,234 turns, one of them all clean, every state (empty, working, best moment, stalled) at 20 and at 39 columns uses the short wording (`on  100% of 1.2k`) with no line but the subject row over 16 characters, and at 40 and 60 columns the long wording (`1,234 turns`) with no such line over 36; the subject row is one truncated line; one turn reads `1 turn`.
- A14: the card is the same in the `side`, `above` and `below` placements during a trial, and is absent from the two placements the layout's `site` does not name.
## widget.json
- title: `Trial`
- category: `Session`
- shows: `A fair test of another widget: sessions alternate with it on and off, and the card compares how many turns end clean`
- commands: `/trial-widget [on|off|test <widget>|clear]`
- cost: empty
