# Loupe (`loupe-widget`)
## Purpose
For anyone reading a long transcript who meets a hash, a path, a name or a number and wonders what it is. Drag the mouse across it, the gesture already made to copy, and the card says what it is, worked out locally with git and the file system: no model, no tokens, nothing added to the conversation. Kept from the idea: commit, path, symbol, timestamp, colour, the tool row it came from, copy. Cut: cron, JWT, exit and HTTP codes, ports (each is its own parser and its own false positives; a JWT is also a secret).
## Kinds
- Clean: the text is trimmed; one line only, the characters `` ` ' " ( ) [ ] { } < > , ; `` are stripped from both ends and `.` `:` from the end, repeatedly. Blank after trimming counts as nothing selected. The cleaned text is the head. More than one line, over 200 characters, or blank after stripping: kind `text` at once, with no lookup.
- Every `$.process.run` is `git --no-optional-locks ...` with `{ cwd: <session root>, timeoutMs: 2000 }`. The selection reaches git only as one argv element, only after the pattern named below has matched, and for a path only after `--`. No file is read. "In a repository" means `$.session.repo()` is not null.
- The first kind that applies wins, in this order. Wide rows are drawn at an inner width of 24 or more, tight rows under it.
  1. `colour`: `/^#[0-9a-f]{6}$/i`. Rows: a swatch (`$.widgets.picture`, key `loupe-swatch`, the inner width by 2, `fill` the colour, no marks); `rgb(255, 136, 0)`, tight `255 136 0`. Copy: the wide row.
  2. `commit`: `/^[0-9a-f]{7,40}$/i`, in a repository, and `rev-parse --verify --quiet <text>^{commit}` exits 0 with 40 hex characters. Then `show --shortstat --format=%h%x00%s%x00%an%x00%ct%x00 <sha>`. Head: `%h`. Rows: the subject; `<author> · <span> ago · <plural files>`, tight `<span> ago` (no shortstat, as on a merge: files left out). Copy: the 40 characters.
  3. `time`: `/^\d{10}$|^\d{13}$/` (seconds, milliseconds), from 2001-09-09 to ten years after now. Rows: `2025-10-04 21:20:00 UTC`, tight `2025-10-04 21:20`; `<span> ago` or `in <span>`. Copy: `2025-10-04T21:20:00Z`.
  4. `path`: at most 260 characters, no white space; a trailing `:<line>` or `:<line>:<col>` is set aside for the lookup and kept in the head. Tried against `$.session.root()`, then `$.session.cwd()`, with `$.fs.exists`; found, `$.fs.stat(path, { resolve: true })`. Inside the root (`folder(realPath)` is the root's own `folder(realPath)` or under it): row `file · 4.1 kB · changed <span> ago` (tight `file · 4.1 kB`; a `dir` has no size; an `mtimeMs` of 0 has no age; sizes `212 B`, `4.1 kB`, `3.0 MB`), then, in a repository, `log -1 --format=%h%x00%s -- <path from the root>` as the row `<hash> <subject>` when it prints one. Copy: the path from the root with `/`. Outside the root: the one row `exists, outside the session root` (tight `exists, outside`), no size, no git, no copy. Not found and the text holds `/` or `\`: the one row `missing`. Not found without one: not a path.
  5. `symbol`: `/^[A-Za-z_$][\w$]{2,63}$/`. Not in a repository: the one row `not a git repository`. Else `grep -n -I -w -F -e <name>`. Exit 1: `no mention in tracked files`. A definition is a matching line where one of `function class interface type enum const let var def fn func struct trait module` is followed by white space, an optional `*`, and the name as a whole word. Rows: `<path>:<line>` of the first definition (` (+2)` when more), or `no definition found`; that line's text, trimmed (with a definition only); `37 mentions in 12 files`, tight `37× in 12 files` (`many mentions` when `isStdoutTruncated`). Copy: `<path>:<line>`, or the name without a definition.
  6. `text`: everything else. One row: `31 characters, 2 lines`, tight `31 in 2 lines`. No copy. Never a guess.
- Source: `from <tool>, <span> ago` (tight `from <tool>`) when the selection's `requestId` is a recorded tool call; the tool is cut to 10 characters, `mcp__a__b` shown as `b`; the age is as of the finding.
- Failed: a lookup call that rejects or times out makes the finding kind `text` with the one red row `Lookup failed.`
## Card
Title `Loupe`. Note: the kind, none without a finding. Inner width is the card width less 4. Rows in order: head (bold), the kind's rows, source (dim), a `Button` labelled `copy <value>` (tight `copy`). At most 6 rows. Head, path rows and the button label are cut in the middle (`…` between the first ⌈(w−1)/2⌉ and the last ⌊(w−1)/2⌋ characters); every other row is `wrap="truncate-end"`. The two sentences are wrapped by words by the widget.
```
Rest: on, no finding. Also when `$.ui.selection` is absent or rejects.
│ Loupe                                │
│ Select anything in the transcript    │
│ with the mouse and this card says    │
│ what it is: a commit, a path, a      │
│ symbol, a timestamp or a colour.     │
Rest when the drawing's `e.viewport?.isFullscreen` is `false`:
│ Loupe                                │
│ Needs the fullscreen layout to see   │
│ a selection (/tui fullscreen).       │
│ /loupe-widget look <text> works      │
│ anywhere.                            │
Working: a lookup is running. No note; the second row dim.
│ Loupe                                │
│ fit                                  │
│ looking…                             │
Best moment: Claude named `fit()`, the person dragged across it in a Read row.
│ Loupe                         symbol │
│ fit                                  │
│ hooks/lib.ts:4                       │
│ export const fit = (wanted: number,… │
│ 37 mentions in 12 files              │
│ from Read, 4m 02s ago                │
│ copy hooks/lib.ts:4                  │
A hash in a wall of test output:
│ Loupe                         commit │
│ a3f9c1e                              │
│ Fix retry backoff                    │
│ Ada Lovelace · 2d 3h ago · 3 files   │
│ from Bash, 12s ago                   │
│ copy a3f9c1e7c0de4…c8b7a01f2e3d4c5b6 │
Error: the row red.
│ Loupe                           text │
│ fit                                  │
│ Lookup failed.                       │
Busiest at 20 columns:
│ Loupe     symbol │
│ fit              │
│ hooks/lib.ts:4   │
│ export const fi… │
│ 37× in 12 files  │
│ from Read        │
│ copy             │
```
## Commands
`/loupe-widget [on|off|look [text]|copy]`. The verb is matched without regard to case; the text after `look` keeps its case. Bare, `on`, `off` and the usage as in the template. No `clear` (nothing is collected), no second command, no tool.
- `look`: reads `$.ui.selection()` once and examines it as a poll would. Nothing selected: `Nothing is selected.`, or with `e.presentation.isFullscreen === false`, `No selection can be seen outside the fullscreen layout. Try /loupe-widget look <text>.`
- `look <text>`: examines the typed text; the finding goes on the card marked `typed`.
- Both answer one line: `<head>: <kind> · <wide rows joined by " · "> · <source>` (no swatch; absent parts left out), e.g. `fit: symbol · hooks/lib.ts:4 · export const fit = ... · 37 mentions in 12 files`.
- `copy`: `$.ui.copy({ text })` with the finding's copy value; answers `Copied <value>.`, `Could not copy: <reason>`, or `Nothing to copy.` without one.
- While off, `look` and `copy` answer `Loupe is off.` and read nothing.
## Data
Verified in this build's types (`plugin-authoring/types/claude-code.d.ts`, 2.1.289; `plugins/*/.claude-plugin/types/` is absent from this checkout).
- `$.ui.selection(): Promise<UiSelection | undefined>`, `UiSelection = { text: string; requestId?: string }`. There is no selection event. `$.clock.every(300, poll)` while on. A poll returns at once while `isBusy`; else one read. `undefined` or blank: `seen` becomes `''` and a finding marked `selection` is dropped (the card is at rest; a `typed` finding stays). The engine answers `undefined` again once the person dismisses the selection or their next prompt or command has run, so the card never outlives the selection. Same `text` and `requestId` as `seen`: nothing, no state write, no redraw. Otherwise one examine.
- Examine: `ticket` is raised and `isBusy` set; the kinds are tried; the finding is written only if `ticket` is still the one it started with, so a late answer is dropped. Per examine: at most 2 fs calls and 2 git calls.
- `$.process.run(argv, { cwd, timeoutMs }): Promise<ProcessRunResult>` (`exitCode`, `stdout`, `isStdoutTruncated`); `$.fs.exists(path)`; `$.fs.stat(path, { resolve: true }): Promise<FsStat>` (`kind`, `size`, `mtimeMs`, `realPath`); `$.session.root()`, `$.session.cwd()`, `$.session.repo()`; `$.clock.now()`.
- `on('tool.call')`: if on, records `e.tool_use_id` with `e.tool` and the time, keeping the newest 200; `return next(e)` with `e` untouched, whether on or off.
- `$.ui.copy({ text, surface }): Promise<UiCopyResult>` (`{ isCopied: true } | { isCopied: false, reason }`): from the Button's `onPress: press => ...` with `press.surface`, then `$.ui.toast('Copied <value>')` or `$.ui.toast('Could not copy: <reason>')`; from the verb with `surface` left out.
- `on('session.start')`, `on('command.run', { command: 'loupe-widget' })` (reads `e.args`, `e.presentation.isFullscreen`), the three `on('ui.render')` hooks, which pass `e.viewport?.isFullscreen` and `e.surface` to `show`, `$.widgets.card`, `$.widgets.picture`. Drawing reads state only.
## State and storage
- `$.state` `isOn: boolean`.
- `$.state` `look: { seen: { text: string; requestId: string }; ticket: number; isBusy: boolean; head: string; finding: LoupeFinding | null }`, blank `{ seen: { text: '', requestId: '' }, ticket: 0, isBusy: false, head: '', finding: null }`. Only a poll writes `seen`.
- `LoupeFinding`: `{ from: 'selection' | 'typed'; kind: 'colour' | 'commit' | 'time' | 'path' | 'symbol' | 'text'; head: string; rows: string[]; tight: string[]; source: string; copy: string; colour: number | null; isFailed: boolean }` (`rows` and `tight` the same length, at most 3; `''` for no source or no copy).
- `$.state` `calls: Record<string, { tool: string; at: number }>`. `$.store` `isOn` only. No file. Nothing selected or found is ever written to the store or to disk. The timer handle is the only module-level `let`.
## Off
No card, no timer, no selection read, no process or fs call, no copy. `tool.call` passes straight to `next(e)` and records nothing. Switching off cancels the timer and sets `look` and `calls` back to blank.
## Demo
`docs/engine.js` has no `ui.selection`, its `git grep` answers TODO lines whatever is asked, and its `git log` knows no `%x00` format. Stand-ins needed, for this widget: `grep -n -I -w -F -e <name>` answering the real matches in the demo files; `log -1 --format=%h%x00%s -- <path>` answering the newest demo commit; `ui.selection` answering `undefined` until the scripted turn ends and then `{ text: 'src/sum.js', requestId: <that turn's Edit call id> }`; and the opening line `look sum`. At rest: the `symbol` card for `sum`, defined in `src/sum.js`, with its mentions and the copy button. After the scripted turn: the `path` card for `src/sum.js` with `from Edit, …` and `copy src/sum.js` (the stand-in `mtimeMs` is 0, so no age). Without the stand-ins the card must draw the rest sentence, not throw.
## Live
`bun factory/tools/live.ts factory/floor/plugins/loupe-widget --say "/loupe-widget on" --say "/loupe-widget look README.md" --say "/loupe-widget look #FF8800" --say "/loupe-widget look 1759612800" --say "/loupe-widget look scratch" --say "/loupe-widget look" --say "/loupe-widget copy" --say "/loupe-widget off"`
No prompt, no model turn, no tokens. A good run answers, in order: `README.md: path · file · <n> B · changed <span> ago` (with a commit part only if the scratch project is a repository); `#FF8800: colour · rgb(255, 136, 0)`; `1759612800: time · 2025-10-04 21:20:00 UTC · <span> ago`; `scratch: symbol · ...` ending in a mention count, `no mention in tracked files` or `not a git repository`, never an error; the outside-fullscreen sentence; `Copied scratch.` or `Could not copy: <reason>` (a headless session may have no surface; either is a pass, an exception is not); and the store prints `isOn` false and no other key. A headless session reports no selection, so the mouse path (drag, card, button, return to rest) can only be proven by hand in a fullscreen session: ask the owner first, in a scratch project, and leave every switch off afterwards.
## Cost
None: no tokens, no model call, nothing added to a prompt. While on, one selection read every 300 ms and at most 2 git and 2 fs calls per new selection.
## Acceptance
Tests give `ui.selection`, `process.run`, `fs.stat`, `session.repo`, `ui.copy` and `clock` through `ground()`'s `answers`, record each `process.run` argv, and move the kit's clock to fire polls.
- A1: on with nothing selected the card shows the rest sentence and no note; drawn with `viewport.isFullscreen` false it shows the fullscreen sentence naming `/loupe-widget look <text>`; with `ui.selection` rejecting or unanswered it still shows the rest sentence; restored off, no timer runs and no selection is read.
- A2: while on the selection is read once per 300 ms; an unchanged selection causes no process or fs call and no state write; no read is made while a lookup is unanswered, and the card then shows the head and `looking…`; switching off stops the reads.
- A3: a selected `a3f9c1e` that git verifies gives the note `commit`, the subject and `<author> · <span> ago · 3 files` from the two argv of Kinds, with copy value the 40-character hash; no shortstat leaves the files out; `deadbeef` that git refuses, or a `rev-parse` answer that is not 40 hex characters, is not a commit and goes on to the later kinds.
- A4: `src/sum.js:4` found under the root gives head `src/sum.js:4`, `file · <size> · changed <span> ago`, the last-commit row from `log -1 ... -- src/sum.js`, and copy value `src/sum.js`; a path found only under the cwd is found; a folder shows `dir` and no size; sizes read `212 B`, `4.1 kB`, `3.0 MB`; an `mtimeMs` of 0 shows no age.
- A5: a path whose `realPath` is outside the root shows only `exists, outside the session root`, with no git call and no button; `no/such/file.ts` shows `missing`; `nosuchword` is not a path.
- A6: `fit` with a line `export const fit = (` among its matches shows that `path:line`, the line's text and `37 mentions in 12 files`; three such lines add ` (+2)`; matches with no declaration show `no definition found` and the count, with copy value the name; exit 1 shows `no mention in tracked files`; a truncated answer shows `many mentions`; the argv ends `-n -I -w -F -e fit`; `ab` and `a.b` are `text`.
- A7: `1759612800` and `1759612800000` both show `2025-10-04 21:20:00 UTC` and `<span> ago`; a time ahead of now shows `in <span>`; `0999999999` and a time more than ten years ahead are not times.
- A8: `#FF8800` shows a picture whose `fill` is `0xff8800` and width the inner width, the row `rgb(255, 136, 0)` and that as copy value, on the terminal and on one other surface without throwing.
- A9: a two-line selection, one of 201 characters and `!!!` each show `text` with the character and line counts, no button, and cause no process or fs call; white space alone is nothing selected; `` `fit()`, `` is examined as `fit`.
- A10: a selection whose `requestId` matches a recorded `tool.call` shows `from Bash, <span> ago`; `mcp__db__run_query_now` shows `run_query_`; no or an unknown `requestId` shows no source row; only the newest 200 calls are kept; every `tool.call` reaches `next` with its input unchanged.
- A11: when the selection becomes `undefined` the card returns to rest; a `typed` finding survives `undefined` polls and is replaced by the next selection; a lookup answered after a newer examine began does not reach the card.
- A12: `look Fit` examines `Fit` in its given case and answers the one-line form, and `LOOK x` is the same verb; bare `look` examines the selection, answers `Nothing is selected.` without one, and the outside-fullscreen sentence when `presentation.isFullscreen` is false; `/loupe-widget what` answers the usage naming all four verbs.
- A13: pressing the button calls `ui.copy` with the copy value and the press's surface and toasts `Copied <value>`, or `Could not copy: <reason>` on `{ isCopied: false, reason }`; the `copy` verb answers the same two sentences with a full stop on the first, and `Nothing to copy.` with no finding or a `text` finding.
- A14: a `process.run` that rejects shows `text` with the red row `Lookup failed.` and the next selection is examined as usual; with `session.repo` null no git call is ever made, `a3f9c1e` and `fit` show `not a git repository`, and a path, a time and a colour still resolve; a selection starting with `-` reaches git only after `--` or `-e`.
- A15: at 20, 40 and 60 columns no row of any state is longer than the inner width, tight rows are used at 20 and wide at 40, a long head and button label are cut in the middle, and the best-moment card is the same in all three placements; while off `look` and `copy` answer `Loupe is off.`, a `tool.call` records nothing, and after every test above the store holds no key but `isOn` and no file was written.
## widget.json
- title: `Loupe`
- category: `Session`
- shows: `Select a hash, path, name, timestamp or colour in the transcript with the mouse and the card says what it is, with no model call`
- commands: `/loupe-widget [on|off|look [text]|copy]`
- cost: empty
