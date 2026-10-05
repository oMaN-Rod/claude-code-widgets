# Spec notes: WO-0016 Margin

No blocking fault. Every call and type the spec names is in this build's types (`$.ui.selection`, `UiSelection`, `$.ui.focus`, `$.prompt.read`, `$.prompt.fill`, `PromptFilled.refusal`, `InputProps`, `ButtonProps.variant`, `CommandPresentation.isFullscreen`, `RenderViewport.isFullscreen`, origin kinds `composer`, `bridge`, `sdk`, `task-notification`). The machinist settles these while building; each is looked at again at inspection.

1. **The flag's name.** Terms says the mark "is `cut`" and marking appends `{ passage, remark }`; State names the field `isCut`. Use `isCut` everywhere, and append all three fields.
2. **The field in the `below` placement.** `UiFocusComponent` is `Pane | AbovePrompt` only, so a `PromptHint` site keeps no focus ring and the `remark` field drawn there may never take the keys. Find out in the build. If it cannot be typed into, do not leave a dead field on the card in `below`: a mark stays a bare quote there and the person uses `mark <remark>`. Say what you found in the build notes; the hand check in Live covers it.
3. **`Already marked.` from the verb.** The types say the selection is forgotten once the person's next command has run, so a second `mark` verb in a real session answers `Nothing selected.`, not `Already marked.`; only a second button press can repeat a selection. The A5 test may stub the same selection twice for the verb, but must prove the button path too.
4. **`$.prompt.read` never rejects** by its doc (`{ text: '', cursor: 0 }` where there is no box). Keep the guard the spec asks for; it costs nothing. A draft is "blank" when its text is empty after trimming.
5. **Slash commands and `prompt.submit`.** If a typed command also reaches `prompt.submit` with origin `composer`, then `/margin-widget drop 1` after a send would empty the marks before the verb runs. Check with the live run (the order `send`, `drop 1` in the Live line shows it only with marks, which headless cannot make), and in the test for A9 feed a command-shaped prompt if the engine does pass them; marks must be cleared only by a prompt that goes to Claude.
6. **A passage of blank lines.** The sent text prefixes every line with `> `; an empty line inside a passage should become `>` with no trailing space. Pick this and hold it in A7.
7. **Truncation.** The 600 and 200 character cuts and the card's cut to inner width less 2 must not split a surrogate pair or count a wide character as one cell; A14's one-word 600-character passage should include a wide character.
8. **`drop` forms.** `drop 1.5`, `drop -1`, `drop 01` and `drop 1 2`: the spec says "a whole number"; treat anything that is not digits alone as usage, and `drop 01` as mark 1. `No mark <n>.` echoes the number parsed, not the raw text.
9. **Wrapped sentences at 20 columns.** No drawing shows the empty, error, after-send or not-fullscreen card at 20 columns. They fit by word wrap at inner width 16 (`fullscreen: /tui` is exactly 16); the checker's render must show no cut word in any of them.
10. **`earlier` row.** With 5 marks it reads `1 earlier`; it is not a count noun for `plural()`, so the same word at every count is right.
11. **Pressing Mark while a field waits.** The new mark takes the field and the earlier one stays a bare quote. That follows from Terms; make sure the remark typed but not submitted is not stored on either mark.

## Second review (after the machinist's send-back)

Both faults of the send-back are fixed: A1 and A2 no longer ask for a recorded `ui.focus` call, A5 no longer asks for a `deny`, A8 no longer asks for the `refusal: 'dialog'` sentence, and Live lists both as hand checks. No blocking fault in what changed; still 120 lines and 15 acceptance lines.

12. **The untested branches stay in the code.** The `$.ui.focus` call after a marking press in `Pane` and `AbovePrompt`, and the `A dialog is open. Marks kept.` sentence for `refusal: 'dialog'`, are still required by Terms and Card though no test reaches them. Do not remove either to match the tests; they are read in `register.tsx` at inspection.
13. **A2's rejecting focus.** The rejection must be caught inside the press handler, so the test shows no unhandled rejection and the card is drawn with the field in all three placements; a test that passes only because the rejection is swallowed by the kit proves nothing.
14. **The hand check.** The four hand checks under Live cannot be made by `live.ts`; the build notes should say plainly which of them the machinist could not observe, so the director knows what is left for a fullscreen terminal.
