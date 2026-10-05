# Spec notes: WO-0004 Witness

1. Demo: the stand-in block is 92 characters, so by `ceil(chars / 4)` the card reads `Last prompt: about 23 tokens` and `about 23 tokens in all`, not `about 21 tokens`. Build to the rule, not the figure.
2. Reading: the spec tests `e.origin.kind`, but an origin can be absent (the types call an absent origin the user's own prompt). Read it as `e.origin?.kind`, decide whether an absent origin is recorded, and cover it in the A6 test.
3. Reading: a block of only whitespace passes the "not empty" filter and would draw a blank verbatim row. Either drop it from the rows or filter on the trimmed text; keep the count and the card in agreement.
4. Card: the `more` line counts from `lastCount`, not from the kept entries, so a prompt with more than 20 additions still reads `and <lastCount - 3> more`.
5. Card: the note `+<lastCount>` with a large count (`+12,345`) beside `Witness` must still fit the 16-character inner width; say whether it carries separators and test it in A13.
6. `show`: the per-entry heading `about <t> tokens` uses the true `chars` of the entry, not the 2,000 held, and goes through `tok()`.
7. `show`: prompt numbers count entered prompts only; a dropped prompt takes no number. Worth one assertion in A5 or A7.
