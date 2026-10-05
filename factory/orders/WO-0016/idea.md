# Margin

`margin-widget`

## What it shows

Review Claude's reply the way you review a pull request. Select a passage in the transcript with the mouse, press Mark, type a few words against it, and repeat. The card lists the marked passages, each cut to one line with your remark under it. Send puts every passage in the prompt box as a quote followed by your remark, for you to read and submit.

- At rest: "Select text in the transcript, then press Mark".
- At its best: four marked passages with remarks, and a Send button that turns them into one precise prompt.
- Outside fullscreen: the card says it needs `/tui fullscreen`, and nothing else.

## Why it is remarkable

Today the only way to answer the third paragraph of a long reply is to retype or paraphrase it, so people answer the whole reply vaguely and Claude guesses which part they meant. Margin makes a reply something you annotate.

Closest existing widgets, and what Margin adds:

- `aside-widget` asks one side question about the conversation; it takes no selection and sends nothing back as a prompt.
- `shelf-widget` collects code blocks from replies for the clipboard; it does not take the person's own selection or remarks.
- `anchor-widget` and `notes-widget` hold text the person types; neither is tied to a passage of the transcript.

No shipped or waiting widget reads the mouse selection, and none draws a text field on a card.

## The API it needs

All checked in the plugin-authoring types file (`types/claude-code.d.ts`).

- `$.ui.selection()` returns `UiSelection | undefined`: `{ text, requestId? }`. Its doc says a key or click takes the highlight down before a press runs, and the answer stays what was last selected until the person selects again, dismisses it, or their next prompt or command has run. That is the Mark button flow.
- `Input` element (`InputProps`: `key`, `placeholder`, `value`, `submitLabel`, `onInput`, `onSubmit`), raised as `ui.input`. Present on the terminal and desktop tables, absent on mobile.
- `Button` `onPress` for Mark, drop and Send.
- `$.prompt.fill({ text, mode })` to place the composed prompt in the box. The type doc's own example is a quoted passage.
- `$.ui.scroll` with the stored `requestId` to jump back to a marked row.
- `$.state` for the marks; `prompt.submit` to clear them once sent.
- `command.run` for `on`, `off`, `clear`, `drop <number>`, `send`.

## Cost

No model calls. Nothing is added to context until the person sends, and what is sent is the quoted passages and remarks, shown in the prompt box first. No timer. Attention only when the person chooses to mark something.

## Risks the designer must settle

1. Fullscreen only. `$.ui.selection()` answers `undefined` with fullscreen off, so the widget does nothing useful there. The empty state must say so plainly. Drop the inventor's `/margin-widget mark <remark>` keyboard verb unless it is shown to work: a selection needs the mouse, and the doc says the answer is gone once the person's next command has run, so confirm whether a command can still read it before promising one.
2. Focus for the Input on a card. Cards are drawn under the prompt or docked beside the transcript; the field takes the keyboard only on a click or the focus chord. Settle how the person gets from Mark to typing the remark (draw the field with `autoFocus` only after Mark is pressed) and how focus returns to the prompt box after Enter.
3. Send fills, it does not submit. Use `$.prompt.fill`, never `$.prompt.submit`, so the person sees the prompt first. Decide `replace` or `append` when the box already holds a draft; do not destroy a draft. `isFilled: false` under a dialog must leave the marks in place and say so.
4. Fit on a card. Cap the list (four or five marks shown, a count for the rest) and cut each passage to one line on the card while sending the full text. Cap the length of a single passage that is sent, and say when one was cut.
5. Selections that are not Claude's reply. `requestId` is absent when the selection spans rows or lies outside the transcript. Decide whether to accept those (quote without a jump link) or refuse with a reason. Selecting text on the card itself must not be marked.
6. A mark with no remark. Allow it as a bare quote, or require a remark; choose one and state it.
7. Surfaces. `Input` is missing on mobile and selection is terminal fullscreen; resolve elements with `$.ui.resolve(e)` and give other surfaces a one-line card.
8. The demo page engine in `docs/engine.js` has no selection or Input; it needs a stand-in or the widget shows only its empty state there.
