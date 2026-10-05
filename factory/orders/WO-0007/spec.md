# Notebook (`notebook-widget`)
## Purpose
For anyone who works in the same project over many sessions and watches Claude rediscover the same things each time. While on, Claude has a tool, `jot`, for writing one fact its future self should know about this project (where something lives, a constraint the code does not show, why an approach failed). The notes are kept per project, shown on the card, and read back to Claude with the first prompt of every later session there and again after a compaction. The person sees every note and can drop any of them.
## What is dropped from the earlier version, and what each fault becomes
- Dropped: the date on each note (a note is now a plain string); reading `CLAUDE.md` to hide notes it already holds; the tool name `note`, which is `/note` of notes-widget (the tool is now `jot`); wrapped rows on the card (rows truncate, `show` prints them in full); 12 notes of 240 characters (now 8 of 200).
- Fault "acts or writes while off": the earlier `session.start` read the notes, `CLAUDE.md` and the clock while off; `clear` and `drop` wrote the store while off; the tool wrote after a switch-off. Now nothing is read but `isOn` until the widget is on, every verb but the switch answers `Notebook is off.`, and the tool writes nothing while off.
- Fault "one long test": one test per acceptance line below.
## The tool (`jot`), and why there is one
The idea is Claude writing for itself; no hook can do that for it. `$.tool.register` has no opposite, so after a switch-off the tool stays listed until the session ends; its hook then answers an error and writes nothing. That answer is not a deny of another's call: a call to a plugin's tool that no hook answers fails anyway, and this says why.
- Registered by `open()` (below) as `$.tool.register({ name: 'jot', description, inputSchema })`; the model calls it as `mcp__notebook-widget__jot`.
- description: `Jot a note to your future self about this project. It is read back to you at the start of every later session here, and the user sees it. Use it when you work out something a new session would otherwise have to rediscover: where something lives, a constraint that is not obvious from the code, why an approach failed, how to verify a change. One fact per note, under 200 characters. Not for task status, to-do items, or anything CLAUDE.md already says.`
- inputSchema: `text` (string, required: `One fact about this project, written so a new session can act on it.`), `replace` (number: `The number of an existing note to overwrite, when it is out of date or the notebook is full.`).
- Served by `on('tool.call', { tool: 'mcp__notebook-widget__jot' })`, from any loop (`agentId` is not read). Every answer is `{ result: said, text: said }`, with `isError: true` where marked. In this order:
  1. Off: error `Notebook is off; nothing was written.`
  2. `text` cleaned: `String(e.text ?? '')`, every run of whitespace one space, trimmed, cut to 200 characters. Empty: error `A note needs text.`
  3. `replace` present and not a whole number from 1 to the count of notes: error `There is no note <replace>. The notebook holds:` and the list; with no notes, `There is no note <replace>. The notebook is empty.`
  4. No `replace` and a note with exactly this text exists: `Already in the notebook.`, not an error, nothing written.
  5. No `replace` and 8 notes: error `The notebook is full (8 notes). Pass replace with the number of the least useful one:` and the list.
  6. Otherwise the note is appended, or put at `replace`; the text joins `fresh`; `$.store.set(key, notes)`; answer `Noted (<count> of 8).`
- The list, here and everywhere: one line per note, `<n>. <text>`, numbered from 1 in stored order.
## Reading back
- `open($, cwd)`: `key = 'notes:' + folder(cwd)`. If `book.key` is not `key`, reads `$.store.get(key)` once and sets `book` to `{ key, notes, fresh: [], isDue: true }`, then registers the tool; otherwise only sets `isDue` true. Stored entries are read leniently: a string is a note, an object with a string `text` (the earlier version's shape) is read as its `text`, anything else is skipped; only the first 8 are kept. Called at `session.start` with `e.cwd` when the switch is restored on, and on every switch-on with `await $.session.cwd()`.
- `on('prompt.submit')`: off, or `e.origin.kind` not `composer`, `bridge` or `sdk`, or `isDue` false: `return next(e)`. Otherwise `isDue` becomes false and, when there are notes, the hook returns `next({ ...e, context: [...(e.context ?? []), block] })`; with no notes, `next(e)`.
- block: `notebook-widget: notes you left yourself in earlier sessions in this project. Each was true when written; check one against the code before you rely on it, and overwrite it with the jot tool's replace if it is out of date:` then a line break and the list.
- `on('session.compact')`: returns what `next(e)` resolved to, unchanged. When on, `e.agentId === undefined`, `e.trigger !== 'precompute'` and the result's `skip` is undefined, `isDue` becomes true.
- `drop` and `clear` set `isDue` true, so Claude's numbers for `replace` are never stale past the next prompt.
## Card
Inner width is the card width less 4. Long wording at an inner width of 36 or more, short below; no long line passes 36 characters and no short line 16, except note rows, which are one line each and truncate (`wrap="truncate-end"`). Title `Notebook`. A row is `<n> <text>`; the number is green and bold when the text is in `fresh`, dim otherwise. `new` is the count of notes whose text is in `fresh`. Note: `+<new>` when `new > 0`, else `full` at 8 notes, else `<count> kept`, none when empty. The hint line is dim and closes every card that has rows.
```
Empty: no notes. No note. The sentence wraps at any width.
│ Notebook                             │
│ Nothing noted yet.                   │
│ Claude jots here what the next       │
│ session should know of this project. │
Working: notes from earlier sessions, none new. Note `<count> kept`.
│ Notebook                      3 kept │
│ 1 Tests need Docker: run make up fi… │
│ 2 Prices are integer cents, never f… │
│ 3 src/legacy is generated; edit tem… │
│ /notebook-widget show: in full       │
Best moment: Claude jotted this session. Note `+<new>`.
│ Notebook                          +1 │
│ 1 Tests need Docker: run make up fi… │
│ 2 Prices are integer cents, never f… │
│ 3 src/legacy is generated; edit tem… │
│ 4 The sum loop must start at 0, not… │
│ /notebook-widget show: in full       │
Error: 8 notes, none new. Note `full`. Rows 1 to 8, then:
│ Notebook                        full │
│ 8 Deploys go through make ship only… │
│ Full: a new note replaces an old     │
│ /notebook-widget show: in full       │
Busiest at 20 columns: 8 notes, one new (rows 2 to 7 left out here).
│ Notebook      +1 │
│ 1 Tests need Do… │
│ 8 Deploys go th… │
│ full, replacing  │
│ show: in full    │
```
Long | short: `Full: a new note replaces an old` | `full, replacing` (shown whenever there are 8 notes); `/notebook-widget show: in full` | `show: in full`.
## Commands
`argumentHint` and usage: `[on|off|show|drop <number>|clear]`. One command; no second command.
- bare, `on`, `off`: the switch. On: `Notebook on; Claude can jot notes from the next prompt. /widgets places it.` Off: `Notebook off. The jot tool stays listed until the session ends and writes nothing.` Unknown input: `Usage: /notebook-widget [on|off|show|drop <number>|clear]`, nothing changed.
- `show`: what Claude will be read. `3 notes for this project:` (`plural()`) and the list, each note in full; with none, `The notebook is empty for this project.` Off: `Notebook is off.`
- `drop <number>`: removes that note, `$.store.set(key, notes)`, later notes move up one. Answers `Dropped note 2: <text>`. `<number>` missing, not digits, or no such note: `There is no note "<what was typed>". /notebook-widget show lists them.`, nothing changed. Off: `Notebook is off.`
- `clear`: this project's notes and `fresh` become empty, `$.store.set(key, [])`; answers `Notebook emptied for this project.` Other projects' notes are untouched. Off: `Notebook is off.`
## Data
- `on('session.start')`: `e.cwd`. Once per load.
- `on('command.run', { command: 'notebook-widget' })`: `e.args`.
- `on('tool.call', { tool: 'mcp__notebook-widget__jot' })`: `e.text`, `e.replace`. Once per call Claude makes.
- `on('prompt.submit')`: `e.origin.kind`, `e.context`. Once per prompt; attaches at most one block, only when due.
- `on('session.compact')`: `e.agentId`, `e.trigger`, and `skip` of the result. Once per compaction.
- `$.tool.register`, `$.session.cwd()` (at a switch-on), `$.store.get`, `$.store.set`, `$.command.register`, `$.widgets.card`, the three `on('ui.render')` hooks, `folder()`, `fit()`, `plural()`.
- No `$.clock`, no `$.fs`, no timer (no `sync`), no model call.
## State and storage
- `$.state` `isOn: boolean`.
- `$.state` `book: { key: string; notes: string[]; fresh: string[]; isDue: boolean }`. Blank: `key` `''`, no notes, `isDue` false. `fresh` holds the texts jotted this session.
- `$.store` `isOn: boolean`.
- `$.store` `notes:<folder(cwd)>`: `string[]`, at most 8, each at most 200 characters. Read once per session by `open()`, written by the tool, `drop` and `clear`.
- No files.
## Off
No card. `session.start` registers the command, reads `isOn` and nothing else: no notes read, no tool registered. The `prompt.submit` and `session.compact` hooks return `next(e)` and touch nothing. The tool, if an earlier switch-on registered it, answers its error and writes nothing. `show`, `drop` and `clear` answer `Notebook is off.` Switching off writes only `isOn`; `book` is kept in `$.state` so a switch-on in the same session does not read the store again.
## Demo
The engine's scripted turn calls no plugin tool. Stand-in needed: one scripted call after the last `npm test`, `{ tool: 'mcp__notebook-widget__jot', input: { text: 'sum() skipped the first item: its loop began at 1. Loops over list start at 0.' } }`, dispatched through `tool.call` like the others (the widget's hook answers it; no bottom is reached). At rest: the empty card. After the scripted turn: note `+1`, the row `1 sum() skipped the first item: its…` with a green number, and the hint line.
## Live
`bun factory/tools/live.ts factory/floor/plugins/notebook-widget --say "/notebook-widget on" --say "Call your jot tool once with the text: Tests run with bun test." --say "/notebook-widget show" --allow "mcp__notebook-widget__jot"`
A good run shows a tool call `mcp__notebook-widget__jot` whose result is `Noted (1 of 8).` (on a rerun `Already in the notebook.`, since the scratch project keeps its notes), `show` answering `1 note for this project:` and `1. Tests run with bun test.`, and the store printed with `isOn` true and `notes:<the scratch project's folder>` holding that string. A rerun whose first assistant turn mentions the note proves the read-back.
## Cost
No model call. The tool's description and schema ride in every request while it is listed, about 150 tokens. The notes are attached once per session and once after each compaction: at most 8 notes of 200 characters, about 450 tokens.
## Acceptance
How the tests prove these: the tool is called as `$.tool.call({ tool: 'mcp__notebook-widget__jot', tool_use_id, text, replace? })`; `tool.register` calls are counted through `ground()`'s `answers`; attached blocks are read from the kit's `contexts`; writes from `writes` and `store`.
- A1: on with no notes, the card says `Nothing noted yet.` and what will appear, with no note; a switch restored at `session.start` gives the same card and registers the tool `jot` once.
- A2: a `jot` call with text answers `Noted (1 of 8).`, sets the store's `notes:/work/project` to `[text]`, and the card shows the note `+1`, the row `1 <text>` with a green number and the hint line; a second call answers `Noted (2 of 8).` and the note reads `+2`.
- A3: text with line breaks, tabs and runs of spaces is stored with single spaces, trimmed; a 300-character text is stored as its first 200; empty or all-whitespace text answers the error `A note needs text.`; a text already held answers `Already in the notebook.` without `isError`; the last two write nothing.
- A4: with 8 notes restored and none new, the card shows the note `full`, 8 rows with dim numbers and `Full: a new note replaces an old`; a ninth `jot` answers the full error with all 8 numbered lines and writes nothing; `replace: 3` puts the text at note 3, leaves 8 notes, answers `Noted (8 of 8).` and the note reads `+1`.
- A5: `replace` of 0, 9, 1.5 and `'2'` (a string) each answer the `There is no note` error with the list and write nothing; with an empty notebook the error reads `The notebook is empty.`
- A6: with notes in the store and the switch restored on, the first prompt carries one context block, the opening sentence and the notes numbered in order, after any context already on the prompt; the second prompt carries none; with an empty notebook no block is ever attached.
- A7: prompts with `origin.kind` `composer`, `bridge` and `sdk` each receive a due block; prompts of kind `task-notification`, `scheduled-trigger`, `peer` and `plugin` pass through as received and leave the block due for the next person's prompt.
- A8: after a main-loop `session.compact` the next prompt carries the block again and the hook returned what `next(e)` resolved to; a compaction with an `agentId`, one with `trigger: 'precompute'`, and one a stand-in beneath answers with `{ skip }` do not make it due.
- A9: notes are kept per project: a session in `C:\Work\Project\` and one in `c:/work/project` read and write the same store key; a session in another folder shows the empty card and its `clear` leaves the first project's notes in the store; stored entries of the earlier shape `{ text, at }` are read as their text, other values are skipped, and only the first 8 are kept.
- A10: `show` with no notes answers `The notebook is empty for this project.`; with one note `1 note for this project:` and with three `3 notes for this project:`, each followed by the list with a 200-character note in full.
- A11: `drop 2` of three notes answers `Dropped note 2: <text>`, stores the other two in order, the card renumbers them, and the next prompt carries the block with the new numbers; `drop`, `drop x`, `drop 0` and `drop 9` answer `There is no note "<typed>". /notebook-widget show lists them.` and write nothing.
- A12: `clear` answers `Notebook emptied for this project.`, stores `[]`, and the card returns to empty with no note; a `jot` after it answers `Noted (1 of 8).`
- A13: while off and never switched on, `session.start` registers no tool and writes nothing, a prompt reaches `next` with no added context, and `show`, `drop 1` and `clear` each answer `Notebook is off.`, leave the switch off and the stored notes as they were; switching on then loads the stored notes, registers the tool once and the next prompt carries the block.
- A14: after on, a `jot`, then off: a further `jot` answers the error `Notebook is off; nothing was written.` and the store is unchanged, a prompt and a compaction add nothing, and no card is drawn; switching on again shows the same notes without registering the tool a second time, and the next prompt carries the block.
- A15: with 8 notes of 200 characters, one new, every row is one line: at 20 and 39 columns the short wording with no line but a row over 16 characters, at 40 and 60 columns the long wording with none over 36; the card is the same in the `side`, `above` and `below` placements and absent from the two the layout's `site` does not name; an unknown verb (`note` included) answers `Usage: /notebook-widget [on|off|show|drop <number>|clear]` and changes nothing.
## widget.json
- title: `Notebook`
- category: `Session`
- shows: `Gives Claude a jot tool for writing down what its future self should know about this project, and reads the notes back next session`
- commands: `/notebook-widget [on|off|show|drop <number>|clear]`
- cost: `The jot tool's description in every request, and up to 8 short notes added to the first prompt of a session and after a compaction`
