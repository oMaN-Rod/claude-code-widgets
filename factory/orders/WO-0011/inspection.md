# WO-0011 Trial: inspection

Verdict: **pass**, with five findings for the record and three things no factory run has proven.

## Checker

`bun factory/tools/check.ts factory/floor/plugins/trial-widget --spec factory/floor/orders/WO-0011/spec.md` printed PASS in 9 runs of 10. The first run of the ten failed once: `A1` timed out at 5353 ms. It did not repeat (whole runs took 15 to 39 s, so the machine was loaded). See finding 1. The "hooks modules are turned off" stop the machinist logged is gone.

## Frames

`render.ts` as it stands can show only the empty card, because `docs/engine.js` seeds no file and no second command (machinist's note 10). At rest, `--turns 1`, `--turns 3`, `test moon`, `clear`, `test`, `off`: the empty card at 20, 40 and 60 columns, answers `No widget called moon-widget.`, `No trial is running.`, the usage line, `Trial off.` and no card. All as the spec says.

The other states I drew from a scratch copy of the render tool and the demo engine (in my scratchpad, nothing in the repository touched) with the spec's stand-ins added: `moon-widget` in `command.list` and a seeded `trial.json`. They match the spec's drawings line for line:

```
│ Trial       with │   │ Trial                           with │
│ moon-widget      │   │ moon-widget                          │
│ on  93% of 30    │   │ with     93% clean          30 turns │
│ off 67% of 30    │   │ without  67% clean          30 turns │
│ with is ahead    │   │ With it is ahead, beyond chance.     │

│ Trial    stalled │   │ Trial                        stalled │
│ moon-widget      │   │ moon-widget                          │
│ switch failed    │   │ Could not switch it here.            │
│ not counted      │   │ This session is not counted.         │
```

Seeded with 29 and 30 turns the card reads `Too early: 1 more turn` (`1 more turn` at 20); one scripted turn after the join moves it to the verdict above. A 40-character subject is one truncated row at 20, 39 and 40 columns and whole at 60. `clear` answered `Trial of moon-widget ended: with 100% of 1 turn, without no turns. Too early: 59 more turns. moon-widget is left on.`, and in a stalled session the last sentence is absent. Plurals are right (`1 turn`, `1 more turn`).

## Live run (director's, `live.txt`)

Exactly the spec's good run: `Trial on; /widgets places it.`, `No widget called moon-widget.` (the real `$.command.list` answered), `one` from an ordinary turn the three hooks let through, `No trial is running.` (a real `$.fs.read` of a missing file was survived). The store holds `isOn: true` and nothing else. No errors, and no `trial.json` was left in the widget's folder.

## Code and tests

- `prompt.submit`, `tool.call` and `turn.complete` read the switch first and return `next(e)` at once while off; `session.start` reads only `isOn` while off; `test` and `clear` answer `Trial is off.` without reading the file and never switch on.
- One module-level `let` (the join timer), started and cancelled only in `sync`; switching off cancels it and blanks `trial` and `now`. A join already in flight when the widget goes off or the trial is cleared changes nothing in the state.
- The run is written whole from the state after a fresh read, so another session's run survives and a lost write heals (spec notes 3, 7, 12 hold). The store is written only as `isOn`.
- The 14 tests are real: a stand-in `moon-widget` records each switch, another session is the test rewriting the file between turns, a full disk and a broken command list are covered, and the card is compared line by line at 20, 39, 40 and 60. Spec notes 5, 6 and 8 are on record in A4, A5 and A13.

## Not proven by any run

The live tool loads only the layout and this widget, so no subject can exist there. The spec says so, and the run matches it. These stay unproven until a session with a second widget is tried by hand:

- A. `$.command.run` on a real subject from a timer, and the write of `trial.json` under a real plugin root.
- B. Whether every plugin has registered its command within 50 ms of `session.start`. If the subject registers later, the session shows `stalled` and is not counted; off then on joins again, so the failure is visible and recoverable, not silent.
- C. Whether a slash command (`/widgets side`, `/trial-widget on`) raises `prompt.submit` with kind `composer` and a `turn.complete` with reason `answer` in the real engine. If it does, each command typed during a trial counts as a clean turn in that session's arm. The test engine does not say.

## Findings (none blocks the pass)

1. `tests/widget.test.tsx`, A1: 14 session restarts, each with an hour of clock advanced, in the first test of the file. It timed out once at 5.35 s under load. Right: drop the `advance(HOUR)` inside the loop over broken files (one after the loop proves no command runs) so the test sits well under the limit. Clerk: if the shipping check trips on A1, run it again.
2. `hooks/register.tsx` `isRun` (line 44): any numbers pass. A hand-edited file with `turns: -5` or `clean` above `turns` draws `on  -180% of -5`, `1000% clean` and `Too early: 62 more turns`. Right: a run is valid only with whole numbers, `turns >= 0` and `0 <= clean <= turns`; anything else is no trial, as the spec's "a value of another shape" intends. The widget itself never writes such a file.
3. `compact` (line 67): from 10,000 turns in an arm the short row passes 16 characters and is cut mid-number (`on  100% of 12.…`, `off 73% of 1234…`). Right: no decimal from 10k (`12k`) and `1.2M` above. It takes months of use to reach, and the spec's own rule ("one decimal") is what breaks.
4. `begin` (line 238): if the write of the new trial fails, the answer still says `Trial of moon-widget started.` and the card falls back to empty 50 ms later. Right: answer that the trial could not be saved. The spec only says a failed write is caught.
5. Demo: the page will show only the empty card and `No widget called moon-widget.` until `docs/engine.js` gets the spec's two stand-ins and a settle of more than 50 ms before the scripted turn (with less, the turn lands before the join and is not counted). This is the clerk's work at shipping; with the stand-ins in place the frames are the ones above.
