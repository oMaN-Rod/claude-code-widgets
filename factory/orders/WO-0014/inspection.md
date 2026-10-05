# WO-0014 inspection: aside-widget (second inspection)

Verdict: **pass**. The one fault of the first inspection is fixed, nothing else moved, and the widget meets the spec, the standard and the bar.

## What was run

- `check.ts ... --spec spec.md`: PASS (standard tests and the 15 widget tests, two of them for A13).
- `render.ts` with `ask`, `ask` then `--turns 3` (also `--wide 60`) and `--turns 12`, `--wait 0`, `clear`, `off` then `ask` and `clear`, bare toggle, `ask` with no question, `ASK   Why?  `, `clear now`, `bogus`, and a Japanese-plus-emoji question.
- A probe in the scratchpad that lifts `LETTER`, `UNSEEN` and `WIDE` out of `register.tsx`, repeats `pieces()` and `wrapped()`, and compares every row with `string-width` (the measure Ink truncates by) over 45 samples at inner widths 16, 36 and 56.
- Live: the director's run in `live.txt` (written after this build) was read; no second run made.

## Frames that matter

Answered, three turns later, at 20 and 40 columns, and the widened 60-column card. They match the spec's drawings.

```
╭──────────────────╮   ╭──────────────────────────────────────╮
│ Aside      3 ago │   │ Aside                    3 turns ago │
│ Why did the fir… │   │ Why did the first test fail?         │
│ Only the loop    │   │ Only the loop start in src/sum.js    │
│ start in         │   │ changed: it began at 1 and now       │
│ src/sum.js       │   │ begins at 0.                         │
│ changed: it      │   ╰──────────────────────────────────────╯
│ began at 1 and   │
│ now begins at 0. │
╰──────────────────╯
╭──────────────────────────────────────────────────────────╮
│ Aside                                        3 turns ago │
│ Why did the first test fail?                             │
│ Only the loop start in src/sum.js changed: it began at 1 │
│ and now begins at 0.                                     │
╰──────────────────────────────────────────────────────────╯
```

The idle, working and failed sentences are ASCII and draw exactly as before. A wide-script question still truncates cleanly on its one row (`最初のテストが…`), and `12 ago` leaves the title whole.

## The fix (first inspection, finding 1)

- `cells()` counts terminal cells: wide scripts, full-width forms and emoji two, combining marks, joiners and format characters none. `pieces()` breaks an over-long word on a cell boundary, one grapheme at a time, so no surrogate pair, ZWJ sequence, flag or skin-tone pair is split. `wrapped()` and the eight-row cut both use the same measure.
- Probe result: Japanese, Chinese, Korean, astral ideographs, full-width Latin, half-width kana, Thai, Tamil, Arabic, Hebrew, Vietnamese, ZWJ families, flags, skin tones, keycaps and emoji with a variation selector all measure the same as `string-width`; no wrapped row exceeds the inner width, no text is lost, every row is well formed.
- Cut: a Japanese answer four times the sample length is drawn as exactly eight rows ending in one `…` at 20 and at 40 columns; ASCII cuts are unchanged (127 and `…`, 287 and `…`, 288 whole).
- The new A13 test measures rows with its own `Intl.Segmenter` measure, not the widget's, on Japanese, Korean with a path in it, and an English answer with emoji, a skin tone and `⚠️`. It asserts the joined rows equal the answer, no row is over the inner width, no row ends in `…`, and the eight-row cut. It proves the line.

## Live run (live.txt)

- `on`: `Aside on; /widgets places it.`
- `ask` before any turn: `Nothing to ask about yet. Finish one turn first.`, so the real fork's `nothing-to-fork` arm reaches the widget.
- After the `ok` turn, `ask`: `Answered on the Aside card.` with no assistant message after it; the session has one model turn, as the spec's good run says.
- `off`: `Aside off.` Store: `isOn: false` and no other key. No errors.

## Code and tests

- Unchanged outside the measure: `turn.complete` returns `next(e)` unchanged and checks the switch before any work; no timer, file, toast or tool; the store gets `isOn` only; `ask` and `clear` while off answer `Aside is off.` and never switch on; malformed verbs give the usage line and change nothing.
- The ticket rule still holds for `clear`, `off` then `on`, and a rejected fork.

## Findings

None that block.

## Not faults (recorded for whoever touches this next)

1. Six bare characters that are emoji-capable but drawn narrow by terminals (`©`, `®`, `™`, `❤`, `✔`, `⚠` with no variation selector) are counted one cell by the widget and two by `string-width` 7.2. A row packed to its last cell with one of them can lose its final character to `…`. The widget's count is the one a terminal agrees with, the characters are rare in a plain-text answer, and the first build had the same behaviour; not worth a third build.
2. `tidy()` cuts at 300 and 600 code units, so a cut landing inside an astral character leaves a lone surrogate. It can only be seen on a card widened past 79 columns with a 600-unit answer whose 600th unit is half an emoji.
3. An answer of spaced words cut at eight rows' worth of cells can still wrap to nine or ten rows; spec note 1 allows it.
4. The 60-column frame is the 40-column card until `/widgets width aside-widget <columns>` is used, as the standard says.
