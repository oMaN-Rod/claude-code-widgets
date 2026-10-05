# WO-0003 spec notes

The three faults of the last rejection are fixed (A3, A6, A5 and A9). The spec is 104 lines with 15 acceptance lines. Settle these while building.

1. Equal times. `tool.check` denies when the other session's time is "later than `seen[key]`". In the demo the stand-in's `at` is "always the present moment" and the `Read` sets `seen` from the same clock, so the two can be equal and the demo row would never appear. Make the stand-in's time strictly later than any read (or compare with `>=` in the demo stand-in only), and keep the real comparison strict.
2. The denied `Edit` in the demo still reaches `tool.call` and sets `seen[key]` to now. The row must stay `✕ stopped` (only a `Read` makes it `re-read`), and the second turn must still be stopped; check both in the demo, not only in tests.
3. The standard's Lifecycle names a file under `$.plugin.root` for what is shared between sessions; this spec writes under the config folder because the order's brief names the plugin folder as a fault. The brief governs. If the checker flags the path, report it rather than moving the file back.
4. Error card with meetings and with no meetings is described but only the second is drawn. At 20 columns with rows, legend and wrapped error text the card is tall; keep the error text last and whole.
5. Blind with count lines: the Error drawing shows no count lines. Say the same in code: while `isBlind`, the count lines are hidden even when `mine` is not empty.
6. A12 packs the id change, the slot rewrite and `clear` into one line. Keep it one test named `A12: ...` but assert each step separately so a failure says which step broke.
7. A3, A5, A9, A11, A13 and A14 each hold several cases; the same applies. One test per line, each case asserted on its own data.
8. Place cut: "cut at 8 characters with `…` at its end" does not say whether the `…` counts in the 8. The drawing (`api`, `web`) does not settle it; pick one, and make sure a 40-column row with an 8-character place and a long name still fits on one line.
9. A place that is empty (a `cwd` of `/` or `C:\`) needs a stand-in word in the row and in the reason text, so the message never reads "(in )".
10. `<span> ago` in the reason and context strings: at zero seconds `span()` must not give an empty or odd phrase ("0s ago" is fine; "ago" alone is not).
11. Bash word splitting: a word such as `-am` or `"x"` resolved against the cwd is a harmless missing path, but a word that is a directory (`src`) stats as `kind: 'dir'` and must be skipped, not recorded.
12. The 40-stat cap does not say which candidates win when there are more than 40. Take the keys other sessions hold first: they are the ones that can produce a warning.
13. `seen` is set by `Read` only on a result that is not an error or a deny; a partial read (offset and limit) counts as a read. Say so in a test name or leave it, but do not treat a partial read differently.
14. Legend order at 20 columns is fixed (`✕`, `!`, `✓`) whatever the row order; A15 names the three lines but not the order. Assert it.
