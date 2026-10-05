# Pen (`pen-widget`)
## Purpose
For anyone who lets Claude write files with edits auto-accepted and waits behind a spinner while a long `Write` streams. The content exists the whole time, piece by piece, and nothing shows it: the transcript shows a call once it is whole, and by then it has run. Pen draws the tail of the file, edit or command Claude is writing while the tool call's arguments are still arriving, so the person can press Esc before the tool runs. No model, no tokens, nothing stored. Kept from the idea: the live tail, the line count, the settled dimmed tail, all the named tools this build has. Cut: `MultiEdit` (not in this build's tools; it alone needs nested fields), subagents' writes (their steps are passed through unread, so two writers never share one tail), masking of secrets (Pen shows only what the transcript shows a moment later, keeps it in session memory alone, and `show` never repeats content), and clearing at turn end (an Esc ends the turn, and the stopped tail is what the person then wants to read; the tail stays until the next followed call).
## Terms
- Followed tools, each with a path field and a text field, all top-level strings of the arguments: `Write` (`file_path`, `content`), `Edit` (`file_path`, `new_string`), `NotebookEdit` (`notebook_path`, `new_source`), `Bash` and `PowerShell` (no path, `command`). No other tool is followed.
- The reader: one per followed call, held in the step generator's own locals. It is fed each `json` piece in order and walks the JSON text character by character, tracking depth, whether it is inside a string, whether that string is a key or a value, and the key of the value at depth 1. It hands on the decoded characters of the path field and the text field as far as they have arrived. Escapes `\" \\ \/ \b \f \n \r \t \uXXXX` are decoded; a surrogate pair is handed on whole. A piece that ends after a backslash, inside `\uXXXX` or between the two halves of a pair holds those characters back until the next piece. Strings at depth 2 or more, other keys, numbers and literals are skipped. An unknown escape hands on its letter. It never throws on any text; the call is closed when depth returns to 0.
- Text accounting, per call: `chars` is the decoded characters of the text field; `lines` is the newlines seen plus one when the line being written has a character (so `a\nb\n` is 2); `pieces` is the `input` chunks fed. `\r` and other control characters are dropped, a tab is kept as two spaces. The tail is the last 5 lines that hold a non-space character, the line being written among them, each kept to its first 120 characters. Nothing else of the text is held anywhere.
- Phases: `writing` (not closed), `written` (closed), `stopped` (ended unclosed).
- Following a step (`e.agentId` absent, widget on at the step's start), for each chunk from beneath, in a `try`/`catch` whose catch stops Pen reading for the rest of the step, and then, whatever happened, `yield` of the very object received:
  - `tool` with a followed name: an unclosed call held is set `stopped`; then a fresh call replaces it (`writing`, 0 lines, empty path and tail) and its `index` is the one read. This also resets a retried block: never append.
  - `tool` with another name, `text` or `thinking`: an unclosed call held is set `stopped`. A `written` call is left as it is.
  - `input` with the read index while `writing`: fed to the reader. Any other `input`, `stop` and `engine`: not read.
  - When the stream ends in any way (done, a throw from beneath, the consumer returning early), in `finally`: an unclosed call is set `stopped`.
- Publishing: the call is copied to `$.state` when it starts, when it closes, when it stops, and after a fed piece when `$.clock.now()` is 100 ms or more past the last copy. Before each copy the switch is read; once it reads off, nothing more is copied in that step. A call another step has replaced is never overwritten.
- Inner width: the card's width less 4. `cut(text, room)` ends in `…`; `cutStart(text, room)` begins with `…`.
## Card
Title `Pen`. Note: `plural(lines, 'line')` when a call is held, none otherwise. Head row: for a file tool `<Tool> <path>` at 30 columns or more and the path alone under 30, the path cut from its start; the tool name alone while the path has not arrived and for `Bash` and `PowerShell`. Then the tail, the leading spaces common to its rows removed, each row cut at the right. While `writing` the last row is cut to one less and ends in the cursor `▌` (a call with no text yet draws the cursor alone). `written` and `stopped` draw head and tail with `dimColor` and no cursor; `stopped` adds a yellow last row `Stopped before it ran.`
```
Empty: on, no followed call yet.
│ Pen                                  │
│ Nothing written yet. A file, edit or │
│ command shows here line by line      │
│ while Claude is still writing it,    │
│ before it runs.                      │
Working: the call has begun, no path or text yet.
│ Pen                          0 lines │
│ Write                                │
│ ▌                                    │
Best moment: 142 lines in, twenty seconds before the tool would run.
│ Pen                        142 lines │
│ Write /work/app/src/config.ts        │
│ export const config = {              │
│   port: 3000,                        │
│   retries: 3,                        │
│   timeoutMs: 5000,                   │
│   apiUrl: 'http://localhost:8080▌    │
Settled: the call is whole (all dim).
│ Pen                        212 lines │
│ Write /work/app/src/config.ts        │
│   return merged                      │
│ }                                    │
│ export const load = () => config     │
│ export default config                │
Error: Esc, a retry or a failed request cut the call short (dim, last row yellow).
│ Pen                        142 lines │
│ Write /work/app/src/config.ts        │
│ export const config = {              │
│   port: 3000,                        │
│   retries: 3,                        │
│   timeoutMs: 5000,                   │
│   apiUrl: 'http://localhost:8080     │
│ Stopped before it ran.               │
Busiest at 20 columns:
│ Pen    142 lines │
│ …/src/config.ts  │
│ export const co… │
│   port: 3000,    │
│   retries: 3,    │
│   timeoutMs: 50… │
│   apiUrl: 'htt…▌ │
```
## Commands
`/pen-widget [on|off|show|clear]`, the verb matched without regard to case. Bare, `on`, `off` and the usage as in the template (`Pen on; /widgets places it.`, `Pen off.`). No second command, no tool.
- `show`: the card's facts as text, for a terminal with no card in view and for the Live run; never the content. `Nothing written yet.`, or `<Tool>[ <path>]: <n> lines, <n> characters in <n> pieces, <phase>.`, counts by `plural()`, the phase one of `writing`, `written`, `stopped before it ran`.
- `clear`: forgets the held call and answers `Pen cleared.` A call still streaming draws again at its next copy.
- While off, `show` and `clear` answer `Pen is off.` and change nothing.
## Data
Verified in this build's types (`plugin-authoring/types/claude-code.d.ts`, 2.1.289; `plugins/*/.claude-plugin/types/` is absent from this checkout).
- `on('turn.step', async function* ($, e, next) { ... })`: a `StreamHook` (`StreamingEventName = 'turn.step' | 'process.spawn'`). Off, or `e.agentId` present (`TurnStepInput.agentId`: "a subagent's id ... absent on main"): `return yield* next(e)`. Otherwise `for await (const chunk of next(e))` as in Terms, and the generator returns nothing: "Returning nothing lets its last `next(e)`'s result stand." Once per model request; every chunk is seen, only `tool` and `input` are read.
- Chunks read: `TurnStepToolChunk` (`kind: 'tool'`, `index`, `id`, `name`; "A block whose `tool` chunk never comes out of the chain is no tool call", hence the pass-through rule) and `TurnStepInputChunk` (`kind: 'input'`, `index`, `json`: "The next piece of the arguments' JSON text ... partial, for the `tool` chunk of the same `index`"). `TurnStepTextChunk` and `TurnStepThinkingChunk` are noticed by `kind` only. `TurnStepStopChunk` and `TurnStepEngineChunk` ("Pass it on where it came") are passed unread.
- Budget: `HookBudget.ms` is 10 000 for a streaming hook as "the sum over the response", counted "only while its own code runs, never at a `yield`" and stopped during any `$` call, so the reader must stay linear in the text: it never re-scans what it has read.
- `$.clock.now(): Promise<number>`, once per fed piece. `update($, atom, fn)` and `read($, atom)`; an atom write redraws the card, so `$.ui.invalidate` is not called. `$.store.get/set` for `isOn`, `$.command.register`, `on('command.run', { command: 'pen-widget' })`, `on('session.start')`, the three `on('ui.render')` hooks, `$.widgets.card`. Drawing reads state only.
- Not used: `tool.call`, `turn.start`, `turn.complete`, `$.turn.abort`, timers, `$.fs`, `$.process`, `$.model`.
## State and storage
- `$.state` `isOn: boolean`.
- `$.state` `pen: PenCall | null`, default `null`. `PenCall`: `{ id: string; tool: string; path: string; phase: 'writing' | 'written' | 'stopped'; lines: number; chars: number; pieces: number; tail: string[] }`; `id` is the `tool` chunk's `id`, `path` is kept to its last 200 characters, `tail` holds at most 5 strings of at most 120 characters.
- `$.store` `isOn` alone. No file. No module-level `let`: the reader and the last-copy time live in the generator.
## Off
No card and no copy to state; `turn.step` hands the stream beneath straight on with `yield*`. Switching off sets `pen` to `null`; a step already streaming copies nothing more and still yields every chunk. There is no timer to stop.
## Demo
`docs/engine.js` dispatches no `turn.step` at all, so today the card can only rest. Stand-in needed: before the `tool.check` of each scripted `Write`, `Edit`, `Bash` call, dispatch `turn.step` as a stream that yields `{ kind: 'tool', index: 0, id, name }`, then `JSON.stringify(call.input)` in pieces of about 12 characters as `{ kind: 'input', index: 0, json }` with a short paced sleep between, then a `stop` chunk, and returns a `TurnStepResult`; the dispatcher must run generator hooks. No new scripted call is needed. At rest: the empty sentence. During the turn the tail follows each command and the edit of `src/sum.js` (`Edit /work/demo/src/sum.js` or the engine's own root, with the corrected `for` line). After the turn: `Bash`, note `1 line`, the row `git commit -am "Fix the off-by-one…`, all dim. Without the stand-in the card must show the empty sentence, not throw.
## Live
`bun factory/tools/live.ts factory/floor/plugins/pen-widget --say "/pen-widget on" --say "Use the Write tool exactly once to write pen-live.txt holding the numbers 1 to 40, one per line. If that is refused do not try another way. Then answer ok." --say "/pen-widget show" --say "/pen-widget off"`
One small turn. Write is not allowed, so the headless host refuses it and no file is made; Pen has read the call by then, which is the point of the widget. A good run: `show` answers `Write <path>pen-live.txt: 40 lines, <n> characters in <p> pieces, written.` and the store prints `isOn` false. The builder logs `p`: 2 or more means the arguments arrive in pieces and the tail flows; 1 means this engine hands them over whole and the card jumps to the settled tail, which must go in the log for the inspector. `Nothing written yet.` means the hook saw no `tool` chunk: log the chunk kinds seen.
## Cost
None: no tokens, no model call, nothing added to a prompt, nothing written to disk. While a followed call streams the card redraws at most ten times a second; otherwise it is still.
## Acceptance
Tests feed `turn.step` from a stand-in generator at the bottom that yields chunks shaped like the real ones, moves `ground()`'s clock between them, and records what `$.turn.step` yields and returns.
- A1: switched on with no call, the card shows the empty sentence and no note, in all three placements; `show` answers `Nothing written yet.`
- A2: every chunk beneath, `engine`, `stop` and an unfollowed tool's among them, comes out as the same object in the same order and the step's result is the one beneath returned, whether the widget is on, off, the step carries `agentId`, or the `input` pieces are not JSON at all; a step with `agentId` leaves the card unchanged.
- A3: a `Write` streamed in pieces draws, while unclosed, the head `Write <path>`, the note counting lines, the last 5 non-blank lines and the cursor on the last row; before any text arrives it draws the tool name, `0 lines` and the cursor alone.
- A4: the same arguments fed whole, one character at a time, and split after a backslash, inside `é`, and between the halves of a surrogate pair all give the same `pen` value, with `\n`, `\t`, `\"`, `\\` and `\u` escapes decoded.
- A5: `content` arriving before `file_path` shows the tool name until the path arrives and then the path; a nested object or array holding a `content` key, and a string value containing the text `"content":"x"`, are not read.
- A6: `Edit` shows `new_string` and never `old_string`; `NotebookEdit` shows `new_source` under `notebook_path`; `Bash` and `PowerShell` show `command` under the tool name; `Read` and an `mcp__` tool leave a held `written` call as it was.
- A7: once the arguments close, the tail is dim with no cursor and stays through later `text` chunks, the `stop`, the end of the step and a later step with no followed call; the next followed `tool` chunk replaces it with a fresh call at `0 lines`.
- A8: an unclosed call becomes `stopped`, dim with the yellow row `Stopped before it ran.`, when the stream beneath ends, throws (the throw reaches the caller), is ended early by the consumer, or yields a `text`, `thinking` or other `tool` chunk first.
- A9: a second `tool` chunk for the same index starts again at 0 lines instead of appending, and `input` chunks of another index are not read.
- A10: a 400-line `Write` of long lines leaves `pen` with `lines` 400, the exact `chars`, at most 5 tail strings of at most 120 characters and no blank ones; a trailing newline adds no line, a tab is two spaces, `\r` and control characters are dropped.
- A11: the first piece is drawn at once; pieces fed under 100 ms after the last copy do not change the card; the next piece at 100 ms or later does, and closing or stopping always does.
- A12: `show` answers the tool, path, lines, characters, pieces and phase in each of the three phases and never a tail line; `clear` empties the card and answers `Pen cleared.`; `what` answers the usage naming all four verbs.
- A13: at 20, 40 and 60 columns no row of any state is longer than the inner width; a long path is cut from its start and a long line at its right with `…`; under 30 columns the head is the path alone; indentation common to the shown rows is removed.
- A14: while off, `show` and `clear` answer `Pen is off.`; switching off mid-step sets `pen` to `null`, the step copies nothing afterwards and still yields every chunk; the store never holds a key but `isOn` and `$.clock.every` and `$.clock.after` are never called.
## widget.json
- title: `Pen`
- category: `Session`
- shows: `The file, edit or command Claude is writing right now, drawn line by line as the tool call's arguments stream in, before the tool runs`
- commands: `/pen-widget [on|off|show|clear]`
- cost: empty
