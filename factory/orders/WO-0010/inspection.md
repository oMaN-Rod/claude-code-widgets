# Inspection: WO-0010 Queue (`queue-widget`)

Verdict: **pass**. It meets the spec and the standard, both faults of the brief are gone, and it is worth shipping: a queue with a gate is real work done while the person is away, and the card and report say plainly how each prompt ended.

## What was run

- `check.ts ... --spec`: PASS.
- `render.ts` at rest, with `--turns 1` and `--turns 3`, and with every verb at 20, 40 and 60 columns.
- A scratch copy of the renderer (outside the repo) that interleaves waits and turns, to reach the states `render.ts` cannot (see finding 1).
- The director's live run in `live.txt`; no second run was made.

## Frames that matter

Rest (40), matches the spec's empty drawing line for line; with a gate set the sentence is followed by `until: <gate>`.

Gated, one prompt finished, the next sent:
```
│ Queue                        running │
│ 1 clean                              │
│ ▶ bump the version                   │
│ until: npm test                      │
```
Everything finished (20 columns):
```
│ Queue  all clean │
│ 2 ✓              │
│ ✓ update the ch… │
│ ✓ bump the vers… │
│ until: npm test  │
```
Busy, long gate, 6 added behind 2 clean (20 columns): every row one line, `+2 more`, `until: bun test…`; no border broken at 20, 40 or 60.

Switched off during a run, then on: note `halted`, `0 clean · 1 not`, `1 update the changelog`, `■ switched off`; `report` gives `■ fix the flaky date test (0s; switched off)` and the `Halted:` line; `add` answers with the halted suffix; `clear` returns the empty card.

## Break attempts

- Off: `add`, `until`, `start`, `drop`, `report`, `clear` all answer `Queue is off.`; `stop` and `on now` answer the usage; no card.
- `drop` with nothing, `x`, `0`, `9`, `-1`, `1 2` and a 32-digit number refuse with the typed text cut to 20; `drop 01` is taken as 1.
- `ADD` in capitals works and keeps the prompt's case; a 100-character prompt is labelled at 80 with one `…`; the eleventh, twelfth and thirteenth `add` are refused.
- `start now`, `report x`, `bogus` answer the usage; `until OFF` removes the gate; a gate holding backticks stays on one line in the answer and the card.
- Off and on with a prompt waiting and no run resumes without `start`.

## Live run (`live.txt`)

Every command answered as the spec says. Two assistant turns that no `>>>` line asked for answered `one` then `two`, in order. `report` was typed before either finished (`Nothing has finished yet.`, `2 prompts waiting.`, `Gate: git --version`), as spec note 15 expected. No retry turn appeared between `one` and `two`, so the gate ran through `cmd /c` and passed. No error. The store holds `isOn: true` and nothing else.

## Code against the spec and the standard

- `turn.start` checks the switch first; `turn.complete` returns what `next(e)` gave on every path and only reads state before the switch check; `step` returns first when off; a gate result or a submit refusal arriving after the switch is discarded by `isSame`.
- `sync` is the only place the timer starts or stops, cancels and assigns with no await between, and `timer` is the only module-level `let`.
- The only store write is `isOn`. No file, toast, abort, `prompt.submit` hook or model call.
- `take` and `settle` decide inside one `update`, so two steps cannot send one prompt or run one gate twice. A submit that rejects after its turn began closes the run once and that turn's completion is ignored.
- `output()` cuts to 4000 characters before splitting, so a huge single line is not split whole.
- Reasons in the types are `answer`, `aborted`, `refusal`, `error`; `aborted` without the flag is also read as interrupted. Every halt fits 14 characters.
- Tests: 15, one per acceptance line, with a stand-in plugin recording real origins, gates answered through `ground()`, and whole rows, colours and report text asserted. They prove the lines rather than agree with themselves.

## Findings (none blocks the pass)

1. `factory/tools/render.ts`: `--turns` runs its turns before the 400 ms step has sent anything, so the card never moves under `--turns` for this widget. Not a fault of the widget. Right would be a way to wait between `--do` lines and turns.
2. `register.tsx` `draw`: a run still in phase `sent` (a queued `/clear`, or a prompt swallowed without a drop) shows `▶` and the note `running` for good. `report` does say `(sent; its turn has not started)`. Right would be the card saying the same after a while; a matter for a later order, the spec names it a known limit.
3. `register.tsx` `told`: a gated prompt that took under a second reads `(1s; gate passed)` or `(0s; switched off)`. True enough; no change asked.
4. The live run did not exercise a failing gate. The retry path is proved only by A5 and A6. A later live run with a gate that fails once would close that gap.
5. The empty card at 20 columns is 10 rows of help. It reads, and nothing is cut; shorter wording below 36 columns would be kinder.
