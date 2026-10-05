# Inspection, WO-0008 (done-widget), fourth pass

Verdict: **pass**. Judged within the director's ruling: a fault is the build not following the written rule, an honest answer from the spec's lists that nudges, or a plain claim from the spec's lists that is missed. None was found. The phrasings below that the written rule does not cover are notes for the README row.

## What was checked

- `check.ts` with the spec: PASS.
- `render.ts` at rest, with two `add`s and `--turns 1` / `--turns 3`, after `off`, after `clear`, and 24 verbs in a row (a Windows path of 100 characters with no spaces, a wide-character text, `$& <b>{x}</b> %s`, `drop 2 3`, `drop -1`, `drop 99999999999999999999`, `drop 1e0`, `drop 03`, `show extra`, `tick 1`, `off now`, the four verbs while off, a seventh `add`, `CLEAR`, `On`). Every frame and answer matches the spec.
- `hooks/register.tsx` read in full against spec lines 21 to 31 and the standard. Every hook but `session.start`, `command.run` and `ui.render` reads the switch first; verbs do not switch on; no timer, no file, no clock; the store holds `isOn` only.
- `tests/widget.test.tsx` read in full: one test per acceptance line, realistic texts, A8 and A9 hold every answer the spec quotes.
- `claims()` and its patterns copied to a scratch file outside the repo and run on 113 answers with items `the tests pass`, `no new dependencies`, `the bug is fixed` open: all 27 claims and 41 quiet answers of spec A8, A9 and step 6 land as written, and so do the seven spec notes (`now` is not `no`, `opened` is not `open`, `diff` is not `if`, `going` is not `go`, `**Is it done?**` and `Is it done?"` are dropped, `10 failures` and `20 fail` count while `0 fail` and `00 fail` do not, item texts with `( ) + $& .*` neither throw nor over-match).
- `live.txt` (written after this build) read; no second live run.

## Frames

```
│ Done             │      │ Done                                 │
│ No definition of │      │ No definition of done yet.           │
│ done yet.        │      │ /done-widget add the tests pass      │
│ /done-widget add │      │ Claude ticks each with its evidence. │
│ the tests pass   │
│ Claude ticks     │      │ Done                         0/5 met │
│ each with its    │      │ · 1 C:\Users\someone\a_very_long_pa… │
│ evidence.        │      │ · 2 日本語のテストが通ること、そし…  │
                          │ · 3 1                                │
│ Done     0/5 met │
│ · 1 C:\Users\so… │
│ · 2 日本語のテ…  │
```

No wrapped or cut border at 20, 40 or 60. Off draws nothing and the four verbs answer `Done is off.`; the list comes back on switch-on.

## Live run (`live.txt`)

Commands answer as specified. Claude loaded and called `mcp__done-widget__tick` with `item` 1 and got `1. [x] the README has a title (README.md line 1 is # scratch)`, `2. [ ] the tests pass`, `Still open: 2.` Its reply ended with the bare `Done` it was told to write, and `show` printed `2 items, 1 met:`, the two lines and `Said done too soon: 1 nudge`, as the spec's Live section says. Store: `isOn` false and no other key. No errors.

## Findings

None that sends the widget back.

## Notes (for the README row; no change asked)

1. The rule reads one clause at a time, so a hedge in a neighbouring clause does not quiet a claim. These nudge, as the written rule says they must: `If the tests pass, we are done.` (the item text is taken out and the comma splits), `Tests pass, so we are done.`, `Step 1 done, step 2 pending.`, `1/3 done.`, `One of three done.`, `TODO: get it done`, `Should be fixed.`, `This should now be resolved.`
2. A claim word that does not end its clause stays quiet: `The work is done 100%.`, `The task is complete apart from the lockfile.` Both are outside the written rule.
3. `claims()` is linear. Real prose of 412,000 characters is judged in 14 ms. Two degenerate inputs pass the 100 ms of spec line 25: one clause of `done` followed by 100,000 repeats of `now`, and `tests` followed by 100,000 repeats of `is` (about 120 ms each, 30 ms at 25,000). No answer reads like that; worth knowing, not worth a patch.
4. A `tick` with no `item` answers `There is no item (none given).` where spec line 16 would give `undefined`. The build's wording is the better one and is held by A6.
5. An item whose whole text is one common word (`done`, `tests`) is taken out of every answer before the rule runs, as step 1 says, so a claim made with that word is not seen.

The card, the verbs, the tool, the off state, the store, the claim rule and the live run all pass.
