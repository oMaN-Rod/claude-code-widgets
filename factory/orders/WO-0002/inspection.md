# Inspection: WO-0002 Moon (rebuild)

## Verdict

Pass (fifth inspection, 2026-10-04). The build meets the spec, the standard and the bar. The
live run, the one step missing from the earlier inspections, was made by the director and is
in `live.txt`; it shows what the spec says it should.

## Checker

PASS as written: moon-widget meets the standard (5 standard tests, A1 to A19).

## Frames (terminal, today's real moon)

```
╭──────────────────╮   ╭──────────────────────────────────────╮
│ Moon     36% lit │   │ Moon                         36% lit │
│  ▗▄█▟██▄▖        │   │   ▗▄▟█▟██▙▄▖                         │
│ ▟██▛█████▙       │   │  ▟███▌██████▙                        │
│ ███▌██████       │   │ ▟████████████▙  Waning crescent      │
│ ▜██▙█████▛       │   │ ██████████████  Full in 21d 8h       │
│  ▝▀█▜██▀▘        │   │ ▜████████████▛                       │
│ Waning crescent  │   │  ▜███▌██████▛                        │
│ Full in 21d 8h   │   │   ▝▀▜█▜██▛▀▘                         │
│ Rest. A new      │   │ Rest. A new cycle is near.           │
│ cycle is near.   │   ╰──────────────────────────────────────╯
╰──────────────────╯
```

- Both match the spec's drawings: disc above the text at 20, beside it at 40; no line breaks
  the border; lore wraps to two rows at 20; nothing is cut.
- `--wide 60` draws the 18 x 9 disc beside the text in a clean 60-column card.
- True numbers: the full moon of 2026-10-26 04:12 UTC is 21d 8h away; 36% lit and a waning
  crescent are right for the day after last quarter.
- `south` moves the terminator to the other side at every width. `--turns 1` and `--turns 3`
  change nothing, as the spec says. `off` draws nothing.

## Verbs tried (render.ts)

| Lines | Answers | Effect |
| --- | --- | --- |
| `south`, `off`, `north`, `on` | southern sky / `Moon off.` / `Moon is off; /moon-widget on shows it.` / `Moon on; /widgets places it.` | on, still southern |
| `  North  `, `SOUTH` | drawn for that sky | trimmed, case ignored |
| `on south`, `north north`, `clear`, `sideways` | usage each time | none |
| bare | `Moon off.` | toggles |

## Live run (`live.txt`, made by the director)

`on`, `south`, a one-word prompt, `sideways`, `off`, `north`. All six answers are the spec's
word for word; the model turn ran with the card on and nothing errored; `north` while off was
refused and wrote nothing. Store at the end: `isOn: false`, `isSouth: true`, and no other key.

## Code and tests read

- `show()` returns `beneath` before the tick, the clock or the picture is touched while off.
  `north` and `south` return before any write while off; no verb switches the widget on.
- One timer, started and cancelled only in `sync`, guarded against a second start; the handle
  is the only module-level `let`. Store holds `isOn` and `isSouth` only. No files, no network,
  no hook beyond `session.start`, `command.run` and the three `ui.render`.
- The formulae, the 27 terms and the eight passes match the spec line for line. An angle
  close to 360 names New moon, not an index out of range. The longest name and countdown
  (`Waning crescent`, `Peak 11h 59m ago`) are within 16 characters.
- Tests use published full-moon times and real dates and read the drawn card; A19 counts real
  `tick` writes (60 in an hour, none after `off`).

## Findings

None against the build or the spec. Notes, no change asked:

1. `tests/widget.test.tsx` A17 counts wrapped rows with its own helper, not the drawn card.
   The 20-column frame above agrees with it.
2. For a few hours either side of the 6-degree full window the card reads `100% lit` beside a
   gibbous name. It is rounding, true to the spec's formulae.
3. Tooling (`factory/tools/render.ts`): from Git Bash a `--do "/moon-widget x"` is rewritten
   to a Windows path unless `MSYS_NO_PATHCONV=1` is set, and the 60-column frame needs
   `--wide 60` to be seen. Right: the undo `live.ts` has.
