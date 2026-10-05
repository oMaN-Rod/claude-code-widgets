# Inspection: WO-0016 Margin (`margin-widget`)

Verdict: **pass** (second inspection). Both faults of the first inspection are fixed, the code is
unchanged and to spec, and the live run is the one the spec names. What no tool on this floor can
show, the mouse path in a fullscreen terminal, is still unobserved; see finding 1.

## Checker

`bun factory/tools/check.ts factory/floor/plugins/margin-widget --spec factory/floor/orders/WO-0016/spec.md`
run five times: PASS five times. Timings from one run of the test runner: A5 3.51 s (was 4.97 to
5.14 s), A7 2.25 s (was 4.26 s); slowest are A11 3.74 s and A14 3.72 s, level with the stamped
standard tests (3.86 s), all against a 5 s limit. A5 is still one test and still holds every clause:
six refusals from the verb and from a press, no mark changed, the row gone after the next mark that
works, no row from a verb.

## Frames

`render.ts` gives the drawing no fullscreen viewport, so at rest, with `--turns 1`, `--turns 3` and
after every `--do`, the one card it can draw is the not-fullscreen card. It is right at all widths:

```
╭──────────────────╮      ╭──────────────────────────────────────╮
│ Margin           │      │ Margin                               │
│ Margin needs     │      │ Margin needs fullscreen: /tui        │
│ fullscreen: /tui │      │ fullscreen                           │
│ fullscreen       │      ╰──────────────────────────────────────╯
╰──────────────────╯      (60 columns: the same 40-column card)
```

After `off` nothing is drawn. The other cards were judged from `register.tsx` and the structure the
tests read (A1, A2, A7, A11, A14), not from a drawn frame; row order in the code matches the drawings.

`--do` lines tried: `mark why here` and `mark` -> `Nothing selected.` (the tool's command is
fullscreen, with no selection); `send`, `send  ` -> `No marks to send.`; `drop 1`, `DROP  1` ->
`No mark 1.`; `clear` -> `Margin cleared.`; `on on`, `clear\t` -> usage; `Mark    ` read as `mark`;
`drop 99999999999999999999` (finding 3). Nothing broke, and no verb switched the widget on.

## Live run (director's, `live.txt`, made after the rebuild)

Every answer is the one the spec's Live section names, in order: `Margin on; /widgets places it.`,
`Margin needs fullscreen: /tui fullscreen`, `No marks to send.`, `No mark 1.`, `Margin cleared.`,
`Margin off.`. No error. The store holds `{ "isOn": false }` and no other key. As the spec says, a
headless run cannot make a mark, so it proves the commands, the switch and the store only.

## Code read (`hooks/register.tsx`, unchanged since the first inspection)

`prompt.submit` returns `next(e)` unchanged and wipes only when on, sent and the origin is composer,
bridge or sdk. Verbs answer `Margin is off.` before any engine call and never switch on. No timer,
no file, no module-level `let`; the store is written with `isOn` only; switching off wipes the marks.
Every engine call is caught. The `ui.focus` call (Pane and AbovePrompt only) and the dialog sentence
are both still there (spec note 12). Cuts go by code point and count wide characters as two cells.
Tests: one per acceptance line, fed reply-shaped text, with stand-ins that record their calls and
both the button and the verb path. One mounted card per test lost no assertion.

## First inspection's findings

1. A5 timing out: **fixed** (above).
2. No build notes: **answered** in the build stamp; notes 2, 5 and 14 are each stated as not observed.

## Findings (none blocks; 1 and 2 are for the director)

1. **The mouse path has never been run.** Select, Mark, type, Enter, Send is proven only through the
   test engine's `ui.press` and `ui.input`. Still owed, in one fullscreen terminal session: that the
   selection survives the click on Mark (if the click clears it, the button always says
   `Nothing selected.` and only the verb works); that the field takes the keys after Mark in `side`
   and `above`; that `mark` typed as a command still sees the selection; that Send under an open
   dialog shows the dialog sentence. This widget's worth rests on the first of these. I pass it
   because the spec, the standard and every step this station can carry out are met, not because the
   path was seen to work.
2. **Two open questions the hand check should close.** (a) In `below` the `remark` field may never
   take keys (`PromptHint` keeps no focus ring); if so the card shows a dead field there and the spec
   should draw a bare quote in that placement instead. (b) If a typed slash command reaches
   `prompt.submit` as `composer`, then `/margin-widget drop 1` after a send wipes all marks before
   the verb runs; the hook would need a guard. No shipped widget guards for this, which suggests
   commands do not arrive there, but it was not observed.
3. **`drop` past 2^53** (`register.tsx`, line 293): `drop 99999999999999999999` answers `No mark
   100000000000000000000.` Right: echo the digits typed, leading zeros removed. Cosmetic.
4. **`render.ts` cannot draw this card** past the not-fullscreen sentence; the demo page needs the
   stand-ins of the spec's Demo section before the catalog can show it.
5. **Send twice appends the quotes twice.** Allowed by the spec; a later spec could refuse it.
