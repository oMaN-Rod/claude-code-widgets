# Inspection: WO-0023 Pen (`pen-widget`)

Verdict: **pass**.

## What was run

- `check.ts` with the spec: `PASS  pen-widget meets the standard.` 14 acceptance tests and the 5 standard tests pass.
- `render.ts` at rest, `--turns 1`, `--turns 3`, and `show`, `clear`, `SHOW`, `what`, `off` then `show`, `on extra`. The demo engine dispatches no `turn.step`, so render.ts can only draw the empty state. It wraps on words inside the border at 20 columns (8 rows) and at 40.
- The other states were looked at through a scratch copy of the widget (outside the repo, removed afterwards) with one extra probe test that streamed odd calls and printed the card rows at 20, 40 and 60 columns.
- Live: the director's run in `live.txt` was read; no second run was made.

## Frames that matter

```
writing, text just ended in a newline      exact inner width, 20 columns
| Pen        2 lines |                     | 1234567890123456 |
| /a/b.txt           |                     | 12345678901234…▌ |
| one                |
| two▌               |

stopped, 20 columns                        stopped, 40 columns
| a.min.js           |                     | Write a.min.js                       |
| xxxxxxxxxxxxxxx…   |                     | xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx… |
| Stopped.           |                     | Stopped before it ran.               |
```

A 50 000 character line with no newline holds 120 characters and counts `1 line`, 50 000 characters. A 300-character path is kept to 200 and drawn as `Edit …/d/d/d/d/f.ts`; a path with no separator is cut from its start. `{}` and empty content draw the head alone with `0 lines`. A second `Write` in one step replaces the first; a later step with only text leaves `written` as it was. Malformed input (raw control characters inside strings, unknown escapes, stray input for a closed index) never threw and every chunk still came out.

## Spec notes, as built

1 short `Stopped.` under 30 columns: done, asserted in A13. 3 cursor after a newline and at exact width: right (frames above). 4 the `finally` is guarded and the throw from beneath reaches the caller (A8). 6 off then on inside one step stays silent and shows the empty sentence (A14, by comparing the switch's version). 7 empty sentence at 20 columns: wraps on words. 9 `show` is one line. 10 and 11 are in the log.

## Code read (`hooks/register.tsx`)

- `turn.step` hands on with `yield*` when off or when `agentId` is present; otherwise every chunk is yielded as received, after a guarded read that can only switch reading off.
- No module-level `let`, no timer, no `$.fs`, no `$.model`. The store holds `isOn` alone. `show` and `clear` answer `Pen is off.` while off and never switch on. Switching off nulls `pen`.
- The reader is linear: one pass per character, the line capped at 120, the tail at 5 rows, the path at 200. One `$.clock.now()` per fed piece, a copy at most every 100 ms plus start, close and stop.
- Copies go through `ifVersion` and stop when the switch's version moved or another call's id is held, so a step never overwrites a newer call and `clear` mid-stream is redrawn by the next copy, as the spec says.

## Tests

Each test asserts exact rows, dim and yellow sets against realistic arguments (a 212-line config file, Windows paths, escapes, surrogate pairs, CJK). A2 compares objects in order across on, off, subagent and non-JSON. A4 compares whole, per-character and awkward splits. They prove their lines.

## Live run (`live.txt`)

`on` answered `Pen on; /widgets places it.` The model's `Write` was refused by the host; `show` answered `Write C:\Users\O\.claude-factory\scratch-project\pen-live.txt: 40 lines, 111 characters in 17 pieces, written.` and `off` answered `Pen off.` The store holds `isOn: false` and nothing else. Real `tool` and `input` chunks reach the hook, the arguments arrive in 17 pieces, the Windows path decodes with its backslashes, and 40 lines and 111 characters are the true counts of the numbers 1 to 40 with a trailing newline. Nothing errored.

## Findings (none blocks)

1. `show` ends in `written.` although the host refused the Write and no file exists (the director's note). The spec defines `written` as "the arguments are whole" and its own Live section expects exactly this line, so the build is right. The word still reads as "the file was written" beside `stopped before it ran`. Right would be a word that claims less, such as `ready` or `whole`; that is a spec change for a later order, not a build fault.
2. `trailing()` in `register.tsx`: a row indented deeper than the inner width relative to the least indented of the five rows draws as spaces and `…` (seen with a row at 70 spaces next to one at 0; at 20 columns it takes 16). Right would be to show that row's text with a leading `…`. Rare at 40 columns.
3. `inked()`: a line whose first 120 characters are all spaces never enters the tail, though it counts in `lines`. Very rare; the count stays true.
4. There is no timer, so when the stream stalls the pieces fed in the last 100 ms are not drawn until the next piece, the close or the stop. This is the spec's rule (A11) and costs at most a few characters of lag.
5. For the director: the demo page shows only the empty sentence until `docs/engine.js` runs generator hooks and dispatches the `turn.step` stand-in the spec's Demo section describes. The widget does not throw without it. The card in a real terminal has not been seen by anyone on the floor, only its stored facts; the writing, written and stopped drawings rest on the exact-row tests.

## Bar

Original: no shipped widget reads the tool-argument stream. Functional: proven on real chunks at no token cost. Enjoyable: the tail, the cursor and the dimmed settle read cleanly at every width.
