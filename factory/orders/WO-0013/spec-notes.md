# Spec notes: Squiggle (WO-0013)

The spec passes. The earlier blocking fault is fixed: the demo draft is now `fix src/formt.js and test.js` (cursor 28, the end of `test.js`), `formt` meets the 4-character rule, `src/format.js` and `test.js` are both in the demo engine's 8 files, and Demo, Verdicts and A5 agree. Settle these while building; each will be looked at on inspection.

1. **Call names are unproven on this machine.** No engine types file is on disk here; `prompt.edit`, `PromptDecoration` and `$.prompt.read` are used by no shipped widget. Build against `plugin-authoring/types/claude-code.d.ts` and keep the spec's guard: a missing `$.prompt.read` or a missing `prompt.edit` must not stop the widget from starting (A12, Demo).
2. **`$.session.repo()` is async** in the demo engine (`repo: async () => ...`). Await it before choosing between `git ls-files` and the folder walk.
3. **`found[].to` for a miss with no near name** is not stated. Use an empty string, and draw no `nearest` row for it. `matches` for a miss is 0.
4. **Several matches plus truncation.** `✓ register.tsx  3 files` at 20 columns does not fit (22 characters). Truncate the word and keep the count, or drop to `3 files` after a shortened word; do not let the row wrap.
5. **Notes at 20 columns.** `1 ✗` is given for the miss note. Say what `2 found`, `indexing`, `unchecked`, `partial` and a large `12,345 files` become at 20 columns; none may push the title off or wrap.
6. **`+N more` counts words**, not rows: with 6 verdicts and 4 shown it is `+2 more`, whatever the number of `nearest` rows.
7. **Cap order.** "The first 8 candidates are checked" and "at most 4 words on the card": the 8 are taken in draft order before sorting missing first, so a miss that is the 9th candidate is never shown. That is acceptable; test it so it is deliberate.
8. **Cursor rule and decorations after a rewrite.** The cursor to compare is `r.cursor` from `next(e)`, not the input's, for the same reason offsets go into `r.text`.
9. **Duplicate words.** The same path typed twice in a draft: paint both occurrences, list it once on the card and once in `check`.
10. **Stale flag on `tool.call`.** The real result shape for "denied" and "error" differs from what tests imagine; the live run's `Write` turn is the proof. Read-only `Bash` calls also mark stale, which costs one `git ls-files` per such turn and is fine.
11. **A rebuild that fails after a good index.** Not stated: show the error card and paint nothing (as A10 says for a failed listing), rather than keep painting from the old list.
12. **`check` with a long answer.** Up to 8 lines is fine; a word 300 characters long should be answered whole in the command reply but truncated on the card.
13. **Folder walk keys.** Paths from `$.fs.list` on Windows come with backslashes and an absolute root; normalise to forward slashes relative to the cwd before they reach `paths`, and use `folder()` wherever a folder is compared.
14. **Live line.** The scratch project may or may not be a git repository; the expected answers hold either way, but the sentence "this proves the folder index" is only true without one. Report which source the run used.
