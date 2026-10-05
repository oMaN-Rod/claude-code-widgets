# Inspection: WO-0001 Sieve (third inspection)

**Verdict: pass.** The build is the one the second inspection found no fault in (`hooks/register.tsx` 16:01, `tests/widget.test.tsx` 16:03, unchanged), and `live.txt` (16:08) is now a run of this build. The live run shows what the tests could not.

## What was done

- Checker, run again: `PASS  sieve-widget meets the standard.` 14 acceptance lines, 16 tests.
- `render.ts` at rest and with `--do "/sieve-widget now"`, `clear`: `no reading` at 20, 40 and 60 columns, no cut line; unknown verbs change nothing. The demo engine has no `$.session.messages` (finding 2).
- Code and tests: read at the second inspection, no change since. Every hook checks the switch first, no timer, no `$.session.compact` call, only `isOn` stored, off clears `preview` and `last`.
- Probes of the second inspection (task-notification pairing, heredoc digest, `size(NaN)`, the 76k transcript shape) stand: same source.
- Live run: read from `live.txt`, not run again.

## The live run

```
>>> /sieve-widget on            sieve-widget: Sieve on; /widgets places it.
>>> three seq runs, a Read, two text turns
>>> /compact
ui_toast   Sieve: about 76k to about 25k, every word kept, no summary.
status     compact_result success
boundary   trigger manual, pre_tokens 76252, post_tokens 6093, duration_ms 11
>>> Reply only: after           after
>>> /sieve-widget off           sieve-widget: Sieve off.
store      { "isOn": false }
```

- `$.session.usage({ breakdown: 'summary' })` answers from inside a real `session.compact` hook: the outcome is `sieved`, not `failed`.
- The breakdown has a `Messages` row: without it the widget would have read about `to about 500`.
- 11 ms and no summarizer wait; the next request answers; the store holds `isOn` only.
- `before` is 76k against the engine's `pre_tokens` 76,252.

### The 25k

The second inspection said a pass needs `to about <6k to 8k>`. That criterion was wrong, not the widget. The engine's `post_tokens` (6,093) counts the conversation that is left; the widget's figure is the whole context after the sieve: `left = rest + sieved conversation`, and `rest` (system prompt, tools, what no compaction removes) is about 19k in a real session. The probe behind the 6.8k figure gave `rest` only 6k. The first live run measured a 28k context at the first response after the same sieve, so `about 25k` is within about 3k of what the person then sees in the note, and `Last sieve` is corrected to the measured figure at that response. `About 76k to about 25k` compares like with like (context before, context after), which is what the card's note shows. The fault that sent the order back (54k claimed against 28k real) is gone.

## Frames

```
│ Sieve                         sieved │      │ Sieve     sieved │
│ About 76k to about 25k               │      │ 76k to 25k       │
│ Every word of 12 messages kept       │      │ 12 texts kept    │
│ 4 tool calls folded to 4 lines       │      │ 4 folded         │
│ No summary written, no tokens spent  │      │ no tokens spent  │
```

## Findings

1. **None against the build.**
2. **Shipping, must do.** `render.ts` and the demo page show `Could not read the conversation`. The clerk adds the stand-ins of the spec's Demo section to the demo engine (`$.session.messages`, a growing transcript, `engine.compact()` dispatching `session.compact`, a `Messages` row that grows). The widget does not go on the page before it shows the working state and the best moment.
3. **Not seen live.** The card itself between the compaction and the next response (note 5): `live.ts` prints toasts and the store, not frames. The toast carries the same figures and the tests prove the card (A7, A2).
4. **Not seen live (note 10).** A `precompute` answered with `{ skip }`, then the `auto` that follows. Tests cover each half; the manual path is proven live.
5. **Design, for a later revision.** Right after a sieve nothing is left to fold, so a second bare `/compact` goes to the usual summary, and the card (`Nothing to sieve yet.`) does not say so beforehand. The toast is honest when it happens.
6. **Design, as stated in the Purpose.** A compaction deep inside one long turn steps aside; the working card says `Too much: a summary would run` beforehand.
7. **Trivial.** A `Messages` row of 0 tokens beside real tool calls draws a bar of `░` only. Not expected from the engine.

## Bar

Original: the only widget that answers a compaction, and nothing shipped does anything like it. Functional: proven in a real session, 76k to a 25k context in 11 ms with no model call, and the session carries on. Enjoyable: the best-moment card and toast say plainly what was kept and what it cost. Better than what is shipped.
