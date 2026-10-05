# WO-0020 Loupe: inspection (second)

Verdict: **pass**. The two faults of the first inspection are fixed, the minor one is closed for every case that matters, and nothing else changed for the worse.

## What was run

- `check.ts ... --spec`: PASS.
- `render.ts` at rest, `--turns 1`, `--turns 3`, and with `look fit`, `look 4138f10`, `look #FF8800`, `look scratchzz`, `look 1759612800000`, bare `LOOK`, `copy`, `Copy`, `copy x`, `off`; then odd inputs: `//host/share/x`, `"//host/x",`, `/\host/x:12`, `\?\C:\Windows`, `C:\Windows\System32`, `../../..`, `-rf`, `--output=x/y`, `README.md:3:1`, `hooks/`, `constructor`.
- Live: the director's `live.txt` (written after the rebuild) was read; no second run was made.

## Frames that matter

A name without a definition now carries its button, 40 and 20 columns:
```
│ Loupe                         symbol │      │ Loupe     symbol │
│ fit                                  │      │ fit              │
│ no definition found                  │      │ no definition    │
│ 2 mentions in 2 files                │      │ 2× in 2 files    │
│ copy fit                             │      │ copy             │
```
A network path, no lookup made:
```
│ Loupe                           path │
│ //host/x                             │
│ missing                              │
```
Rest, colour, time, text and the long head cut in the middle (`The loop in src/su…m was never added`) all fit at 20, 40 and 60; no line wraps or breaks the border. Off draws nothing. `copy x` answers the usage, `Copy` is the verb, `-rf` is text, `--output=x/y` is a missing path and reaches no git call.

## Live run (director's, after the rebuild)

Every line matches the spec's good run: `README.md: path · file · 53 B · changed 3h 53m ago`; `#FF8800: colour · rgb(255, 136, 0)`; `1759612800: time · 2025-10-04 21:20:00 UTC · 365d 9h ago`; `scratch: symbol · not a git repository`; the outside-fullscreen sentence; `Could not copy: no-surface` (the copy value now exists; a headless session has no surface, which the spec names as a pass); `Loupe off.` The store holds `isOn: false` and no other key. No error. The mouse path is still unproven outside the tests, as the spec says it must be without the owner.

## The earlier findings

1. **Network paths: fixed.** `register.tsx` line 166: a path part that begins with two slashes of either kind returns `missing` before `$.session.cwd()` or any fs call. Test A5 (lines 428 to 432) selects `\\build-01\drop\out.log`, `//build-01/drop/out.log` and `\\?\UNC\build-01\drop\out.log:12` and proves the fs and process tallies do not move. Ordinary absolute paths are still looked up and A5 says so with `/etc/hosts`.
2. **Copy value of a name: fixed.** Lines 192, 195 and 209 all carry `copy: name`. A6 expects `copy fit` on exit 1, A14 expects `copy a3f9c1e` and `copy fit` with no repository, A13 expects the three card lines for `scratch`. `isLocated` (line 390) keeps the middle cut for `path:line` rows only.
3. **Ticket across off and on: fixed where it matters.** Off keeps `ticket` (line 467) and `examine` drops its answer while off (line 263). A11 opens with a lookup left running across off, on and a new `look`, and the late answer does not reach the card.

## Findings (none blocks)

1. Minor, `register.tsx` lines 263 and 467. A lookup still running across off then on, with no newer examine in between, holds the current ticket and writes its finding onto the fresh card. The next poll (300 ms) drops it if nothing is selected, or re-examines the same selection, so the card is never wrong for longer than one tick. Right, if the file is touched again: raise `ticket` by one on off.
2. For the director, as before: `render.ts` drops the head row for `constructor`, `valueOf` and the like, and its backslash handling halves `\\`; both are in the tool, not the widget.
3. Carried from the first inspection: a path found under the cwd with a linked root costs four fs calls. Acceptable; `widget.json` names no number.

## Against the bar

Functional: every kind answers in the live run and the frames. Original: no shipped widget reads the selection or answers a question the person asked by pointing. Enjoyable: it costs no tokens, needs no command in its main use, says nothing when it does not know (`text`, never a guess), and the copy button gives back the useful form (full hash, `path:line`, ISO time) rather than what was dragged.

Still good: every hook returns early while off; verbs never switch the widget on; one timer, in `sync`; the selection reaches git only as one argv element after `--` or `-e`; an absent `realPath` is outside; a rejecting `ui.selection` is silent; nothing but `isOn` is stored.
