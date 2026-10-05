# Pen

`pen-widget`

## What it shows

The file or command Claude is writing right now, drawn as the tool call's arguments stream in, before the tool runs.

While a `Write`, `Edit`, `MultiEdit`, `NotebookEdit` or `Bash` call is forming, the card shows the tool, the path (or "command"), a running line count, and the last few lines as they arrive, the newest at the bottom. For an `Edit` it shows the replacement text; for `Bash`, the command.

At rest the card says it shows a file while Claude is still writing it. When the call is complete the tail stays, dimmed, with the final line count, until the next call starts streaming or the turn ends. That way a short call that streamed in under a second still leaves something to read.

## Why it is remarkable

A long `Write` streams for half a minute behind a spinner. The content exists the whole time, piece by piece, and nothing shows it: the transcript shows the call only once it is whole, and by then, with edits auto-accepted, it has run.

The best moment: Claude is 140 lines into a 400-line file, the card's tail shows it hard-coding the thing you asked it to read from config, and you press Esc twenty seconds before the tool would have written anything.

Closest widgets and what this adds:

- `diff-widget` shows the last edit as a diff. It learns of an edit at `tool.call`, after the arguments are complete and the write is happening.
- `activity-widget` lists tool calls with duration and failure. Same moment: the call already exists.
- `stream-widget` is the only widget on `turn.step`. It counts the length of text and thinking chunks for a rate and never reads a chunk's content, nor any `tool` or `input` chunk.

Pen is the first widget to read a tool call before it is a tool call. It moves the person's chance to object from after the write to during the writing.

## API it needs

All present in the types file (`plugin-authoring/types/claude-code.d.ts`).

- `on('turn.step', async function* ($, e, next) { ... })`: a stream hook (`StreamHook`, `StreamingEventName`). It must yield every chunk on unchanged (`for await (const c of next(e)) { ...; yield c }`) and return the result of `next(e)`.
- `TurnStepToolChunk` (`kind: 'tool'`, `index`, `id`, `name`): the call begins; the name decides whether Pen follows it.
- `TurnStepInputChunk` (`kind: 'input'`, `index`, `json`): "the next piece of the arguments' JSON text", partial, for the `tool` chunk of the same `index`.
- `TurnStepStopChunk` (`kind: 'stop'`): the response is whole.
- `TurnStepInput.agentId`: present on a subagent's steps, absent on main.
- `$.state` for the live tail; `$.ui.invalidate('ui.render')` to redraw, documented at ten a second at most (thirty in the terminal for a shown pane), sooner calls folding.
- `on('tool.call')` and `on('turn.complete')` / `turn.abort` to settle or clear the tail.
- `$.widgets.card` for the card.

No model call, no `$.process`, no store.

## Cost

No tokens and nothing added to the prompt. The stream passes through untouched. The card redraws several times a second while a followed tool call streams and is still otherwise. The attention cost is the point: it invites watching during a long write.

## Risks the designer must settle

1. **The hook must never harm the stream.** Every chunk is yielded on as received, in order, including `engine` chunks; Pen's own parsing sits in a try/catch so a parser fault cannot drop a chunk. A dropped `tool` chunk is "no tool call" by the type's own words. Tests must prove pass-through byte for byte.
2. **Partial JSON.** The arguments arrive as arbitrary slices of JSON text: a slice can end inside a string, inside a `\uXXXX` escape or between a backslash and its letter. The reader has to be an incremental one that pulls the named string fields (`file_path`, `content`, `new_string`, `command`, `new_source`, and `edits[].new_string`) as far as they have arrived, holds back an incomplete escape, and never throws. Key order is not guaranteed: `content` may arrive before `file_path`, so the path line must cope with "not known yet".
3. **Chunk granularity is not promised.** The types say the pieces are partial, not how small. If the engine delivers a tool's arguments in a few large pieces, the card jumps instead of flowing. The builder must check this in a real session before the design leans on "line by line"; the settled, dimmed tail is the fallback that keeps the card worth having either way.
4. **Memory and width.** A 400-line file must not be held whole in `$.state`: keep the line count, the byte count and a ring of the last few lines only. Lines are cut to the card's width (40 columns by default); decide whether to cut at the right or show the line's end.
5. **Parallel calls and subagents.** One response can carry several tool blocks at different `index` values; decide which the card follows (the one that last grew is the obvious answer). Subagent steps carry `agentId`: either ignore them or label the tail with the agent, but do not interleave two writers in one tail.
6. **Secrets on screen.** The tail shows content before any other widget has seen it, `redact-widget` included (that one works on tool results, not on arguments). Decide whether Pen masks obvious key shapes or says plainly that it shows what Claude writes as written.
7. **Retries.** A step that is retried streams its blocks again; the tail must reset on a new `tool` chunk for the same index, not append.
8. **The demo page.** `docs/engine.js` runs a scripted turn; it needs to emit `tool` and `input` chunks on `turn.step` for Pen to show anything there. Check what the stand-in already emits for `stream-widget` and say what must be added.
