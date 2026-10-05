# Spec notes: WO-0009 Footnotes

None of these blocks the build. Settle them while building; each is looked at again at inspection.

1. The all-found row has no short form. At 20 columns the inner width is 16 and `✓ 7 named, 7 found` is 18 characters (`✓ 20 named, 20 found` is 20), so the most common state of the card would end in `…`. Give it a short form below an inner width of 36 that fits 16 (the note already carries the tally, so `✓ all found` is enough) and cover it in the A15 test.
2. A reply whose only tokens are unchecked symbols draws `Nothing to check in the last reply.` followed by the dim `Symbols not checked: ...` row. The spec implies this but does not draw it; make sure both rows read well at 20 columns (`No symbol check`).
3. A path with `..` segments (`../shared/x.ts`) matches the path rule. Say what happens: it should resolve through `$.fs.exists` at `<cwd>/` only and otherwise be left out, never `missing` through a suffix match in the listing.
4. The symbol search prints one line per occurrence (`-o -h`). A very common part (`id`, `get`, `name`) in a large repository can pass 4 MiB and turn the whole check into `git failed`. That is the safe side, but consider whether a search that only needs "occurs or not" can be made cheaper; at the least, stdout lines must be trimmed of `\r` and de-duplicated before they are compared.
5. The check is awaited inside `turn.complete`, so a slow or hung git holds the end of the turn for up to 6 s. Both `$.process.run` rejections (timeout included) must be caught so that the hook still returns what `next(e)` gave; the same for a rejected `$.session.repo()`, `$.session.cwd()` or `$.fs.exists`, which the spec does not mention. A thrown check must leave `last` as it was.
6. A token that names the same file two ways (`login.ts:88` and `src/routes/login.ts:88`) counts twice and draws two rows with the same name. Acceptable; do not read the file twice.
