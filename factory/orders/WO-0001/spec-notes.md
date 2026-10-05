# Spec notes: WO-0001 Sieve

Not blocking. Settle while building; each is looked at again at inspection.

1. The types file says to branch on a row's `kind`, never on its `name`; the spec matches `kind` `used` and `name` `Messages` and gives its reason. Match the name exactly, and keep the fall to `conv = total` when the row is missing, so a renamed row degrades to the older weighing instead of throwing.
2. `context.breakdown` measures against the compaction window and estimates every row, so its `totalTokens` and its `Messages` row need not agree with `context.tokens`. The cap at `total` covers a row that is too large; make sure `rest` can never go below 0 and `scale` is never `NaN` or `Infinity` when `total` is 0 or the character count is 0.
3. A14's `A sieve leaves about 24k` holds only while the digests add under 2,000 characters (1k at 2 characters a token). Keep the test transcript's digests short, and prove `left` from the sieved list's characters, not from a constant.
4. `Enough` compares `left` with `context.window`, while the engine compacts against a window that may be smaller. Acceptable as written; do not add a second window to the spec's rule.
5. The first measure that carries `tokens` after a sieve both corrects `last.after` and looks, so the best-moment card gives way to the working card at the first response after the compaction. That is the spec; the live run must show the best-moment card is on screen from the compaction until that response, and that `Last sieve` then carries the measured figure.
6. A look after a sieve whose kept tail holds no tool call gives `face` `empty`, so `Last sieve` has nowhere to show. Acceptable; do not invent a working card with zero traffic to carry it.
7. The bar has no rounding rule. The three segments must sum to the inner width exactly, a non-zero segment gets at least one cell, and the third segment is sized from `rest`.
8. `last` for `short` holds `before`, `after` and zeros, as the spec now says; `isMeasured` stays `false` there and a measure must not overwrite a `short` outcome's `after`.
9. The tail-pairing rule moves the cut back one turn start at a time; when it reaches the start of the list nothing is folded and the compaction goes to `next(e)`. The digest entry of a call with none of the seven input keys is the tool name alone, with no trailing space.
10. A `precompute` answered with `{ skip }` leaves nothing kept for the compaction that follows. The live run has not yet shown that the `auto` compaction still reaches the hook afterwards and is sieved.
11. The demo stand-ins of the Demo section do not exist yet. Until they do the demo page shows `Could not read the conversation`, and the widget must not ship so.
12. The answers of `on`, `off` and the bare toggle are not worded in the spec. Use the template's sentences unchanged.
