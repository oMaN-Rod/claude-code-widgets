# WO-0015 Critic: inspection

Verdict: **pass**. The build meets the spec and the standard, and the third live run (defect in a tracked code file) proved the one thing the first hold was waiting for: a real finding, handed to Claude, quoted back.

The build is unchanged since the first inspection (newest file `tests/widget.test.tsx`, 19:43 local; hold logged 19:53). The checker was run again and the frames spot-checked; the rest of the first inspection stands.

## What was checked

- Checker: `PASS critic-widget meets the standard.`
- Frames at rest, after 1 and 3 turns, and for `on`, `off`, `review`, `tell`, `clear`, `bogus` at 20, 40 and 60 columns: all match the spec's drawings. No wrapped or cut row.

```
╭──────────────────╮      ╭──────────────────────────────────────╮
│ Critic no review │      │ Critic                               │
│ The reviewing    │      │ No review yet. /critic-widget review │
│ model could not  │      │ has a separate model read the        │
│ be reached.      │      │ uncommitted diff and list only real  │
╰──────────────────╯      │ defects.                             │
                          ╰──────────────────────────────────────╯
```

- `render.ts` cannot draw the found card (the demo engine has no `SAID['critic-widget']` yet, so `review` answers `The reviewing model could not be reached.`, as the spec says it must). The widget's own wrap logic on the spec's findings gives the spec's drawings to the character at inner 16 and 36; a 60-character path with no space breaks cleanly across the two rows.
- `hooks/register.tsx`: `prompt.submit` returns `next(e)` first thing while off; the verbs answer `Critic is off.` before any work and never switch on; no timer, no file, no module-level `let`; only `isOn` is written to the store; `status` and `error` of an API error are never read; a reply is kept only under its own ticket while `reading`; switching off and `clear` empty the review and keep the ticket. Spec notes 3 to 7 are settled as asked.
- `tests/widget.test.tsx`: 19 tests for A1 to A14 with realistic diffs, `ProcessRunResult` and `ModelCompleteResult` shapes, a held promise for the reading state, CRLF and ragged replies, and the exact request. The brief's four test faults (off state, restore, placements, narrow card) are covered by A11, A1, A14 and A13.
- Break attempts: `REVIEW`, `review now`, doubled verbs, `tell` in every state, `clear` and `off` during a review followed by a new review, a reply of white space, a `* * *` rule, a `- NONE` reply, CJK characters in a finding. Nothing breaks the border or the state.

## What the live run showed (`live.txt`, third run)

```
>>> /critic-widget review
critic-widget: 1. sum.js:3: The loop condition `i <= list.length` reads `list[list.length]`,
which is `undefined`, so `total += undefined` makes the result `NaN` for every input, ...
The condition should be `i < list.
/critic-widget tell hands these to Claude.
>>> /critic-widget tell
critic-widget: The findings go to Claude with your next prompt.
>>> What did critic-widget just tell you? Quote it in one line.
> sum.js:3: The loop condition `i <= list.length` reads ... (the same finding, whole as stored)
>>> /critic-widget off
critic-widget: Critic off.
store: { "isOn": false }
```

- The switch, `review`, `tell` and `off` answer in the spec's words. A real `git diff HEAD` and a real `sonnet` call ran; the finding is correct, names the right file and line, and reached Claude through `prompt.submit` context. Nothing errored. The store holds `isOn` and nothing else.
- The earlier two runs answered `No defects found.` because the spec's Live command puts the code line in `README.md`; that was the command's fault, not the reviewer's or the build's.

## Findings

None blocks. All are notes for the next spec touch or for shipping.

1. **A long finding is cut mid-word with no mark.** Where: spec, Terms, "cut to 240 characters"; `register.tsx` line 100 does exactly that. The live finding ends `The condition should be \`i < list.` and Claude remarked that it arrived cut off. The meaning survived, and the build follows the spec. Right, at the next touch: either the BRIEF asks for one short sentence per finding (say under 200 characters), or a cut finding ends in `…` in the answer and in what Claude is told.
2. **The spec's Live command cannot prove the handover.** Where: spec, Live section. The defect belongs in a tracked code file; the command that worked is the one in `live.txt`.
3. **The demo needs its stand-in at shipping.** Where: `docs/engine.js`, `SAID`. Without `SAID['critic-widget']` as the spec's Demo section gives it, the demo card rests on `The reviewing model could not be reached.`
4. **Two oddities seen while breaking it.** A reply of `- NONE` reads as one finding `NONE`; a row of double-width characters relies on `truncate-end` rather than the widget's own count. Neither is against the spec.
5. **Spec note 1 is still unobserved.** The headless run cannot show whether the card reads `reading` while the hook waits, or whether a second `review` typed meanwhile is answered or queued. The tests prove the logic; the first interactive use will show the rest.
