# Inspection: WO-0033 Provenance (`provenance-widget`), second pass

Verdict: **pass**. The four findings of the first inspection are fixed, each with a test, and nothing else moved. The join from a line of code to the prompt behind it is new on the floor, costs no tokens, and the live run shows it working on real events.

## What was run

- Checker: `PASS provenance-widget meets the standard.` (15 acceptance tests plus the standard five).
- `render.ts` at rest, `--turns 1`, `--turns 3` and every verb. The demo engine has no git stand-ins yet, so every frame is the no-repository card, as the spec's Demo section says it must be:

```
╭──────────────────╮    ╭──────────────────────────────────────╮
│ Provenance       │    │ Provenance                           │
│ Not a git        │    │ Not a git repository.                │
│ repository.      │    │ Provenance needs git history.        │
│ Provenance needs │    ╰──────────────────────────────────────╯
│ git history.     │
╰──────────────────╯
```

- Verbs there: `scan`, `look`, `look a.ts:1`, `look :5`, `look C:\a b\c.ts:3-1`, `  Scan  ` answer `Not a git repository.`; `copy` answers `Nothing to resume: look up a line first.`; `CLEAR x` answers the usage line; `clear` answers `Provenance cleared: 0 commits forgotten for project.`; `off` removes the card.
- The other states were judged from A15, which pins the rows at 20 columns for every kind of finding; they match the drawings and spec notes 1 and 2.

## The four findings of the first pass

1. **CRLF, fixed.** `glance` (register.tsx 492-494) folds `\r\n` to `\n` in the file text and in `old_string` before the search. A6 now edits a CRLF copy of the source with a multi-line `old_string` and expects the same `-L 41,58` and a traced finding.
2. **Rows nobody typed, fixed.** `reduced` (243-244) skips `isCompactSummary` rows and texts starting `[Request interrupted by user`. A3 holds both interrupt markers and a compaction row. The compaction key is still unconfirmed against a real saved row; if the key differs the text filter does not catch it, and the cost is one wrong quote after a compaction in scanned history only. Acceptable; noted for the catalog's next audit.
3. **Plural, fixed.** `resting` (336) uses `plural()`; with a failed count the card has no note. A13 expects `1 commit recorded.` at 40 and `1 commit` / `recorded.` at 20.
4. **Write for nothing, fixed.** `amend` (401) returns without writing when clear finds no entry.

## Live run (director's, `live.txt`, on the rebuilt widget)

- `on`, `look`, `scan`, `clear`, `off` all answer in the spec's forms. `look prov.txt:1` gave `commit 46926cd (1 of 1 lines), 5 Oct 2026`, the prompt cut at a word with `…`, and `Resume: claude --resume 00ea6b37-...`, the true session id. The record came from a root commit (`[main (root-commit) 46926cd] Add prov`) seen after a late `git init`, with a CRLF warning line before it: real shapes, handled.
- `3 commits recorded` beside `1 of 1`, and `clear` forgetting 4: two echo lines from another widget's old sessions and the first live run's commit `4980b35` are commit lines by the spec's rule; the run's own commit was recorded live and not counted twice. 1 + 3 = 4. Consistent.
- Store: `isOn` false only. No error anywhere.
- The run has no Edit, so the Edit trigger has still not met a real event. The types file (2.1.289) gives Edit a flat `file_path` and `old_string`, the same envelope from which the live Write's `file_path` and the Bash `command` were read correctly, so the risk is small. Not held for it.

## Notes for the director (no work for the machinist)

1. The spec's Live recipe cannot remove `.git` (refused as a sensitive path both times). The scratch project is clean now (`README.md`, `green-live`, `lm.txt`, `seen.png`); any later run needs the same cleaning by hand.
2. If the recipe is ever rerun, add one Edit of `prov.txt` after the commit so the Edit trigger meets a real event.
3. The demo page needs the stand-ins of the spec's Demo section before the card shows anything but `Not a git repository.` there.

## What is right

One reducer for live and saved commits, dedupe by session and short hash, the subject-and-time join with like units, `isLooking` cleared in a `finally`, every hook returning the very object `next` gave and checking the switch first, verbs that never switch the widget on, no timer, store `isOn` only, and cards that hold their border at 20, 40 and 60.
