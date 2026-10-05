# Provenance (`provenance-widget`)
## Purpose
For anyone who meets code in their repository and wonders why it is the way it is. Git blame stops at a commit; Provenance goes one step further, to the saved conversation that made the commit and the prompt the person typed before Claude first edited that file. It shows this when Claude is about to edit lines, or when the person asks about a `path:line`. Settled, with the reason:
- One record per commit Claude made: `{ short, subject, at, session, asks }`. A record comes from a commit line, `[<anything> <7 to 40 hex>] <subject>` at the start of a line, in the result of a Bash or PowerShell call whose command contains `git`. Live calls and saved sessions are reduced by the same pure function, so `scan` and live recording cannot disagree.
- The prompt quoted is the earliest prompt since the session's previous commit that led to an Edit or Write of that file; a commit clears what is pending. "written after you said" is then literally true. A file the commit carried without such an edit has no prompt, and the card says so; a prompt is never guessed.
- Join, at lookup: a record matches a blamed commit when the commit's hash starts with `short`, or else when `subject` equals the commit's summary and its author time is within 120 seconds of `at` (a rebase or an amend keeps both; a squash keeps neither and reads as no record).
- Triggers: an Edit (before it runs), and the `look` verb. Read, Write and a selection timer are cut: a Read is too frequent, a Write has no old lines, and bare `look` reads the selection once on request.
- Among the commits of a range, the one with the most lines that has a record is shown; if none has one, the one with the most lines (ties: the newer author time). Lines not committed are not counted.
- Privacy: only saved sessions whose recorded `cwd` is inside this repository or one of its worktrees are read, and the map is a file under `$.plugin.root`, never in the repository. The `Claude-Session` commit trailer is not built.
- Dates are UTC days written `14 Sep 2026`. A stored prompt has whitespace collapsed and is cut at the last space before 240 characters, ending `…`.
## Card
Title `Provenance`. Note, from 30 columns only: `<t> of <n>` at rest, the date of the prompt (or of the record when there is no prompt) on a traced finding, `no record`, `no blame`; none when empty. Sentences wrap; the path row is cut from its left with `…`; the commit row is cut at its end.
```
Empty: a repository with no record.
│ Provenance                           │
│ No conversations traced yet.         │
│ /provenance-widget scan reads this   │
│ repository's saved sessions; commits │
│ made from now on are recorded.       │
Working (at rest): records, no lookup yet.
│ Provenance                 41 of 230 │
│ 41 of 230 commits trace to a         │
│ conversation.                        │
│ Shown when Claude edits lines, or    │
│ /provenance-widget look <path:line>  │
Best moment: the lines trace to a prompt.
│ Provenance               14 Sep 2026 │
│ src/http/retry.ts:41-58              │
│ written after you said:              │
│ "never retry on a 401, it locks      │
│ accounts"                            │
│ a1b2c3d · 14 of 18 lines             │
│ /provenance-widget copy resumes it   │
No conversation on record.
│ Provenance                 no record │
│ src/http/retry.ts:41-58              │
│ No conversation on record.           │
│ a1b2c3d · 14 of 18 lines             │
│ 2 Mar 2025 · Fix the retry loop      │
Error: blame gave nothing.
│ Provenance                  no blame │
│ src/http/retry.ts:41-58              │
│ git blame gave no answer here.       │
Error: no repository.
│ Provenance                           │
│ Not a git repository.                │
│ Provenance needs git history.        │
Busiest at 20 columns:
│ Provenance       │
│ …/retry.ts:41-58 │
│ after you said:  │
│ "never retry on  │
│ a 401, it locks  │
│ accounts"        │
│ a1b2c3d · 14/18  │
│ 14 Sep 2026      │
│ copy resumes it  │
```
Rules: a traced finding whose record has no prompt for the file is the best-moment card with rows 3 to 5 replaced by `A session wrote these lines, but its prompt for this file was not found.` and the note the date of the record. The quoted prompt is yellow, in double quotes, on at most 4 rows, the last ending `…"` when rows ran out. When every line of the range is uncommitted the `no record` card reads `These lines are not committed yet.` and has no commit rows. Under 30 columns: no note, `after you said:`, `<k>/<m>` for `<k> of <m> lines`, a date row after the commit row on a traced finding, `copy resumes it`, and at rest `<t> of <n> commits traced.` with `look <path:line>` as the hint. A finding stays until the next lookup or `clear`.
## Commands
`/provenance-widget [on|off|scan|look [<path>:<line>]|copy|clear]`; the verb is matched without regard to case. Bare, `on`, `off` and usage as in the template (`Provenance on; /widgets places it.`, `Provenance off.`). No second command, no tool.
- `scan`: reads this repository's saved sessions, adds their records, recounts, and answers `Read <plural saved session> of <name>: <plural commit> recorded. <t> of <n> commits trace to a conversation.`, then ` <k> too long to read.` when any, then on a new line `<w> more to read: run scan again.` when the byte cap stopped it. Failures answer `Could not find where sessions are saved.` or `Could not read <base>.`
- `look <path>:<line>` or `<path>:<first>-<last>`: the path is absolute or relative to `$.session.cwd()`; the split is at the last `:` followed by digits. It looks the lines up, sets the card, and answers line 1 `<path>:<first>-<last> · commit <hash7> (<k> of <m> lines), <commit date>`, then by kind: `You said, on <date>: "<prompt>"` and `Resume: claude --resume <session>`; or `Session <session> wrote these lines; its prompt for this file was not found.` and the `Resume:` line; or `No conversation on record. Commit: <subject>`; or the one line `<path>:<lines> is not committed yet.`; or `git blame gave no answer for <path>:<lines>.` A match by subject and time adds `Matched by subject and time: the commit was rewritten.` A path outside the repository answers `<path> is outside this repository.`
- Bare `look`: the same, on the text of `$.ui.selection()`, trimmed. No selection, or text that is not `<path>:<line>`: `Select a path:line first, or /provenance-widget look <path>:<line>.`
- `copy`: copies `claude --resume <session>` of the finding on the card and answers `Copied: claude --resume <session>`; when the copy does not take, `Could not copy. Run: claude --resume <session>`; with no traced finding, `Nothing to resume: look up a line first.`
- `clear`: deletes this repository's records and the finding and answers `Provenance cleared: <plural commit> forgotten for <name>.`
- While off, `scan`, `look`, `copy` and `clear` answer `Provenance is off.` and change nothing. In a folder with no repository, `scan` and `look` answer `Not a git repository.`
## Data
Verified in `plugin-authoring/types/claude-code.d.ts` (2.1.289).
- `on('prompt.submit', hook)` (`PromptSubmitInput` `{ text, origin }`): when on and `e.origin.kind` is `composer`, `bridge` or `sdk`, hold `{ text, at }` as the current ask; always `return next(e)` untouched.
- `on('tool.call', hook)` (`ToolCallInput`, result `ToolCallResult` `{ result, text?, isError?, deny? }`), every call while on:
  - `Edit` (`file_path`, `old_string`): before `next(e)`, when the repository has records, look the lines up: `$.fs.read(e.file_path)`, first line = 1 + the newlines before the first `old_string`, last = first + the newlines inside it (a trailing newline adds none). Skipped when `old_string` is not found, the read rejects, the file is outside every root, the path and first line equal the finding's, or a lookup is running.
  - `Edit` and `Write` (`file_path`): after `next(e)`, when the result has no `deny` and no `isError` and an ask is held, `pending[folder(file_path)] ??= ask`.
  - `Bash` and `PowerShell` (`command`): when `command` contains `git`, each commit line in `ran.text` becomes a record with `at` now, `$.session.id()` and the pending asks whose files are under a root (stored relative to it, lowercased, with `/`); then pending is emptied, the file is written and the count is taken again.
  - The hook always returns the object `next(e)` gave.
- Lookup: `$.process.run(['git', '--no-optional-locks', 'blame', '--porcelain', '-L', '<first>,<last>', '--', <absolute path>], { cwd: <its root>, timeoutMs: 2000 })`. Read from the porcelain: each line's 40-hex header, and per commit `author-time`, `summary`, `filename`. A rejection or a non-zero exit is the `no blame` finding. Then one `$.fs.read` of the map and the join above; the ask is the record's ask whose `files` has the lowercased `filename`.
- Repository: `$.process.run(['git', '--no-optional-locks', 'worktree', 'list', '--porcelain'], { cwd: await $.session.root(), timeoutMs: 5000 })`; the `worktree ` lines are the roots, the first is the main one, key `folder(main)`, name its last segment. Run once at `session.start` while on or at switching on; while no repository is known it is run again at `scan`, at `look` and when a commit line is seen.
- Count: `$.process.run(['git', '--no-optional-locks', 'log', '--format=%H%x09%at%x09%s', '--max-count=20000', 'HEAD'], { cwd: main, timeoutMs: 5000 })`; `n` is the rows, `t` the rows a record matches. Taken with the repository, after `scan`, after a recorded commit and after `clear`. A failure leaves `0 of 0` and the rest sentence reads `<r> commits recorded.`
- Scan: `$.env.get('CLAUDE_CONFIG_DIR')`, else `$.env.get('HOME')`, else `$.env.get('USERPROFILE')` with `/.claude`; `$.fs.list(<base>/projects)`, then `$.fs.list` of each folder whose lowercased name equals `enc(root)` or starts with `enc(root)-` for a root (`enc`: every character outside `a-zA-Z0-9` becomes `-`). A `.jsonl` file whose size equals the size kept for its id is skipped; one over 3,500,000 bytes is counted too long; the rest are read newest first with `$.fs.read` until 40,000,000 bytes are spent. A session counts only when the first row holding a string `cwd` puts it inside a root (through `folder()`).
- Saved rows, parsed line by line, a line that is not JSON skipped. A prompt: `type` `user`, not `isMeta`, not `isSidechain`, `origin.kind` absent or `human`, `message.content` a string or text blocks with no `tool_result`, the text not starting with `<`. An edit: an assistant `tool_use` block named `Edit` or `Write` with a string `input.file_path`. A commit: a `tool_result` block, not `is_error`, whose `tool_use_id` is that of a `Bash` or `PowerShell` `tool_use` whose `input.command` contains `git`; its `content` (a string, or text blocks joined) is searched for commit lines; `at` is the row's `timestamp`, else the file's `mtimeMs`; the session is the file name.
- Also: `$.ui.selection()` (`UiSelection` `{ text }`), `$.ui.copy({ text })` (`UiCopyResult` `{ isCopied }`), `$.clock.now()`, `$.fs.write`, `$.store.get/set`, `$.command.register`, `on('command.run')`, `on('session.start')`, the three `ui.render` hooks, `$.widgets.card`. Not used: timers, `$.session.repo`, `$.ui.toast`, any model call, anything added to a prompt.
## State and storage
- `$.state` `isOn: boolean`.
- `$.state` `repo: ProvenanceRepo` `{ key: string; name: string; roots: string[]; isRepo: boolean; records: number; traced: number; total: number }`; `key` `''` before the first look for a repository.
- `$.state` `run: ProvenanceRun` `{ ask: ProvenanceSaid | null; pending: Record<string, ProvenanceSaid>; isLooking: boolean }`; `ProvenanceSaid` `{ text: string; at: number }`.
- `$.state` `finding: ProvenanceFinding | null` `{ kind: 'traced' | 'promptless' | 'untraced' | 'uncommitted' | 'unread'; path: string; first: number; last: number; hash: string; lines: number; of: number; commitAt: number; subject: string; session: string; ask: string; askAt: number; isMoved: boolean }`.
- `$.store` `isOn` only.
- File `<$.plugin.root>/provenance.json`: `{ projects: Record<string, ProvenanceProject> }` by repository key; `ProvenanceProject` `{ commits: ProvenanceCommit[]; sizes: Record<string, number>; scannedAt: number }`; `ProvenanceCommit` `{ short: string; subject: string; at: number; session: string; asks: ProvenanceAsk[] }`; `ProvenanceAsk` `{ text: string; at: number; files: string[] }`. A record is unique by `session` and `short`; the first one written stays. At most 2,000 per repository, the oldest `at` dropped. Every write reads the file first and replaces only this repository's entry. A missing or malformed file is an empty map. No timer, no module-level `let`.
## Off
No card. `prompt.submit` and `tool.call` return `next(e)` after reading the switch: no ask held, no file read, no git run, no record written. Switching off resets `run` and `finding`. The map file stays until `clear`.
## Demo
`docs/engine.js` has the file `/demo/project/src/sum.js`, an Edit of it and `git commit -am "Fix the off-by-one in sum"` answering `[main 3f2a1c9] Fix the off-by-one in sum` in its scripted turn, but no blame, no worktree list, no tab-separated log and no map file. Stand-ins needed, for `provenance-widget` only: `git worktree list --porcelain` answers `worktree /demo/project`; `git log --format=%H%x09%at%x09%s` answers the five `COMMITS` with 40-hex hashes, the first starting `3f2a1c9` and `Sum a list` starting `9c41e07`; `git blame --porcelain` gives every asked line to the `9c41e07` commit (summary `Sum a list`, author time 40 days before now, filename `src/sum.js`); and a seeded `<plugin root>/provenance.json` holding one record under `/demo/project`: short `9c41e07`, subject `Sum a list`, session `demo-40-days-ago`, one ask `Sum the list, but start at 1: row 0 is the header` 40 days before now for `src/sum.js`. At rest: note `1 of 5`, `1 of 5 commits trace to a conversation.` and the hint. In the scripted turn Claude's Edit moves the loop start from 1 to 0, and the card turns to the best moment: `src/sum.js:<lines>`, `written after you said:`, `"Sum the list, but start at 1: row 0 is the header"`, `9c41e07 · <k> of <k> lines`, the note the date 40 days ago. That is the card after the turn; the turn's commit is recorded behind it. Without the stand-ins the card must boot to `Not a git repository.`
## Live
`bun factory/tools/live.ts factory/floor/plugins/provenance-widget --allow "Bash,Write" --say "/provenance-widget on" --say "Never retry on a 401. Do exactly this and then answer ok: (1) Bash: rm -rf .git && git init -q (2) Write tool: a new file prov.txt holding the one line retry=never (3) Bash: git add prov.txt && git -c user.name=live -c user.email=live@example.com commit -m \"Add prov\"" --say "/provenance-widget look prov.txt:1" --say "/provenance-widget scan" --say "/provenance-widget clear" --say "/provenance-widget off" --say "Run this Bash command and answer ok: rm -rf .git prov.txt"`
Two small turns in the factory's scratch project under the factory's own config directory; the person's repositories and saved sessions are never read. The scratch project is made a repository for the run and the last line removes it and the file; the map file lives in the loaded copy of the widget, which the tool deletes. A good run: `look` answers `prov.txt:1 · commit <7 hex> (1 of 1 lines), <today>`, then `You said, on <today>: "Never retry on a 401. Do exactly this…` (the first 240 characters of the prompt) and `Resume: claude --resume <a session id>`; `scan` answers `Read <n> saved sessions of scratch-project: ...` with `1 of 1 commits trace to a conversation.`; `clear` answers `Provenance cleared: 1 commit forgotten for scratch-project.` (more if the scan found the same commit under no other key, never fewer than 1); the store prints `isOn` false. If `look` answers `Not a git repository.` the late look for a repository did not run; if it answers `No conversation on record.`, `ran.text` did not carry the commit line or the prompt arrived with an origin other than `sdk`. The builder logs which and sends the order back to design.
## Cost
No tokens, no model call, nothing added to a prompt. While on: one file read and one `git blame` (2 seconds at most) before an Edit of lines not yet looked up, once the repository has records; one `git log` per recorded commit. `scan` reads up to 40 MB of saved sessions per run. Prompts are kept in plain text, cut to 240 characters, in a file in the plugin's folder, for at most 2,000 commits per repository.
## Acceptance
- A1: on in a repository with no map file the card shows the empty sentences and no note in all three placements; when the worktree list exits non-zero it shows `Not a git repository.` and `Provenance needs git history.`, and `scan` and `look a.ts:1` answer `Not a git repository.`
- A2: `scan` over a saved session holding two prompts, an Edit of `C:\Work\App\src\a.ts` and a Write of `src/b.ts` under the first, an Edit of `a.ts` under the second, then a Bash `git commit` whose result has `[main a1b2c3d] Add retry`, writes one record with `short`, `subject`, the row's time, the file's name as session, and the first prompt for both files; a later PowerShell commit `[detached HEAD 0123abc] Two` in the same file carries only prompts typed after the first commit; the answer and the rest card (`<t> of <n>`, the sentence, the hint) match the stubbed log.
- A3: `scan` skips rows that are `isMeta`, `isSidechain`, start with `<`, carry `origin.kind` `task-notification` or hold a `tool_result` when choosing the prompt, skips a line that is not JSON, ignores a commit line in an `is_error` result and one from a command without `git`, and records a commit that had no prompt before it with empty `asks`.
- A4: `scan` reads folders named `enc(root)` and `enc(root)-sub` for the main root and a second worktree root, reads nothing from a session whose `cwd` is `C:\Work\App-old`, counts a 3,600,000-byte file as too long without reading it, stops after 40,000,000 bytes with `<w> more to read: run scan again.`, and on a second run makes no `fs.read` of a session whose size is unchanged; with `CLAUDE_CONFIG_DIR` unset it lists `<HOME>/.claude/projects`, and with no listing it answers `Could not read <base>.`
- A5: live, a `prompt.submit` from `sdk`, an Edit and a Write that succeed, an Edit that is denied and one with `isError`, then a Bash call whose `text` holds a commit line write one record with `session-1`, the prompt, and only the two successful files, empty `pending`, and take the count again; a second commit with no edit since has empty `asks`; a prompt whose origin is none of the three is not held; each hook resolves to the very object `next` gave.
- A6: with a record whose ask names `src/http/retry.ts`, an Edit whose `old_string` sits on lines 41 to 58 makes exactly one blame, with the argv and options written above, before `next` is called, and the 40-column card shows the note date, `src/http/retry.ts:41-58`, `written after you said:`, the quoted prompt, `a1b2c3d · 14 of 18 lines` and the copy row.
- A7: in a range where an unrecorded commit owns 10 lines and a recorded one owns 8, the recorded one is shown with `8 of 18 lines`; a commit whose hash matches no `short` but whose summary equals `subject` and whose author time is 90 seconds from `at` is traced with `isMoved` true, and at 121 seconds, or with a different summary, it is not.
- A8: the card and the `look` answer take the drawn forms for a record with no ask for that file (`promptless`), for no matching record (`no record`, the commit date and subject row), for a range of only zero-hash lines (`These lines are not committed yet.`), and for a blame that exits 128 or rejects (`no blame`); in each case an Edit still reaches `next` once and resolves to its result.
- A9: no blame is run for an Edit when the repository has no records, when `old_string` is not in the file, when `fs.read` rejects, when the file is outside every root, when the path and first line equal the finding's, or while `isLooking` is true; an `old_string` ending in a newline does not add a line to the range.
- A10: `look src/a.ts:7`, `look C:\Work\App\src\a.ts:7-9` under root `c:/work/app`, and `LOOK src/a.ts:7` each blame the right absolute path and lines and answer the lines written above for a traced finding, with `Matched by subject and time: the commit was rewritten.` when moved; `look ../other/x.ts:1` answers the outside sentence; `look`, `look src/a.ts` and `look a.ts:0` with nothing selected answer the select sentence.
- A11: bare `look` with `$.ui.selection()` answering `{ text: '  src/a.ts:7 \n' }` behaves as `look src/a.ts:7`; with `undefined`, or `{ text: 'hello' }`, it answers the select sentence and runs no blame.
- A12: `copy` on a traced or promptless finding calls `$.ui.copy` with exactly `claude --resume <session>` and answers `Copied: ...`; when `isCopied` is false it answers `Could not copy. Run: claude --resume <session>`; with no finding, or an untraced one, it answers `Nothing to resume: look up a line first.`
- A13: `clear` removes this repository's entry from the map file and leaves another repository's untouched, resets the finding, returns the card to the empty state and answers with the count forgotten; two writes from sessions holding different records for one repository leave both in the file; a 2,001st record drops the oldest; a malformed map file reads as empty and is replaced on the next write.
- A14: while off, `scan`, `look a.ts:1`, `copy` and `clear` answer `Provenance is off.`; a prompt, an Edit, a Write and a Bash commit make no `fs.read`, no `process.run`, no file write and no state; switching off after use resets `run` and `finding`; `provenance`, `scan now` and `copy 1` answer `Usage: /provenance-widget [on|off|scan|look [<path>:<line>]|copy|clear]` and change nothing; no verb switches the widget on.
- A15: at 20, 40 and 60 columns no row of any state breaks the border; under 30 the narrow forms drawn are used and there is no note; a 300-character prompt is stored as at most 240 characters ending `…` at a word, and drawn on 4 rows ending `…"`; a long path keeps its file name and lines behind a leading `…`; and in a session that starts outside a repository, a commit line seen after `git init` makes the worktree list run again and the record is written.
## widget.json
- title: `Provenance`
- category: `Project and git`
- shows: `The conversation behind a line of code: for lines Claude is about to edit, or a path:line you ask about, the prompt you typed before they were written and the command that resumes that session`
- commands: `/provenance-widget [on|off|scan|look [<path>:<line>]|copy|clear]`
- cost: `One git blame before an edit; keeps your prompts, cut to 240 characters, in a file in the plugin's folder; scan reads up to 40 MB of saved sessions`
