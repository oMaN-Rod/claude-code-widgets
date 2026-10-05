# Margin (`margin-widget`)
## Purpose
For anyone answering a long reply who means one paragraph of it, not all of it. In a fullscreen terminal they select a passage of the transcript with the mouse, press Mark, type a few words against it, and repeat; Send puts every passage in the prompt box as a quote with the remark under it, for them to read and submit. Nothing reaches Claude until they submit. Cut from the idea: the jump back to a marked row (`$.ui.scroll`); a drop button per row (the verb `drop <n>` stays); selections that span rows or lie outside the transcript (refused, see Terms); `$.prompt.fill` in `replace` mode.
## Terms
- The selection: `await $.ui.selection()`, read once per Mark. It is refused, in this order, with these sentences: the call rejects, answers `undefined` or a `text` that is blank after trimming, `Nothing selected.`; no `requestId` (several rows, the prompt, a pane, this card), `Select inside one reply.`; its passage equals a held mark's passage, `Already marked.` (the answer stays what was last selected, so a second press would repeat it); 9 marks held, `Margin is full: send or drop.`
- A passage: the selection's `text` with `\r` removed, trimmed; when longer than 600 characters, its first 600 and `…`, and the mark is `cut`. A remark: runs of white space made one space, trimmed, first 200 characters; may be empty (a bare quote).
- Marking, the same from the button and the verb: appends `{ passage, remark }`, sets `asking` to the new mark's number when the remark is empty and to 0 otherwise, sets `isSent` false and `said` to `''`. Marks are numbered from 1 by position.
- The sent text: one block per mark, blocks joined by a blank line, the whole ending in `\n`. A block is every line of the passage prefixed `> `, then, when the remark is not empty, the remark on the next line.
- Sending: no marks, `No marks to send.` Otherwise `await $.prompt.read()`; then `await $.prompt.fill({ text, mode: 'append' })`, where `text` is the sent text, preceded by `\n\n` when the draft read is not blank (a rejected read counts as blank). `isFilled: true` sets `isSent` true and `said` `''`. `isFilled` not true with `refusal: 'dialog'` is `A dialog is open. Marks kept.`; any other result, or a rejection, is `The prompt box took nothing. Marks kept.` Marks are never changed by sending.
- `said`: the sentence of the last refusal of a button press (Mark or Send); `''` after any mark, drop, send or clear that worked. A verb answers its sentence and leaves `said` alone.
- Fullscreen: a drawing is fullscreen when `e.viewport?.isFullscreen === true`; a command when `e.presentation.isFullscreen === true`.
## Card
Inner width is the card width less 4; long means inner width 36 or more. Title `Margin`. Note: none with no marks; `sent` when `isSent`; otherwise `plural(n, 'mark')` when long and `n` when not. Sentences are wrapped by words to the inner width by the widget; every row is `wrap="truncate-end"`. A mark is a dim number and a space, then its passage with runs of white space made one space, cut to the inner width less 2 with `…`; under it, indented two spaces, its remark on one row, absent for a bare quote. The last 4 marks are drawn; with more, a dim first row `<n> earlier`. Elements: `Button` key `mark`, label `Mark`, `variant="primary"`; `Button` key `send`, label `Send`, drawn only with marks; `Input` key `remark`, `placeholder` `remark on <asking>`, `submitLabel` `save`, `autoFocus`, `value` `''`, drawn only while `asking` is not 0.
```
Empty: on, terminal, fullscreen, no marks. Sentence dim.
│ Margin                               │
│ Select text in a reply with the      │
│ mouse, then press Mark.              │
│ [ Mark ]                             │
Working: a mark waits for its remark.
│ Margin                       2 marks │
│ 1 The loop in src/sum.js started at… │
│   is this the only loop?             │
│ 2 It starts at 0 now and the tests…  │
│ remark on 2                          │
│ [ Mark ]  Send                       │
Best moment: four marks, three with remarks.
│ Margin                       4 marks │
│ 1 The loop in src/sum.js started at… │
│   is this the only loop?             │
│ 2 It starts at 0 now and the tests…  │
│   which tests?                       │
│ 3 the first item was never added     │
│ 4 npm test                           │
│   run it with coverage               │
│ [ Mark ]  Send                       │
After Send: note `sent`, a dim sentence before the buttons.
│ Margin                          sent │
│ 1 The loop in src/sum.js started at… │
│   is this the only loop?             │
│ In the prompt box. Cleared when you  │
│ submit.                              │
│ [ Mark ]  Send                       │
Error: `said` in yellow before the buttons.
│ Margin                               │
│ Select text in a reply with the      │
│ mouse, then press Mark.              │
│ Nothing selected.                    │
│ [ Mark ]                             │
Terminal, not fullscreen: this row only, dim, no note, no element.
│ Margin                               │
│ Margin needs fullscreen: /tui        │
│ fullscreen                           │
Any other surface: `Margin works in the terminal only.`, dim, no element.
Busiest at 20 columns: six marks, the last waiting.
│ Margin         6 │
│ 2 earlier        │
│ 3 The loop in s… │
│   why only here? │
│ 4 It starts at … │
│ 5 the tests pass │
│   which tests?   │
│ 6 never added    │
│ remark on 6      │
│ [ Mark ]  Send   │
```
Pressing Mark runs marking; a refusal sets `said`. When it marked with `asking` set and the press's `component` is `Pane` or `AbovePrompt`, it then calls `$.ui.focus({ requestId: press.requestId, key: 'remark' })` and ignores a `deny` or a rejection (the person clicks the field instead; `PromptHint` keeps no focus ring). `onSubmit` of the field stores the remark on mark `asking` and sets `asking` to 0, so the field is no longer drawn; an empty submit leaves a bare quote. No `onInput`. Esc returns the keys to the prompt, by the engine. Pressing Send runs sending; a refusal sets `said`.
## Commands
One command, `argumentHint` `[on|off|mark [remark]|drop <n>|send|clear]`. The verb is the first word, lower-cased; a remark keeps its case.
- `/margin-widget`, `on`, `off`: the switch, with the template's answers (`Margin on; /widgets places it.`, `Margin off.`). Anything unknown, `drop` without a whole number, or words after `send` or `clear`: `Usage: /margin-widget [on|off|mark [remark]|drop <n>|send|clear]`, nothing changed.
- `mark [remark]`: the keyboard way to mark (the types say a command still reads the last selection). Not fullscreen: `Margin needs fullscreen: /tui fullscreen`, no selection read. A refusal answers its sentence. Otherwise `Marked <n>.`, or `Marked <n>, cut to 600 characters.`
- `drop <n>`: removes mark `n`, sets `asking` to 0 and `isSent` false; answers `Dropped <n>.`, or `No mark <n>.`
- `send`: answers `In the prompt box: <plural(n, 'mark')>. Read it, then submit.`, or the refusal's sentence.
- `clear`: empties marks, `asking`, `isSent` and `said`; answers `Margin cleared.`
- While off, `mark`, `drop`, `send` and `clear` answer `Margin is off.` and do nothing else. No second command and no tool.
## Data
All verified in this build's types (`plugin-authoring/types/claude-code.d.ts`; `plugins/*/.claude-plugin/types/` is absent from this checkout).
- `on('session.start')`: the template's work only: `$.command.register`, `$.store.get('isOn')`.
- `on('command.run', { command: 'margin-widget' })`: reads `e.args` and `e.presentation.isFullscreen`.
- `$.ui.selection: () => Promise<UiSelection | undefined>`, `UiSelection = { text: string; requestId?: string }`: once per Mark press or `mark` verb. `undefined` with fullscreen off, under `-p`, or on a surface that answers none.
- `Input` (`InputProps`: `key`, `placeholder`, `value`, `submitLabel`, `autoFocus`, `onSubmit: (value, e: UiInputArgument) => void`); `Button` (`ButtonProps`: `key`, `label`, `variant`, `onPress`, whose argument is `UiPressArgument` with `component` and `requestId`). Both are in the `terminal` table of `Elements`, the only surface they are drawn on.
- `$.ui.focus(args: UiFocusArgs) => Promise<UiFocusResult>`, `{ requestId, key }`: at most once per Mark press.
- `$.prompt.read: () => Promise<PromptBox>` (reads `text`) and `$.prompt.fill(input: PromptFillArgs) => Promise<PromptFilled>` (reads `isFilled`, `refusal`): once each per send.
- `on('prompt.submit')`: once per prompt. While on, `isSent` and `e.origin.kind` one of `composer`, `bridge`, `sdk`: empties marks, `asking`, `isSent` and `said`. Always returns `next(e)` with `e` unchanged.
- The three `on('ui.render')` hooks (reading `e.surface`, `e.viewport?.isFullscreen`) and `$.widgets.card`: from the template. No timer, no file, no model call.
## State and storage
- `$.state` `isOn: boolean`; `marks: { passage: string; remark: string; isCut: boolean }[]` (at most 9); `asking: number` (0, or the number of the mark whose remark field is drawn); `isSent: boolean`; `said: string`.
- `$.store` `isOn`, and nothing else. Marks last for the session only. No file. No module-level `let`.
## Off
No card, so no button and no field; the verbs answer `Margin is off.` and read neither the selection nor the prompt box; `prompt.submit` returns `next(e)` at once. Switching off empties marks, `asking`, `isSent` and `said`. Nothing is written to the store but `isOn`.
## Demo
Opening lines `mark is this the only loop?`, then `send`. Stand-ins the engine lacks: `ui.selection` answering `{ text: 'The loop in src/sum.js started at index 1, so the first item was never added.', requestId: 'answer-1' }`; `prompt.fill` answering `{ isFilled: true, text: '', cursor: 0 }` (it answers `{}` now, which the widget must read as not filled); `ui.focus` answering `{}`; `isFullscreen: true` on the command's `presentation` and the drawing's `viewport` if they do not carry it; and `view.js` drawing an `Input` as its placeholder (its `onSubmit` need not run). At rest: the After Send card with one mark and its remark. After the scripted turn, whose prompt submit clears the marks: the empty card.
## Live
`bun factory/tools/live.ts factory/floor/plugins/margin-widget --say "/margin-widget on" --say "/margin-widget mark why here" --say "/margin-widget send" --say "/margin-widget drop 1" --say "/margin-widget clear" --say "/margin-widget off"`
No prompt is sent, so no model turn runs. A headless session has no fullscreen, no selection and no prompt box, so a good run shows the refusals, not a mark: `Margin on; /widgets places it.`, `Margin needs fullscreen: /tui fullscreen`, `No marks to send.`, `No mark 1.`, `Margin cleared.`, `Margin off.`, and the store printing `isOn` false and no other key. The mouse path (select, Mark, type, Enter, Send) cannot be driven by `live.ts`; it is proven by the tests' `ui.press` and `ui.input`, and wants one hand check in a fullscreen terminal of: whether the field takes the keys after Mark; whether `mark` typed as a command still sees the selection; that Mark in the `side` and `above` placements moves the keys to the `remark` field (`$.ui.focus` with the press's `requestId` and key `remark`), that in `below` the card is right without that call, and that a `deny` leaves the card as it was; and that Send while a dialog is open shows `A dialog is open. Marks kept.` with the marks kept. No test proves those last two: the test kit has no `ui.focus` and strips a fill's `refusal`.
## Cost
None: no model call and no context added. What is sent is the person's own prompt, shown in the box first.
## Acceptance
How the tests prove these: `ui.selection`, `prompt.read` and `prompt.fill` are given through `ground()`'s `answers` or bottom hooks, each recording its calls; `ui.focus` is left as the test kit has it, rejecting with `no implementation for ui.focus`, and a fill's `refusal` never reaches the widget there, so the focus call and the dialog sentence are hand checks under Live; presses and typing go through the test engine's `ui.press` and `ui.input`; fullscreen is set on `target()`'s `viewport` and `run()`'s `presentation`.
- A1: on with no marks in a fullscreen terminal, the card shows the two-row sentence and the `mark` button, no note, no `send` button and no `remark` field; `session.start` (switch restored or not) and switching on call none of `ui.selection`, `prompt.read`, `prompt.fill`.
- A2: pressing `mark` with the selection `{ text, requestId }` reads the selection once, adds the mark, shows the note `1 mark`, the passage row, the `send` button and the `remark` field with placeholder `remark on 1` and `autoFocus`; the card is that same card in the `side`, `above` and `below` placements, the test kit's rejecting `ui.focus` changing nothing and raising nothing.
- A3: submitting `  why   only here? ` into `remark` stores `why only here?` under the passage and removes the field; a 300-character remark is kept to 200; an empty submit leaves a bare quote with no second row and removes the field; a `change` typing stores nothing.
- A4: `mark Is this the ONLY loop?` adds the mark with that remark, case kept, answers `Marked 1.` and draws no field; `mark` alone answers `Marked 2.` and draws the field for 2; `MARK` works as `mark`; the selection is read once per verb.
- A5: each refusal changes no mark, answers its sentence from the verb and shows it on the card after a press: selection `undefined`, `{ text: '  \n' }`, a rejecting `ui.selection` (`Nothing selected.`); no `requestId` (`Select inside one reply.`); the same passage twice (`Already marked.`); a tenth mark (`Margin is full: send or drop.`). The row is gone after the next mark that works, and a verb's refusal puts no row on the card.
- A6: a selection of 700 characters is held as its first 600 and `…`, answered `Marked 1, cut to 600 characters.`; one of exactly 600 is held whole; `\r\n` line ends lose the `\r`; a passage of three lines with tabs is one row on the card with single spaces.
- A7: `send` with an empty draft, two marks (one of two lines with a remark, one bare) calls `prompt.fill` once with `mode: 'append'` and exactly `> line one\n> line two\nthe remark\n\n> bare passage\n`; with the draft `fix it` the text is that preceded by `\n\n`; a rejecting `prompt.read` sends as for an empty draft; the answer is `In the prompt box: 2 marks. Read it, then submit.`, the note `sent`, the dim sentence shown, both marks still drawn. The `send` button does the same.
- A8: `send` with no marks answers `No marks to send.` and calls neither `prompt.read` nor `prompt.fill`; a fill answering `{ isFilled: false }` or `{}`, and a rejecting fill, give `The prompt box took nothing. Marks kept.`; in each the marks stay, the note is not `sent`, and the button shows the sentence on the card.
- A9: after a send that filled, a `composer` prompt empties the card and passes its text and context exactly as given; `bridge` and `sdk` do the same; a `task-notification` prompt leaves the marks and `sent`; a prompt with marks never sent leaves them; a mark or a `drop` after the send removes `sent`, and the next prompt then leaves the marks.
- A10: `drop 2` of three answers `Dropped 2.`, the third becomes 2 and an open field goes; `drop 7` and `drop 0` answer `No mark 7.` and `No mark 0.`; `clear` answers `Margin cleared.` and leaves the empty card, with no `said` row and no note.
- A11: in a terminal with `viewport.isFullscreen` false or no `viewport`, the card is only the fullscreen sentence, with no button and no field, even with marks held; on `desktop`, `vscode` and `mobile` it is only `Margin works in the terminal only.`; `mark` with `presentation.isFullscreen` false answers the fullscreen sentence and does not read the selection; the marks reappear when fullscreen returns.
- A12: while off, `mark`, `drop 1`, `send` and `clear` answer `Margin is off.` with no engine call and no store write; a prompt passes untouched; switching off with marks sent and on again gives the empty card, and the next prompt changes nothing; after marks, remarks, a send and `clear` the store holds no key but `isOn`.
- A13: `drop`, `drop x`, `send now`, `clear all`, `jump 1` and `remark hi` each answer the usage line and change neither the switch, the card nor the store; `session.start` registers one command, `margin-widget`.
- A14: at 20, 40 and 60 columns, with six marks of 600-character passages (one a single word with no space) and 200-character remarks, a waiting field and a `said` row: no row is longer than the inner width, each passage and each remark takes one row, the last four marks are drawn under `2 earlier` with their numbers 3 to 6, and the note is `6` at 20 columns and `6 marks` at 40 and 60, on the title's row.
- A15: the card with marks is the same in the `side`, `above` and `below` placements and absent from the two placements the layout's `site` does not name.
## widget.json
- title: `Margin`
- category: `Session`
- shows: `Mark passages of Claude's reply with the mouse, write a remark against each, and send them back as one quoted prompt`
- commands: `/margin-widget [on|off|mark [remark]|drop <n>|send|clear]`
- cost: empty
