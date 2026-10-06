# Spec notes, WO-0030 (green-widget)

The row-order fault of the first review is fixed: both drawings now put the never-green red row above the green row, as the Card rule and A10 say. No blocking fault. Settle these while building; they will be looked at on inspection.

1. Rows restored by `look` come from refs alone, so after a restart (or off then on) a command whose last run failed is drawn `✓` under `all green`. Either say so nowhere and accept it, or draw restored rows without claiming the last run passed; do not let the note state a pass the widget did not see in this session.
2. `runs` holds at most 8, but never-green reds have no ref. Say which run is dropped when a ninth arrives and one of the eight is a never-green red, and keep the ref cap (8 greens per tree) separate from the list cap.
3. `clear` deletes the refs of every tree but `read-tree --empty` empties only this tree's `index-<wt>`. The other index files stay under `$.plugin.root`; harmless (git rebuilds from them), but the answer should not imply more than was done.
4. `tell` paragraph 2 with one file must read `1 file had changed`, and the since line `since green: 1 file, +1 -1` (the demo shows this; test it).
5. Under 30 columns an age of `0s ago` becomes `0s`, and a span with no space is kept whole. The 20-column drawing has exactly 16 inner columns on every row: keep the leading single space on file rows, not two.
6. The `Paused until /green-widget clear.` sentence wraps at 20 columns; check that neither it nor the stderr sentence breaks the border with one long unbroken word (a path in git's stderr): cut it, do not wrap it.
7. `counted`: a leading env assignment (`CI=1 bun test`) is accepted, so the "first word" tests must skip assignments, or `FOO=1 cat test.txt` counts as a check. Add that case to A2.
8. The toast carries the whole command; cut a very long command there as on the card.
9. A fault from `commit-tree` or `update-ref` (not `add`) is not named: treat it as the `No snapshot: <stderr>` fault and record no green.
