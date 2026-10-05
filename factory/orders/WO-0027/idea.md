# Landmarks

`landmarks-widget`, command `/landmarks-widget [on|off|go <n>|clear]`

## What it shows

A table of contents for the session, built as it happens, where choosing a line scrolls the transcript to that exact row.

A landmark is a first or a turning point, never routine traffic:

- each prompt you sent (its first words)
- the first check that went red, and the check that went green again
- each file's first edit
- each commit
- each question Claude asked you

At rest: a short numbered list, newest last, each line with its turn number, such as `3  t2  first edit: auth.ts`, `5  t4  first red: auth.test.ts`. With nothing yet: `No landmarks yet: they appear as the session goes on`.

At its best: forty turns in, you press `first red: auth.test.ts` (or type `/landmarks-widget go 5`) and the transcript jumps to that tool row.

## Why it is remarkable

Every shipped widget shows something beside the transcript. None of them moves it. The thing that wears a person down in a long session is scrolling back to find "where the test first went red" or "the part where it asked me about the schema"; this turns the card into navigation.

Closest existing widgets and what this adds:

- `timeline-widget` draws bars for one turn; `changes-widget` lists edited files; `owed-widget` (waiting) lists Claude's questions. Each is a list to read. None is a jump list and none spans the kinds of event.
- `margin-widget` and `loupe-widget` read a mouse selection in the transcript; they do not move it.
- No shipped widget calls `$.ui.scroll` (checked: no match under `plugins/*/hooks`).

## API it needs

All checked in the types file (`plugin-authoring/types/claude-code.d.ts`, 2.1.289):

- `$.ui.scroll({ to: { requestId }, block: 'start' })`: `UiScrollTarget` accepts `{ requestId }` naming "a transcript message's, a tool row's tool_use_id". It returns `{}` or `{ deny }`.
- The scroll moves a transcript row "only while this call answers the person's own input", so the jump must be made inside a `Button` `onPress` (`ui.press`) or inside `command.run` for `/landmarks-widget go <n>`. Never from a timer or a turn event.
- `tool.call` (`tool_use_id`, tool name, file path, failure after `next(e)`): the `ToolUse` row's `requestId` is documented as the same value as `tool_use_id`, so tool rows are certain targets.
- `turn.start` (prompt text, `turnId`), `turn.complete`, `session.append` (the stored row's uuid).
- `$.state` for the list; `$.widgets.card`.

## Cost

No tokens, no model call, nothing added to the context. One short list on the card. Attention only when the person is looking for something.

## Risks the designer must settle

1. Message rows. Tool rows are certain targets. Whether a prompt's or a reply's row has a `requestId` the widget can learn (from `session.append`'s uuid, or from `ui.message`) is not stated in the types. Settle it by reading the types and a shipped widget's render input, not by a live session in the user's repository. If it cannot be learned, a prompt anchors to the first tool row of its turn and the card says `near` for that line; a turn with no tool call gets no jump.
2. Where it does not scroll. The scroll is denied where no transcript scrolls. In the default layout the card must say so in one line (`Jumping needs /tui fullscreen`) and show any `{ deny }` reason plainly rather than fail in silence. Presses need the mouse, which fullscreen reports; `/landmarks-widget go <n>` is the keyboard route.
3. It must fit a card. Cap the list (about eight lines); when there are more, keep the firsts and turning points and fold runs of plain prompts into `... 6 more prompts`. `go <n>` must still reach folded ones, so numbers are stable for the session.
4. What counts as a check and as red: reuse the rule `checks-widget` uses, so the two never disagree.
5. Rows that are gone. After a compaction or `/clear` an old row may no longer be drawn; a denied jump marks that landmark dim and says why.
6. Resumed sessions. Say whether landmarks are rebuilt from `$.session.messages()` on resume or start empty; do not promise the first without checking the ids survive.
7. No way back. The API scrolls a transcript row into view but offers the widget no "return to the bottom"; the card should not pretend to have one.
