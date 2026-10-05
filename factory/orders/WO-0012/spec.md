# Ledger (`ledger-widget`)
## Purpose
For anyone who pays for Claude Code by use and wants to know what one project has cost, not one session. The card holds a single figure for the project: every session's cost, whichever folder or git worktree of the project it ran in. It moves as each turn ends, and `scan` adds the sessions Claude Code saved before the widget was on. Every dollar on it is Claude Code's own figure, the session's running cost or the cost record in a saved session. Nothing is estimated from tokens: a session with no figure is counted as such, never priced.
## What is dropped from the earlier version
The second `/ledger` command, budgets and their prompt context, prices fitted from token counts, `awk`, the tables by branch, day, session and all projects, the clipboard copy, `stop` and the `isCounting` store key. Counting now follows the switch: off counts nothing.
## The project
`open($)` runs at `session.start` when the switch is restored on, and when a command switches it on; it runs once per session.
- `root = await $.session.root()`. Then `$.process.run(['git', '--no-optional-locks', 'worktree', 'list', '--porcelain'], { cwd: root, timeoutMs: 3000 })`. The paths after `worktree ` on its lines, in order, are the project's `roots`; the first is the main worktree. A rejection, a non-zero exit, `isStdoutTruncated` or no such line: `roots` is `[root]`.
- `key` is `folder(roots[0])` (from `lib.ts`). `name` is the last segment of `roots[0]`, as written. `id` is `await $.session.id()`, `''` when it rejects.
- A folder `cwd` is in the project when `folder(cwd)` equals `folder(r)` or starts with `folder(r) + '/'` for some `r` of `roots`.
## One figure per session
A session has one cost, the highest figure seen for it from either source, so a session that was both measured and saved is counted once.
- **Measured**: at a main-loop turn end, `(await $.session.usage()).cost?.usd`, the session's running total. `usd` becomes `max(kept ?? 0, that)`.
- **Saved**: the last line of the session's file that contains `"type":"cost-state"` and parses as JSON with a finite `totalCostUSD` of 0 or more. `usd` becomes `max(kept ?? 0, that)`; with no such line `usd` stays as it was (`null` for a session never measured).
## Scan
`base` is `<CLAUDE_CONFIG_DIR>/projects` when `$.env.get('CLAUDE_CONFIG_DIR')` answers, else `<home>/.claude/projects` with `home` from `HOME`, then `USERPROFILE`. A folder of `base` is a candidate when its lower-cased name equals `enc(r)` or starts with `enc(r) + '-'` for some `r` of `roots`, `enc(path) = path.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()`; the name is exact in the first case. In each candidate, every entry of kind `file` ending in `.jsonl` is a session, its id the name without `.jsonl`. Subfolders are not entered: a subagent's cost is in its session's record.
- Skipped: a session whose entry has the listed `size`.
- Long: a `size` over 3,500,000 is not read (one read cannot hold it). In an exact folder it gets `{ usd: kept ?? null, at: kept ?? mtimeMs, size, isOurs: true }`; in any other folder it is left alone.
- The rest are read newest first by `mtimeMs`, until the sizes read in this scan would pass 40,000,000 (the first is always read); those not reached are `waiting`. A read that rejects is left alone.
- A read file's `cwd` is that of its first line that contains `"cwd"` and parses with a string `cwd`; `start` is that line's `Date.parse(timestamp)`, or `mtimeMs`. No such line, or a `cwd` outside the project (`-work-project-old` beside `-work-project`): `{ usd: null, at: mtimeMs, size, isOurs: false }`, kept only so the file is not read again. Otherwise `{ usd, at: min(kept at, start), size, isOurs: true }`.
- The file is loaded before the scan and written once after it, with `scannedAt` set to now.
## Card
Title `Ledger`, note `name` (the card cuts a long note). Counted: entries with `isOurs` and a number for `usd`; unpriced: `isOurs` and `usd` null. `total` is the sum of the counted, `since` the least `at` of the counted, `mine` the `usd` of entry `id` or 0. Money is `$` and two decimals under 100, else whole dollars with thousands commas (`$1,204`). Dates are local, `3 Sep 2025`. Inner width is the card width less 4: long rows at 36 or more, short below. Every row is one line (`wrap="truncate-end"`); the empty sentences wrap by words.
- Row `total`: long, bold total and at the right a dim `plural(counted, 'session')`; short, the bold total, then a row `plural(counted, 'session')`.
- Row `mine`: long `this session <money>` and at the right a dim `since <date>`; short `now <money>`.
- Row `unpriced`, when there are any: dim, long `<n> without a cost record`, short `<n> no record`.
- Last row: yellow `fault` when a scan failed (long `Saved sessions could not be read`, short `scan failed`); else, while `scannedAt` is 0, a dim hint (long `/ledger-widget scan adds saved ones`, short `scan adds more`); else none.
```
Empty: on, the project has no entry with isOurs. The fault row follows when set.
│ Ledger                       project │
│ Nothing counted yet.                 │
│ Each turn's cost is added here.      │
│ /ledger-widget scan adds this        │
│ project's saved sessions.            │
Working: one turn measured, never scanned.
│ Ledger                       project │
│ $0.44                      1 session │
│ this session $0.44  since 4 Oct 2026 │
│ /ledger-widget scan adds saved ones  │
Best moment: after a scan, from a worktree of the project.
│ Ledger           claude-code-widgets │
│ $212                     31 sessions │
│ this session $0.44  since 3 Sep 2025 │
│ 3 without a cost record              │
Error: the scan could not list the saved sessions; what was counted stays.
│ Ledger                       project │
│ $0.44                      1 session │
│ this session $0.44  since 4 Oct 2026 │
│ Saved sessions could not be read     │
Busiest at 20 columns.
│ Ledger claude-c… │
│ $1,204           │
│ 131 sessions     │
│ now $12.40       │
│ 12 no record     │
│ scan failed      │
```
## Commands
One command; `argumentHint` and usage `[on|off|scan|show|clear]`. The argument is trimmed and lower-cased.
- bare, `on`, `off`: the switch. On: `Ledger on; /widgets places it.` Off: `Ledger off.` Unknown: `Usage: /ledger-widget [on|off|scan|show|clear]`, nothing changed.
- `scan`: reads the saved sessions as above and answers `Read <plural(read, 'saved session')> of <name>.`, then the summary line, then `<n> more to read: run scan again.` when any wait. Summary line: `<total> over <plural(counted, 'session')> since <date>.`, plus ` <n> without a cost record.` when any; with none counted, `Nothing counted yet for <name>.` Faults, each setting `fault` and changing nothing else: no `base`, `Could not find where sessions are saved.`; `$.fs.list(base)` rejects, `Could not read <base>.` A scan that lists `base` clears `fault`.
- `show`: `<name> (<roots[0]>)`, the summary line, `This session: <money>`, and `Saved sessions not read yet: /ledger-widget scan` while `scannedAt` is 0. Reads the file first.
- `clear`: removes this project's record from the file, other projects untouched; the card returns to empty with its hint. Answers `Ledger cleared for <name>.`
- While off, `scan`, `show` and `clear` answer `Ledger is off.` and do nothing.
## Data
- `on('session.start')`: nothing of `e`. Registers the command, restores `isOn`; only when on, `open($)` and one read of the file.
- `on('command.run', { command: 'ledger-widget' })`: `e.args`.
- `on('turn.complete')`: `e.agentId` only. `const done = await next(e)`, returned unchanged always. Off, an `agentId`, or `id === ''`: nothing more. Else one `$.session.usage()`; when it rejects or `cost?.usd` is not a finite number, nothing more. Else the file is read, entry `id` becomes `{ usd: max, at: kept ?? now, size: kept ?? 0, isOurs: true }`, the file is written and `view` updated from what was read, so a turn end also picks up what other sessions wrote. Aborted and failed turns are measured too: they cost.
- `$.session.root()`, `$.session.id()`, `$.process.run` (git): once per session, in `open`. `$.env.get`, `$.fs.list` (once for `base`, once per candidate folder), `$.fs.read` (once per session file read): per `scan` only. `$.clock.now()`: once per measured turn and per scan; drawing the card needs no clock. `$.fs.read`/`$.fs.write` of the ledger file: per measured turn, `scan`, `show`, `clear`; a write that rejects is ignored.
- `$.store.get`, `$.store.set`, `$.command.register`, `$.state`, `$.widgets.card`, the three `on('ui.render')` hooks, `fit()`, `plural()`, `folder()`. No timer (no `sync`), no `prompt.submit`, no model call, no toast.
- Names: the events `session.start`, `command.run`, `turn.complete`, `ui.render` pass `claude plugin validate`. The types file (`plugins/*/.claude-plugin/types/claude-code/index.d.ts`) is not generated on this machine, so the call names are those of shipped widgets whose tests pass: `$.session.usage` (usage), `$.session.root` (diff), `$.session.id`, `$.env.get`, `$.fs.list` and `FsEntry` `{ name, kind, size, mtimeMs }` (collision), `$.process.run` with `{ cwd, timeoutMs }` and `isStdoutTruncated` (stakes), `$.plugin.root` (pet). The builder checks each against the types before use.
## State and storage
- `$.state` `isOn: boolean`.
- `$.state` `view: LedgerView = { key: string; name: string; roots: string[]; id: string; sessions: Record<string, LedgerEntry>; scannedAt: number; fault: boolean }`; `key: ''` before `open`. `LedgerEntry = { usd: number | null; at: number; size: number; isOurs: boolean }`.
- `$.store` `isOn: boolean`, the only key.
- File `${$.plugin.root}/ledger.json`: `{ projects: Record<string, { sessions: Record<string, LedgerEntry>; scannedAt: number }> }`, keyed by `key`. Missing or unparseable reads as `{ projects: {} }`. It is a file because sessions of one project run side by side. Entries are not capped (about 70 bytes a session); `clear` empties a project. If a plugin update replaces the folder, `scan` rebuilds every closed session.
## Off
No card. `session.start` registers the command and reads `isOn`: no git, no file read. `turn.complete` returns `next(e)` and calls nothing. No file or store write. The verbs answer `Ledger is off.` Switching off writes only `isOn`; `view` stays, so a switch-on in the same session shows the card again without a second `open`.
## Demo
Opening line `scan`, with stand-ins the engine lacks: three files in `/demo/home/.claude/projects/-demo-project/`, each a first line `{"cwd":"/demo/project","timestamp":"<12, 5 and 1 days ago>"}` and a last line `{"type":"cost-state","totalCostUSD":<3.10, 2.75, 1.42>}`. The engine's git answers exit 1 to `worktree`, so the project is its session root and the note is `project`; `env.get('HOME')` is `/demo/home`. At rest: `$7.27`, `3 sessions`, `this session $0.00`, `since <12 days ago>`, no hint. After the scripted turn (the engine's cost is 0.44): `$7.71`, `4 sessions`, `this session $0.44`.
## Live
`bun factory/tools/live.ts factory/floor/plugins/ledger-widget --say "/ledger-widget on" --say "Reply with the one word: ok" --say "/ledger-widget scan" --say "/ledger-widget show" --say "/ledger-widget off"`
A good run: `scan` answers `Read <n> saved sessions of scratch-project.` and a summary whose total is above `$0.00` over at least 1 session (earlier live runs saved under the factory's own config directory add to it); `show` prints `scratch-project (...)`, the same summary and `This session:` with a figure above `$0.00`. The store prints `isOn` false and no other key. The ledger file goes with the run's copy of the plugin.
## Cost
None: no tokens, no model call, nothing added to a prompt.
## Acceptance
How the tests prove these: `session.usage`, `session.id`, `session.root`, `process.run`, `env.get` and `fs.list` are given through `ground()`'s `answers`, each recording its calls; session files and the ledger file through `files`; a test's own `on('fs.read', ...)` counts reads. Turns end through `$.turn.complete({ answer, durationMs, isAborted, turnId, reason })`.
- A1: on with no record, the card shows `Nothing counted yet.` and the two sentences, the note is the project's name, and no fault row; a switch restored from the store at `session.start` gives the same card after one git run and one read of the file.
- A2: a turn ending with a cost of 0.38 gives `$0.38`, `1 session`, `this session $0.38`, `since <today>` and the hint; `ledger.json` holds `{ usd: 0.38, at: now, size: 0, isOurs: true }` under the project key and session id; `turn.complete` resolves to what `next(e)` returned. A second turn at 0.50 gives `$0.50`, and a third reading 0.10 leaves `$0.50`.
- A3: a turn with an `agentId`, a `session.usage` that rejects, one with no `cost`, and a session whose `session.id` rejects each write nothing and leave the card as it was; a turn with `isAborted: true` and one with `reason: 'error'` are measured.
- A4: with git listing `/work/project` then `/work/project-fix` and the session rooted in the second, the key is `/work/project` and the note `project`; `C:\Work\Project` and `c:/work/project` give one key; git exiting 1, rejecting, truncated or printing no `worktree` line each fall back to `$.session.root()`.
- A5: `scan` over folders `-work-project`, `-work-project-src` (cwd `/work/project/src`), `-work-project-fix` (a listed worktree), `-work-project-old` (cwd `/work/project-old`) and `-work-other` sums the first three, makes no list of the last, leaves the fourth out of every figure, and answers `Read 4 saved sessions of project.` with the summary line; in a file with two cost records the last counts; `since` is the earliest first timestamp.
- A6: a session measured at 0.38 whose saved file records 0.30 counts 0.38 once; one recording 0.90 counts 0.90 once; the session count is 1 in both.
- A7: a file with no cost record, and one whose only `cost-state` line is not JSON or has a negative or non-numeric `totalCostUSD`, each add to `<n> without a cost record` and to neither the total nor the session count; a file with no `cwd` line is left out; a subfolder's `subagents/*.jsonl` is never listed; an unpriced session that is then measured leaves the row and joins the count.
- A8: a 4,000,000-byte file is never read: in `-work-project` it is unpriced, in `-work-project-src` it is absent. A second `scan` reads only the file whose size changed, the left-out `-work-project-old` file included among those skipped. With 30 files of 3,000,000 bytes, one `scan` reads the 13 newest and answers `17 more to read: run scan again.`, and two more scans read the rest.
- A9: with no `CLAUDE_CONFIG_DIR`, `HOME` or `USERPROFILE`, `scan` answers `Could not find where sessions are saved.`; with `fs.list` of the base rejecting, `Could not read <base>.`; either shows the fault row under an unchanged total, and under the empty sentences when nothing is counted; a later good scan removes it. The base is `<CLAUDE_CONFIG_DIR>/projects` when set, else `<HOME>/.claude/projects`, else from `USERPROFILE`.
- A10: `show` answers the name and main root, `Nothing counted yet for project.`, `This session: $0.00` and the not-read-yet line before anything; after A5 with one unpriced file, `<total> over 3 sessions since <date>. 1 without a cost record.` and no not-read-yet line.
- A11: `clear` answers `Ledger cleared for project.`, the card returns to empty with scanning to be done again, and another project's record in the file is byte for byte what it was.
- A12: while off, `session.start` runs no process and reads no file; a turn end makes no `session.usage` call and no write; `scan`, `show` and `clear` answer `Ledger is off.`, leave the switch off and call no `fs`, `env` or `process`; off after a measured turn draws no card, and on again shows the same rows with no second git run.
- A13: an unknown verb answers `Usage: /ledger-widget [on|off|scan|show|clear]` and changes nothing; `SCAN` works as `scan`.
- A14: when another session's entry is written into `ledger.json` between two of this session's turns, the second turn end shows both in the total and the count, and the written file still holds the other entry.
- A15: at 20 and 39 columns the rows are the short forms in the order total, sessions, `now`, `<n> no record`, then `scan failed` or `scan adds more`, each one line; at 40 and 60 the long forms; 1204.4 is `$1,204`, 99.5 is `$99.50`, 0 is `$0.00`; a 30-character project name does not break the title row; the card is the same in the `side`, `above` and `below` placements.
## widget.json
- title: `Ledger`
- category: `Project and git`
- shows: `What a project has cost across every session, from any folder or worktree in it: measured as each turn ends, and read back from the sessions Claude Code saved`
- commands: `/ledger-widget [on|off|scan|show|clear]`
- cost: empty
