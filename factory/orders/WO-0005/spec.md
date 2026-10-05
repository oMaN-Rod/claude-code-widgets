# Stakes (`stakes-widget`)
## Purpose
For anyone who answers permission dialogs alone and fast. When Claude asks to run a destructive Bash command, the dialog shows only the command text. While on, Stakes measures what a yes would lose (files not in git, unstaged changes, commits on no remote), writes it as one line under that dialog, and keeps the last five verdicts on its card. It never denies, rewrites or forces an ask, and it says `Could not measure` rather than guess.
## What is cut from the idea
`git branch -D` and `git stash drop|clear` (five shapes, not seven); chains, `cd` prefixes and quoting (one plain command only); `$.fs` counting (git counts for `rm`, so `rm` outside a repository is unmeasured); the PowerShell tool (`Remove-Item`, `del` are not read); any record of auto-allowed calls.
## Route (`tool.check` hook, matcher `{ tool: 'Bash' }`)
- `const verdict = await next(e)`, with `e` as received; the hook always returns `verdict` itself, the same object. A throw from `next(e)` is not caught.
- Nothing more happens when the widget is off, `e.tool_use_id === undefined` (a `$.tool.check` query), `verdict.decision !== 'ask'`, `(e.input as { command?: unknown }).command` is not a string, or the command is not a candidate.
- Otherwise: measure, call `$.ui.notice(e.tool_use_id, line)` inside a `try` (a refusal is swallowed), prepend the verdict to `log`, return `verdict`. The call is open here: `tool.check` fires inside the `tool.call` dispatch, before the mode settles the ask.
- Candidate: the command matches `/(^|[\s;&|(])(rm|git\s+(reset|clean|checkout|restore|push))(\s|$)/`.
- Plain: every character is in `[A-Za-z0-9 ._/@^~:=,+-]` and no word starts with `~`. Words are the command split on runs of spaces. A candidate that is not plain, or whose first word is not `git` or `rm`: `Could not measure: not a plain command`.
- A plain candidate that is a harmless form (below) is silent: no probe, no line, no log entry.
## Shapes, probes and lines
Every probe is `$.process.run(['git', '--no-optional-locks', ...], { timeoutMs: 1000 })`, never through a shell and never a fetch. It runs in the session's working directory until a `classic.CwdChanged` event arrives while on; from then every probe also carries `cwd: $.state.cwd`, the shell's own directory, so a relative path is measured where the command will run. The probes of one command run together unless one needs another's answer, so the dialog waits two seconds at most. `count` is the number of non-empty lines of `stdout` (of NUL-separated items under `-z`). Counts are written with `plural()`.
1. `git reset --hard [<ref>]`, nothing else. Harmless: `reset` without `--hard`. Probes: `status --porcelain` (F = lines not starting `??`); with a ref, `rev-list --count <ref>..HEAD` (N) and `rev-list --count <ref>..HEAD --not --remotes` (M). Line: `Loses changes in 4 files and 3 commits (2 on no remote)`; a zero part is left out; both zero: `Nothing lost: no commits dropped and the tree is clean`.
2. `git clean <options> [-- <paths>]`, options single-dash clusters of `f d x X q n`. Harmless: no `f`, or an `n`. Probe: `clean -n` followed by the command's own words after `clean` (P = lines starting `Would remove `). Line: `Deletes 9 untracked paths, none recoverable`; zero: `Nothing lost: nothing to clean`.
3. `git checkout -- <paths>`, `git checkout .`, `git restore <paths>` (`--` allowed, no other option). Harmless: `git checkout <anything else>` without `--`. Probe: `diff --name-only -- <paths>` (F). Line: `Loses unstaged changes in 4 files`; zero: `Nothing lost: no unstaged changes there`.
4. `git push` with `-f`, `--force` or `--force-with-lease`, then nothing or `<remote> <branch>`. Harmless: `push` with none of the three. With nothing: `rev-parse --abbrev-ref @{upstream}` names the target T, then `rev-list --count HEAD..T` (N). With both: T is `<remote>/<branch>`, probe `rev-list --count <branch>..T`. Line: `Overwrites 2 commits on origin/main, as of last fetch`; zero: `Nothing lost: origin/main has nothing new, as of last fetch`.
5. `rm <options> <paths>`, options single-dash clusters of `r R f v`, `--` allowed, at least one path. `unrecognised form`, with no `ls-files` probe: a path that is empty, `.` or `/`, has a `..` or `.git` segment, or is absolute (`/...`, `/c/...`, `C:/...`) and not strictly below the answer of `rev-parse --show-toplevel` (compared without case, `/c/` read as `c:/`). An absolute path below it is handed to git as that answer's own text plus the part below it (`C:/w/repo/src`, never `/c/w/repo/src`). Probes, together: `ls-files -z --others -- <paths>` (U, ignored files included), `ls-files -z -m -- <paths>` (M), `ls-files -z -s -- <paths>` (T), `ls-files -z --cached --others --error-unmatch -- <paths>` (E, only its exit code is read). Line: `Loses 9 files not in git and unstaged changes in 2 files; deletes 212 in all` (212 is U + T; a zero part is left out); U and M zero: `Nothing lost: all 212 files are in git, unchanged`.
   - E exits 1 when any one path matches nothing git lists: the path is absent, an empty folder, spelled in another case than git holds, or inside a nested repository or worktree. Git cannot tell these apart, so the line is `Could not measure: git sees no files there`, whatever the other paths count. There is no `Nothing lost: no files there`. Any other non-zero exit of E is `git could not answer`.
   - A U entry that ends in `/` (a nested repository or worktree, listed as one entry) or a T entry whose mode is `160000` (a submodule) gives `Could not measure: holds another repository`. Order of the checks: E, then this, then the counts.
`Could not measure:` reasons, a closed list: `not a plain command`; `unrecognised form` (a candidate that is plain and matches neither a shape nor a harmless form: another option, `push` with a remote and no branch); `git sees no files there` and `holds another repository` (shape 5 only); `git could not answer` (any other probe exit that is not zero, or a count that is not a number); `took too long` (any probe rejects); `too many files to count` (`isStdoutTruncated`). `Nothing lost` is written only when every probe of the shape exited 0 untruncated.
## Card
Title `Stakes`. Note: the kind of the latest verdict, `loss`, `safe` or `unmeasured`; none when empty. The latest verdict is its command on one row (`wrap="truncate-end"`) and its line beneath, which wraps. Up to four earlier verdicts follow, one truncated row each: a mark (`!` red for loss, `·` dim for safe, `?` yellow for unmeasured), a space, the command. The same wording at every width.
```
Empty: `log` is empty. No note.
│ Stakes                               │
│ No destructive command asked yet.    │
│ When Claude asks to run one, what a  │
│ yes would lose shows in the dialog.  │
Working: latest is `Nothing lost`. Note `safe`.
│ Stakes                          safe │
│ git checkout .                       │
│ Nothing lost: no unstaged changes    │
│ there                                │
Best moment: latest is a loss. Note `loss`.
│ Stakes                          loss │
│ git reset --hard HEAD~3              │
│ Loses changes in 4 files and 3       │
│ commits (2 on no remote)             │
│ ! rm -r build tmp                    │
│ · git checkout .                     │
│ ? git clean -fdx                     │
Error: latest is unmeasured. Note `unmeasured`.
│ Stakes                    unmeasured │
│ rm -rf $OUT/*                        │
│ Could not measure: not a plain       │
│ command                              │
Busiest at 20 columns: the best moment.
│ Stakes      loss │
│ git reset --har… │
│ Loses changes in │
│ 4 files and 3    │
│ commits (2 on no │
│ remote)          │
│ ! rm -r build t… │
│ · git checkout . │
│ ? git clean -fdx │
```
## Commands
- `/stakes-widget`, `on`, `off`: the switch, with the template's answers. Unknown: `Usage: /stakes-widget [on|off|clear]`, nothing changed. `argumentHint` `[on|off|clear]`.
- `clear`: empties `log`, answers `Stakes cleared.`; the card returns to empty. Off: `Stakes is off.`, nothing changed.
- No second command and no tool.
## Data
- `on('tool.check', { tool: 'Bash' })`: reads `e.input`, `e.tool_use_id` and the `decision` of `next(e)` (`ToolCheckResult`). Once per Bash permission check; probes only on an `ask` for a measurable candidate.
- `$.process.run(argv, { timeoutMs, cwd? })`: one to five read-only git probes per measured command; reads `exitCode`, `stdout`, `isStdoutTruncated`.
- `on('classic.CwdChanged')`: while on, sets `$.state.cwd = e.new_cwd`; always returns `next(e)`. Once per `cd` the shell keeps.
- `$.ui.notice(tool_use_id, text)`: once per measured or unmeasured candidate. Core removes the line when the call resolves; the widget never removes it.
- `on('session.start')`, `on('command.run', { command: 'stakes-widget' })`, the three `on('ui.render')` hooks, `$.command.register`, `$.store.get`, `$.store.set`, `$.widgets.card`: from the template.
- No `$.tool.check` query, no `tool.call` hook, no `$.fs`, no `$.clock`.
## State and storage
- `$.state` `isOn: boolean`.
- `$.state` `cwd: string | undefined`: the latest `new_cwd` seen while on; set back to `undefined` when the widget is switched off. `clear` leaves it.
- `$.state` `log: { command: string; line: string; kind: 'loss' | 'safe' | 'unmeasured' }[]`, newest first, at most 5; `command` is the trimmed command's first 80 characters.
- `$.store` `isOn`. No files, no timers (no `sync`). Verdicts are not kept across sessions.
## Off
The `tool.check` hook returns `next(e)` at once: no parsing, no probe, no notice, no log entry. The `classic.CwdChanged` hook returns `next(e)` at once and records nothing. No card. `clear` answers `Stakes is off.` Switching off leaves `log` as it was and forgets `cwd`; nothing is added while off. Known limit, for the README row: a `cd` made while off is seen only if the host's default directory follows the shell.
## Demo
The demo engine's `tool.check` bottom always answers `allow`, it has no `$.ui.notice`, and its `git diff` stub answers a whole diff. Stand-ins needed: a no-op `ui.notice`; `git diff --name-only` answering `src/sum.js\n`; and one scripted Bash call, `git checkout -- src/sum.js`, whose check answers `{ decision: 'ask' }`. At rest: the empty card. After the scripted turn: note `loss`, the row `git checkout -- src/sum.js`, the line `Loses unstaged changes in 1 file`.
## Cost
None: no model call and nothing added to a prompt. Up to five git probes, two seconds at most, before a dialog that then waits on the person.
## Acceptance
How the tests prove these: a stand-in plugin listed after the widget answers `tool.check` with `{ decision: 'ask' }` (or `allow`, `deny`); `ground()` is given `answers` for `process.run` (keyed on `argv`, recording every call) and for `ui.notice` (recording `{ tool_use_id, text }`). Checks are raised as the kit's `turn()` raises them, with a `tool_use_id`.
- A1: on with no check yet, and on after an asked `npm test`, the card shows `No destructive command asked yet.` and what will appear, with no note; a restored switch at `session.start` gives the same card.
- A2: an asked `git reset --hard HEAD~3` with probes answering 4 changed files (plus two `??` lines), 3 commits and 2 on no remote gives the notice `Loses changes in 4 files and 3 commits (2 on no remote)` under that `tool_use_id` and the card's best moment with the note `loss`; with no ref only `status` is probed; all zero gives `Nothing lost: no commits dropped and the tree is clean` and the note `safe`; one file reads `1 file`.
- A3: an asked `git clean -fdx` probes `clean -n -fdx` and gives `Deletes 9 untracked paths, none recoverable`, or `Nothing lost: nothing to clean` for no `Would remove` line; `git clean -n` and `git clean -d` are silent.
- A4: asked `git checkout -- src a.js`, `git checkout .` and `git restore src` each probe `diff --name-only --` with those paths and give `Loses unstaged changes in 4 files` or `Nothing lost: no unstaged changes there`; `git checkout main` is silent; `git restore --staged src` is `Could not measure: unrecognised form`.
- A5: an asked `git push --force` (also `-f`, `--force-with-lease`) resolves the upstream then counts, giving `Overwrites 2 commits on origin/main, as of last fetch` or `Nothing lost: origin/main has nothing new, as of last fetch`; `git push -f origin main` probes `rev-list --count main..origin/main`; `git push` is silent; `git push -f origin` is `unrecognised form`; no probe's argv contains `fetch`.
- A6: an asked `rm -rf build tmp` with U 9, M 2, T 203 and E exiting 0 gives `Loses 9 files not in git and unstaged changes in 2 files; deletes 212 in all`; U only and M only each leave the other part out; U and M zero gives `Nothing lost: all 203 files are in git, unchanged`; E exiting 1 gives `Could not measure: git sees no files there` both when U and T are empty (`rm -rf SRC`, `rm -rf nested/extra.txt`) and when another path counts files (`rm -rf SRC build`), and no input gives a line containing `no files there` after `Nothing lost`; `rm -i x`, `rm -rf .git`, `rm -rf src/..` and an absolute path at or outside the top level are `unrecognised form` with no `ls-files` probe; `rm -rf /c/w/repo/src` with the top level `C:/w/repo` probes `C:/w/repo/src` and no argv holds `/c/`.
- A7: asked `rm -rf $OUT/*`, `cd build && rm -rf x`, `rm -rf "my dir"`, `rm -rf ~/x`, `sudo rm -rf x` and `git status | xargs rm` each give `Could not measure: not a plain command` with the note `unmeasured`, and run no probe.
- A8: a probe that exits non-zero (E exiting 128 included) gives `Could not measure: git could not answer`; one that rejects gives `Could not measure: took too long`; one with `isStdoutTruncated` gives `Could not measure: too many files to count`; `rm -rf nested` with U answering `nested/`, and `rm -rf sm` with T answering a `160000` entry, each give `Could not measure: holds another repository`; in each case the note is `unmeasured` and no `Nothing lost` or `Loses` is written even when the other probes answer zero.
- A9: for every case of A2 to A8 the hook calls `next` with the `e` it received and returns the very object `next(e)` resolved to, `ask` unchanged, with core's `reason` untouched; a throw from `next(e)` reaches the caller and changes nothing; a `ui.notice` that throws still returns the verdict and records the entry.
- A10: a measurable command whose check answers `allow` or `deny`, and a check with no `tool_use_id`, run no probe, raise no notice and leave the card as it was.
- A11: every probe's argv starts `git`, `--no-optional-locks`, carries `timeoutMs: 1000`, and passes the command's paths and refs as separate arguments, never a shell string; before any `classic.CwdChanged` no probe carries `cwd`, after one with `new_cwd` `/w/repo/packages/a` every probe of an asked `rm -rf dist` and `git checkout .` carries that `cwd`, the hook returns what `next(e)` returns, and one raised while off, or before an `off` then `on`, leaves the probes without `cwd`; a non-Bash tool whose input holds `rm -rf x` is never read.
- A12: after six asked candidates the card shows the latest in full and the four before it as rows, newest first, marked `!`, `·` or `?` by kind, the oldest gone; a 300-character command is one truncated row.
- A13: `clear` after verdicts answers `Stakes cleared.` and the card is the empty card; while off, `clear` answers `Stakes is off.` and writes nothing; an unknown verb answers `Usage: /stakes-widget [on|off|clear]` and changes neither the switch nor the log.
- A14: while off, an asked `git reset --hard` returns exactly what `next(e)` returns with no probe and no notice, and after switching on the card is empty.
- A15: every state (empty, safe, best moment with four rows, unmeasured) at 20, 40 and 60 columns keeps each command row to one truncated line and wraps the verdict line inside the border; the card is the same in the `side`, `above` and `below` placements and absent from the two the layout's `site` does not name.
## widget.json
- title: `Stakes`
- category: `Project and git`
- shows: `What a yes would lose, measured from git and written under the permission dialog for a destructive command`
- commands: `/stakes-widget [on|off|clear]`
- cost: empty
