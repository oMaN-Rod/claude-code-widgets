# Spec notes, WO-0032 Rehearsal

No blocking fault. Settle these while building; each is checked at inspection.

1. The cap is 40 shapes, so the card can never say `of 41`. Read every `41` in the drawings and in A4 as `40`: prove A4 with 1 deny, 3 ask and 36 allow (`4 of 40`, `36 would run by the rules.`), and never draw a count above the cap.
2. Notes at 20 columns: the layout cuts the note at its end, and beside `Rehearsal` only 6 characters fit. `all clear`, `no check` and `dontAsk` would be cut. Give them narrow forms under 30 columns (for example `clear`, `none`, `noask`) or drop the note there; no note may end in `…`.
3. Note in the states the spec does not draw: a non-dialog mode with every verdict `allow` (show the mode word, keep the `all clear` body), and unknown rows with no refused or ask row (not `all clear`; `0 of <n>` reads badly, so use the unchecked count or no note). Whatever is chosen, the note must not claim more than the body.
4. `All <n> calls seen here would run.` and `Nothing is known about <n> calls.` need `plural()`: `All 1 call`, `about 1 call`. Same for `1 could not be checked`.
5. The drawing shows `Write ../shared/config.json` for an outside path, but the rule gives a relative label only when the path is inside the root. Pick one: a `../` path when it is short, else the absolute path; cut with `…` either way. A relative input path that starts with `..` is class `out`, not `in`.
6. The spec says `classic.PreToolUse` carries no `permission_mode`; the types make its input `BaseHookInput & {...}`, which has the field. Do not special-case the event: read the field when it is a string, pass the event through untouched. A7's last clause then means only that the return value is `next(e)`'s.
7. The secret pattern `[A-Za-z0-9+/_=-]{32,}` also matches a long dot-free path such as `packages/application/source/components`. That only makes the call session-only, which is the safe side; leave it, but `show` must mark it `[this session only]` so the person can see why it is not remembered.
8. A command with a secret is still drawn on the card and in `show` this session. Keep it off the store and also out of any log line.
9. `shapeOf` on `input` that is not an object (the type is `unknown`), or a subject that is an empty string: treat as no subject, key and label the tool name. A `url` that does not parse: the same.
10. `forget <n>` when the row's call was replaced or dropped since the `show`: answer the `No row` line, do not forget a different call. After a `forget`, the remaining rows keep their numbers until the next `show`.
11. Rehearsal at `session.start` runs up to 40 queries in turn; do not hold `session.start` on it. Start it and let the card fill.
12. Switching off during a running rehearsal: the results that arrive afterwards must not write `verdicts` back into the reset state.
