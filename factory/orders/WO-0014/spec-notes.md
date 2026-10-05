# WO-0014 spec notes (inspector)

The spec passes. None of these block; settle them while building, and they will be looked at on inspection.

1. The 20-column drawing is captioned "cut at 128 characters" but its answer rows hold about 88 characters before the `…`. The rule (inner width times 8, so 127 characters and `…` at 20 columns, as A13 says) is what binds; the drawing is shortened. Note that 127 characters wrapped by words can take more than 8 rows at inner width 16; that is fine, but no word may break the border (a long path or URL with no spaces must be broken or truncated, not overflow).
2. While off, `ask` with no question: the Commands section gives two answers (`Aside is off.` and the usage line). Choose `Aside is off.` for `ask` in any form while off, since the standard says other verbs answer that the widget is off; A10 and A11 then do not overlap.
3. The turn note has no upper bound. At 20 columns `<turns> ago` must still leave the title readable at large counts (for example 1000 turns): check the header row does not wrap.
4. `turns` after `clear` or a new `ask` goes back to 0 (A5 covers the new `ask`; add the same check to A8 for `clear`).
5. The `ask` handler awaits the fork inside `command.run`. If the fork never settles the command never answers; `clear` frees the card, and the ticket rule drops the late reply. Make sure the dropped-reply path cannot throw when `talk` was reset in between.
6. `api-error` carries `status` and `error` in the types; the spec reads only `reason`. Keep it so, and do not print raw provider text on the card.
7. The idle sentence contains `<question>`; check it is drawn as text and wraps cleanly at 20 columns (`/aside-widget` is 13 characters, inside the 16 available).
8. A4 bundles six cases in one test; keep each case asserting its own sentence both on the card and in the command's answer, with fork results shaped like `ModelForkResult` (include `usage` on the completion arms).
9. In the live run, confirm that a real fork's own `turn.complete` (it carries an `agentId`) does not advance `turns`, and that the store holds `isOn` only.
