# Footnotes (`footnotes-widget`)
## Purpose
For anyone who reads an explanation from Claude and is about to act on it. When a main-loop reply ends, every file path, `path:line` and code symbol it named in inline backticks is checked against the working tree, with no model: the file is on disk or not, the cited line is inside the file or past its end, the symbol occurs in the repository or not. A reply whose references all hold costs one quiet line. One that cites `login.ts:88` in a 61-line file, or a function that occurs nowhere, shows that before the person acts on it, with one button that puts a correction request in the prompt box.
## What is a reference (a closed rule; anything else is left out, never guessed)
Fenced blocks are removed first: every line from one whose trimmed text starts with three backticks to the next such line, or to the end. Then each `` `...` `` span on one line is a token, trimmed. Tokens are taken in order, repeats of the same text dropped, and the first 20 that are a path or a symbol are the reply's references.
- **Path**: the token matches `^([A-Za-z0-9_./\\-]+?)(?::(\d+)(?:([-:])(\d+))?)?$`, does not start with `-`, and its last segment ends in `.` plus one of `ts tsx js jsx mjs cjs json md py rs go java kt rb php c h cpp hpp cs swift css scss html vue svelte yml yaml toml sh sql txt`. Backslashes become `/` and a leading `./` is dropped. The cited line is the first number, or the second when the separator is `-` (a range); a `:` second number is a column and is ignored. So a URL, a Windows drive path, an `@scope/` name, a folder and `origin/main` are not paths.
- **Symbol**: not a path. If the token ends with `)` and holds a `(`, it is cut at the first `(` and is a call. What is left matches `^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$`, is 3 characters or more, and is a call, or has a `.`, or a `_`, or a lowercase letter followed by an uppercase one. Its parts are its dotted pieces without `this` and `self`; no parts left, it is not a symbol. So `npm`, `README`, `--force`, `git status` and `v1.2` are not symbols.
## How each is checked
`cwd` is `await $.session.cwd()`, `repo` is `await $.session.repo()`, both read once per checked reply.
- A path resolves to the first of: itself when it starts with `/` and `$.fs.exists` says so (one that does not exist is left out, never missing); `<cwd>/<path>` when `$.fs.exists` says so; `<repo.root>/<path>` likewise (with a repo); the one entry of the listing that equals it or ends with `/<path>`, as `<repo.root>/<entry>`. Two or more such entries: the reference is left out (ambiguous).
- The listing is the lines of `$.process.run(['git', '--no-optional-locks', 'ls-files', '--cached', '--others', '--exclude-standard'], { cwd: repo.root, timeoutMs: 3000 })`, run at most once per reply and only when a path got that far. With no repo, a rejection, a non-zero exit or `isStdoutTruncated`, there is no listing and every path that got that far is left out: no listing, no "missing".
- Resolved, no line cited: `found`. Resolved with a line: `$.fs.read` once per file; lines are `text.split('\n').length`, less 1 when the text ends with `\n`, 0 for `''`. Cited line above that: `short`. Otherwise, or when the read rejects: `found`.
- Unresolved with a listing: a path without `/` and without a cited line is left out (`Node.js`, a `package.json` meant in general). Any other is `missing`.
- Symbols: with a repo, one `$.process.run(['git', '--no-optional-locks', 'grep', '-I', '-w', '-F', '-o', '-h', '--untracked', '-e', part, '-e', part, ...], { cwd: repo.root, timeoutMs: 3000 })` over every distinct part of every symbol. Exit 0: the trimmed lines of stdout are the parts that occur. Exit 1: none occur. A symbol is `found` when any of its parts occurs, else `missing`. No repo: `unchecked` is `no repository`. A rejection, another exit code or `isStdoutTruncated`: `unchecked` is `git failed`. Unchecked symbols are left out of the references and of the tally.
- A reference is hard (red `✗`) when it is a path that is `short`, or `missing` with a line cited: a cited line cannot be a file Claude proposes to create. Every other failure is soft (yellow `?`): a symbol that occurs nowhere here may live in a library, a path may be a proposal.
## Card
Inner width is the card width less 4; long wording at an inner width of 36 or more, short below. Title `Footnotes`. Note: none when nothing was checked or the reply had no references, else long `<found>/<named> found`, short `<found>/<named>`. Every row is one line (`wrap="truncate-end"`); the two empty sentences are dim and wrap.
- All found: one row, a green `✓` and `<named> named, <found> found`.
- Failures, in reply order, at most 5 rows, then a dim `+<n> more`. Long: `<mark> <name>: <reason>`, the name cut with `…` so the reason is whole. Short: `<mark> <name>`. The name is a path's last segment plus `:` and the line as cited, or the symbol as written (a call keeps `()`). Card reasons: `file has <plural(lines, 'line')>`, `not on disk`, `not in this repo`.
- Then, with any failure, one `<Button key="ask">`: label long `Ask Claude to check these`, short `Ask Claude`.
- Last, when `unchecked` is set, a dim row: long `Symbols not checked: <unchecked>`, short `No symbol check`.
```
Empty: on, no reply checked yet. No note.
│ Footnotes                            │
│ No reply checked yet.                │
│ File and symbol names in Claude's    │
│ replies are checked here.            │
Checked, nothing named. No note.
│ Footnotes                            │
│ Nothing to check in the last reply.  │
Working: everything found. Note `<found>/<named> found`.
│ Footnotes                  7/7 found │
│ ✓ 7 named, 7 found                   │
Best moment: a line past the end and a symbol that occurs nowhere.
│ Footnotes                  5/7 found │
│ ✗ login.ts:88: file has 61 lines     │
│ ? refreshSession(): not in this repo │
│ Ask Claude to check these            │
Error: the symbol search failed; paths were still checked.
│ Footnotes                  2/3 found │
│ ? retry.ts: not on disk              │
│ Ask Claude to check these            │
│ Symbols not checked: git failed      │
Busiest at 20 columns: 20 named, 8 failures.
│ Footnotes  12/20 │
│ ✗ login.ts:88    │
│ ✗ sum.js:40-52   │
│ ? refreshSessio… │
│ ? retry.ts       │
│ ? user_id        │
│ +3 more          │
│ Ask Claude       │
```
## The button
`onPress` calls `$.prompt.fill({ text, mode: 'append' })`, so a draft the person has typed is kept; a rejection is caught and ignored, and `isFilled: false` (a dialog, no box) changes nothing. Nothing is sent: the person sends or deletes it. text is `Check these references from your last reply against the repository and correct what was wrong:`, then one line per failure (all of them, not only the 5 drawn), `- <token as written>: <reason>`, with the full reasons `file has <plural(lines, 'line')>`, `not on disk`, `not found in this repository`.
## Commands
One command; `argumentHint` and usage `[on|off|show|clear]`. The argument is trimmed and lower-cased.
- bare, `on`, `off`: the switch. On: `Footnotes on; /widgets places it.` Off: `Footnotes off.` Unknown input: `Usage: /footnotes-widget [on|off|show|clear]`, nothing changed.
- `show`: the last check in full, nothing cut. `<named> named, <found> found:` then one line per reference in reply order: `✓ <token>`, `✗ <token>: <full reason>` or `? <token>: <full reason>`; then `Symbols not checked: <unchecked>` when set. Nothing checked: `No reply checked yet.` No references: `Nothing to check in the last reply.` (followed by the unchecked line when set). Off: `Footnotes is off.`
- `clear`: forgets the last check; the card returns to empty. Answers `Footnotes cleared.` Off: `Footnotes is off.`
## Data
- `on('session.start')`: nothing of `e`. Once per load.
- `on('command.run', { command: 'footnotes-widget' })`: `e.args`.
- `on('turn.complete')`: `e.answer`, `e.agentId`, `e.isAborted`, `e.reason`. Once per turn. `const ended = await next(e)`, returned unchanged in every case. The check runs when on, `e.agentId === undefined`, `e.isAborted` is false, `e.reason === 'answer'` and `e.answer.trim() !== ''`; otherwise `last` is left as it was. The check is awaited, so the turn's end waits for it: two git runs of 3 s at most, typically tens of milliseconds.
- `$.session.cwd()`, `$.session.repo()`: once per checked reply. `$.fs.exists`: at most twice per path. `$.fs.read`: once per distinct file with a cited line. `$.process.run`: at most two per checked reply, none for a reply with no symbols whose paths all resolve by `$.fs.exists`.
- `$.prompt.fill`: once per press. `$.store.get`, `$.store.set`, `$.command.register`, `$.widgets.card`, the three `on('ui.render')` hooks (`Button` joins `Box` and `Text` from `$.ui.resolve(e)`), `fit()`, `plural()`.
- No `$.fs.stat`, no `$.session.messages`, no `$.clock`, no timer (no `sync`), no model call, nothing returned from `turn.complete` but what `next(e)` gave.
## State and storage
- `$.state` `isOn: boolean`.
- `$.state` `last: { refs: Ref[]; unchecked: '' | 'no repository' | 'git failed' } | undefined`; `undefined` is "no reply checked yet". `Ref` is `{ token: string; name: string; kind: 'path' | 'symbol'; verdict: 'found' | 'missing' | 'short'; lines: number; isHard: boolean }`; `lines` is the file's line count for `short`, else 0. At most 20 refs. Each checked reply replaces it whole.
- `$.store` `isOn: boolean`, the only key. No files.
## Off
No card. `session.start` registers the command and reads `isOn`. `turn.complete` returns `next(e)` and reads nothing: no `$.session`, `$.fs` or `$.process` call. `show` and `clear` answer `Footnotes is off.` Switching off writes only `isOn`; `last` stays in `$.state`, so a switch-on in the same session shows it again.
## Demo
At rest: the empty card. After the scripted turn the engine's answer names `` `src/sum.js` ``, which is in its files: note `1/1 found` and the row `✓ 1 named, 1 found`. Stand-in the engine lacks: `fs.exists` (it has `read` and `stat`), answering whether the path is in its files. Its `repo` answers a root and its `ls-files` stub lists the files; neither is reached by this answer.
## Live
`bun factory/tools/live.ts factory/floor/plugins/footnotes-widget --say "/footnotes-widget on" --say 'Reply with exactly this one sentence, backticks kept, no code block, nothing else: See `README.md:1`, `README.md:99`, `src/nowhere.ts:3` and `refreshSession()`.' --say "/footnotes-widget show" --say "/footnotes-widget off"`
A good run shows Claude's one sentence, then `show` answering `4 named, 1 found:`, `✓ README.md:1`, `✗ README.md:99: file has 3 lines` (the scratch README's real count), `✗ src/nowhere.ts:3: not on disk` and `? refreshSession(): not found in this repository`. The scratch project is a git repository; were it not, the last line would be `Symbols not checked: no repository` and the tally `3 named, 1 found:`. The store prints `isOn` false and no other key.
## Cost
None: no tokens, no model call, nothing added to a prompt. The correction text reaches Claude only if the person sends it.
## Acceptance
How the tests prove these: files come from `ground()`'s `files`; `session.repo` and `process.run` are given through `answers`, the latter recording each `argv` and answering by `argv[2]` (`ls-files` or `grep`); fills are caught by the test's own `on('prompt.fill', ...)`; turns end through `$.turn.complete({ answer, durationMs, isAborted, turnId, reason })`; the button is pressed with `ui.press({ key: 'ask' })`.
- A1: on with no reply checked, the card shows `No reply checked yet.` and the sentence about what is checked, with no note and no button; a switch restored at `session.start` gives the same card.
- A2: a reply naming `` `src/sum.js` ``, `` `src/sum.js:3` `` (a 7-line file) and `` `sum()` `` (grep answers `sum`) gives the note `3/3 found` and the one green row `3 named, 3 found`, with no button; no `ls-files` run was made, and `turn.complete` resolved to what `next(e)` returned.
- A3: `` `src/routes/login.ts:88` `` on a 61-line file and `` `refreshSession()` `` with grep exit 1 give a red `✗ login.ts:88: file has 61 lines`, a yellow `? refreshSession(): not in this repo`, and a note counting only the found; a line equal to the count is found, as is one in a file with no final newline counted to its last line; `:88-95` checks 95, `:88:12` checks 88; a file whose read rejects is found.
- A4: with a listing that lacks them, `` `src/retry.ts` `` is a yellow `? retry.ts: not on disk`, `` `src/retry.ts:3` `` a red `✗`, a bare `` `Node.js` `` is left out, and a bare `` `gone.ts:9` `` is a red `✗`.
- A5: a path resolves at `<cwd>/`, then at `<repo.root>/` when the session folder is a subfolder, then by a unique suffix in the listing (`routes/login.ts` for `src/routes/login.ts`), each found; a name with two suffix matches is left out; `src\sum.js` and `./src/sum.js` are found as `src/sum.js`; one reply makes one `ls-files` run however many paths need it.
- A6: nothing in a fenced block is a reference, an unclosed fence included; `` `npm` ``, `` `README` ``, `` `--force` ``, `` `git status` ``, `` `v1.2` ``, `` `https://a.dev/x.html` ``, `` `C:\app\x.ts` ``, `` `@scope/pkg/index.js` ``, `` `src/routes` `` and `` `origin/main` `` give none; a token named twice counts once; of 25 distinct paths the first 20 are checked.
- A7: `` `MAX_RETRIES` ``, `` `user.id` ``, `` `getUser(id, true)` `` and `` `UserService` `` are symbols; one `grep` run carries the exact flags and one `-e` per distinct part; `` `user.id` `` is found when only `user` occurs; `` `this.refreshSession()` `` searches `refreshSession` alone and is missing when it does not occur; `` `this` `` and `` `ab()` `` give none.
- A8: with `session.repo` null no process is run, the symbols are left out of the tally, and the last row reads `Symbols not checked: no repository`; a `grep` that exits 2, is truncated or rejects reads `git failed`; a reply with paths only shows no such row; a path at `<cwd>/` is still found with no repo, and one not there is left out, as it is when `ls-files` fails.
- A9: after a checked reply, a turn with an `agentId`, one with `isAborted: true`, one with `reason: 'error'` and one whose answer is blank each leave the card as it was and make no `$.fs` or `$.process` call; a reply with no references shows `Nothing to check in the last reply.` with no note.
- A10: pressing `ask` calls `prompt.fill` once with `mode: 'append'` and the opening sentence followed by one `- <token>: <full reason>` line for each of 8 failures; a `prompt.fill` hook that throws, or answers `isFilled: false`, leaves the card and `last` unchanged.
- A11: `show` answers `No reply checked yet.` before any reply, `Nothing to check in the last reply.` after one with no references, and after the reply of A3 `2 named, 0 found:` with a `✗` line and a `?` line carrying the tokens as written and `not found in this repository`; with unchecked symbols its last line is `Symbols not checked: no repository`.
- A12: `clear` answers `Footnotes cleared.` and the card returns to empty; an unknown verb answers `Usage: /footnotes-widget [on|off|show|clear]` and changes nothing; `SHOW` works as `show`.
- A13: while off, a turn ending with a reply full of references reaches `next` and makes no `$.session.cwd`, `$.session.repo`, `$.fs` or `$.process` call and writes nothing; `show` and `clear` answer `Footnotes is off.` and leave the switch off.
- A14: after a checked reply with failures, off draws no card and a new reply is not checked; on again shows the same rows, note and button.
- A15: with 20 references and 8 failures every row is one line, 5 failure rows are followed by `+3 more`; at 20 and 39 columns rows are `<mark> <name>`, the note `12/20`, the button `Ask Claude` and the unchecked row `No symbol check`; at 40 and 60 the long forms, a 40-character symbol cut with `…` before its whole reason; the card is the same in the `side`, `above` and `below` placements.
## widget.json
- title: `Footnotes`
- category: `Session`
- shows: `Checks every file path, cited line and code symbol in Claude's last reply against the working tree, with no model call, and flags the ones that are not there`
- commands: `/footnotes-widget [on|off|show|clear]`
- cost: empty
