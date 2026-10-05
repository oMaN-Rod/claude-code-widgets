# Inspection, WO-0028 Amendments (second build)

Verdict: **pass.** All six findings of the first inspection are fixed, every state matches the spec's drawings at 20, 40 and 60 columns, and the real engine reaches both capture hooks. Five notes at the end; none holds the widget back.

## What was run

- Checker: `PASS amendments-widget meets the standard.`
- `render.ts` at rest, `--turns 1`, `--turns 3`: the empty card each time (the demo engine has no `prompt.compose`, as the spec's Demo section says). No fault lines. Every verb and `what`, `SHOW`, `show 0`, `show 1 2`, `show 0007`, `show 99999999`, and `show` / `clear` while off through `--do`: each answers as specified.
- A scratch harness outside the repo (a copy of `render.ts` whose demo engine answers `$.session.version`, exposes its dispatch and seeds `amendments.json`). It raises `prompt.compose` and `tool.describe` with **no `next.trace`**, which is exactly the Demo section's path. Every state below was drawn that way.
- Live: `live.txt` (the director's run on this build) read; no second run made.

## Frames that matter

The Demo path, seeded at 2.1.287 and running 2.1.289, before and after one turn (finding 1 of the first inspection, now fixed):

```
│ Amendments                       new │   │ Amendments              3 amendments │
│ 2.1.289 is new here (was 2.1.287).   │   │ 1 session_guidance               new │
│ Compared after your next turn.       │   │ 2 tone                         +3 -2 │
                                           │ 3 Bash tool                    +0 -3 │
                                           │ 2.1.287 → 2.1.289                    │
                                           │ show <n>: before and after           │
```

20 columns, nine amendments and the two cards that had stray indents (finding 2, fixed):

```
│ Amendments     9 │   │ No baseline yet. │   │ No change since  │
│ 1 actions  +2 -1 │   │ After your next  │   │ 2.1.287.         │
│ 2 doing_t… +2 -1 │   │ turn what Claude │   │ 2.1.289 here for │
│ 4 output_… +2 -1 │   │ Code tells       │   │ 9d 4h            │
│ … 3 more         │   │ Claude is saved, │
│ 2.1.287→2.1.289  │   │ and each update  │
│ show <n>         │   │ is compared with │
```

Baseline, unchanged (`2.1.289 here since just now` on the turn itself, `here for 9d 4h` in a later session), working and error cards match the drawings at 40 and 60; the note switches to the bare count at 28 and 29 and back to words at 30; a wanted width of 60 keeps facts whole and cuts a 70-character label with `…`. No line of any state is wider than its card or starts with a space.

## Live run (director's, `live.txt`)

`on`, one tool-less turn, `show`, `off` answered as the spec's Live section calls a good run: `Baseline taken at 2.1.289: 1 section, 28 tools. Nothing to compare yet.`, and the store holds `isOn: false` and nothing else. So a real main render and 28 real `tool.describe` events passed the main-render and provider rules and were flushed at the real `turn.complete`. The kept file was not there to read this time (the run was made without `--keep`); the entry-for-entry comparison of two runs was done by the director on the first build and the capture code has changed only in how an absent trace is treated.

## Tried to break it

- Files `nope`, `{}`, empty, `[]`, a shot whose text is a number: error card, the read sentence from `show` and `show 1`, no flush writes over the file, `clear` recovers and the next turn takes a baseline. `last` naming a book that is gone: the empty card, then a baseline.
- `$.session.version` throwing: the empty card, the turn writes nothing, what was held is kept for the next turn.
- Renders with `teammate`, with `analysis`, opening with `agent_body`, with no sections, with `sections: null` and `[null]`: nothing captured, the answer handed back.
- Loose: a second session on one version with another `tone`, a section missing and one extra marks the three loose and keeps the stored text; a third with another Agent description marks that tool; after the update none makes a row and `show` lists `extra, system, tone, Agent tool`. A tool on one side only makes no row and becomes one at the turn it is described.
- Five keys: four books stay, the oldest goes. A second key inside one session is ignored.
- 600 by 600 changed lines take the remove-all path in 6 ms and `show 1` stops at 200 lines with `… 1000 more lines`; 400 by 400 alternate lines give `+200 -200`; a 5,000-character line is one `+1 -1`.
- Off: a render, a describe and a turn leave the file byte for byte and `held` at rest; switching on again draws the book's report.

## Read in `hooks/register.tsx`

The three event hooks return `next(e)` straight after the switch while off; both capture hooks return the very answer `next` gave, with the work inside `try`/`catch`; verbs never switch the widget on; no timer, no module-level `let`, no `$.ui.invalidate`; the only writes are `amendments.json` and `isOn`. The tests feed real-shaped sections and descriptions, A3 raises the widget's own hooks with an engine trace entry, a rejected one, an empty trace and none, and A15 now measures every sentence line of every state.

## Notes (not faults)

1. A development version in the version row is cut on both sides at 20 and at 40 (`2.1.289-dev.2026…→2.1.290-dev.20260…`), so the two can read alike. The sentences above it carry both in full. Release versions fit whole.
2. While on, a request costs two state reads (`isOn`, then `held`), where the spec's Cost says one. Harmless.
3. A text gaining a trailing newline counts as a line (`+2 -0` for `'' → 'now\n'`), and `show` prints a bare `+ `. True, slightly odd.
4. `show 1` on a baseline answers `No amendment 1. There are 0.`; correct, though `Nothing to compare yet.` would say more.
5. Two sessions on different versions sharing the file (an old session left open across an update) can turn the book round once (`2.1.289 → 2.1.287`). The card says which way it compares, so it is never false, but it is worth a line in the catalog entry one day.
