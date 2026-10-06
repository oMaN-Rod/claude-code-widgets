# Last green (`green-widget`)
## Purpose
For anyone who has said "it worked a minute ago". Each time a test, lint or build command passes, the whole working tree (tracked and untracked files, everything `.gitignore` does not hide) is kept as a hidden git commit named after that command. When the same command later fails, the card states what changed in the tree since it last passed, and `tell` hands Claude that list so it debugs the delta and not the codebase. No model call; the claim is checkable with `git diff <sha>`. Settled, with the reason:
- No `restore` verb. A whole-tree restore that is exactly undoable must delete files, and the widget cannot prove that safe; the card and `tell` carry the idea, and `tell` names the commit, so Claude or the person restores single files through the normal permission prompt.
- A green belongs to a command: one ref per normalized command and working tree, `refs/widgets/green/<wt>/<cmd>` (`wt` is `hash(folder(top)).toString(36)`, `cmd` is `hash(command).toString(36)`), so worktrees sharing one ref store never collide. One snapshot per command (a new green replaces it), at most 8 per tree.
- A wrong green is worse than no green, so only plain commands count (rule under Data), and the snapshot is awaited before the Bash result is handed on: a snapshot taken after the next edit would be a false green. The wait is bounded (10 s, once: see the fault).
- The person's index, HEAD, branch and stash are never touched: git writes to its own index file under `$.plugin.root`, kept between snapshots so only changed files are hashed again. The first snapshot in a tree hashes every unignored file once.
- A snapshot is right mid-rebase, in a shallow clone and in a worktree, so none of those is special. A bare repository has no top level and reads as no repository. A submodule counts as the commit it is at. Ignored files (`node_modules`, build output, `.env`) are not in the snapshot, and the card says so when a check goes red with the tree unchanged.
## Card
Title `Last green`. Note at 30 columns and wider: `all green`, `plural(n, 'red')` shortened to `<n> red`, `error` (a fault wins); under 30 only `<n> red` or `error`. Rows: red commands that have a green (latest red first), red commands never green, then green ones (latest first); at most 3 command rows. Under the first row, when it is red with a green: the since line, at most 2 files (most lines changed first), then dim `… <k> more in tell` (`… <k> more` under 30). A command is cut at its end with `…`, a path at its front with `…`; the fact at the right is always whole. Under 30 an age is `span()` up to its first space and `never green` is `never`. Sentences wrap.
```
Empty: on, in a repository, no check has run.
│ Last green                           │
│ No green yet. The next passing test, │
│ lint or build is kept as a hidden    │
│ git snapshot of the tree.            │
Outside a repository: nothing else runs.
│ Last green                           │
│ Not in a git repository. Nothing is  │
│ kept here.                           │
Working: every known check passed last time.
│ Last green                 all green │
│ ✓ bun run lint            3m 10s ago │
│ ✓ bun test               14m 05s ago │
Best moment: a check with a green goes red.
│ Last green                     1 red │
│ ✗ bun test         green 14m 05s ago │
│ since green: 6 files, +120 -31       │
│   src/parser.ts              +80 -12 │
│   src/lexer.ts               +31 -19 │
│   … 4 more in tell                   │
│ ✗ bun run build          never green │
│ ✓ bun run lint            3m 10s ago │
Red with nothing changed in the snapshot.
│ Last green                     1 red │
│ ✗ bun test         green 14m 05s ago │
│ since green: the tree is unchanged   │
│   ignored files are not compared     │
Error: a snapshot failed (the sentence is the last row).
│ Last green                     error │
│ ✓ bun test               14m 05s ago │
│ No snapshot: git took over 10s.      │
│ Paused until /green-widget clear.    │
Busiest at 20 columns:
│ Last green 1 red │
│ ✗ bun test   14m │
│ 6 files +120 -31 │
│  …ser.ts +80 -12 │
│  …xer.ts +31 -19 │
│  … 4 more        │
│ ✗ bun run… never │
│ ✓ bun run li… 3m │
```
Under 30 the since line is `<n> files +a -r`, or `tree unchanged` with no second line. The other fault sentence is `No snapshot: <first line of git's stderr>`, cut with `…` after two rows; it has no `Paused` line.
## Commands
`/green-widget [on|off|tell|clear]`, verb matched without regard to case. Bare, `on`, `off` and the usage as in the template (`Last green on; /widgets places it.`, `Last green off.`). No second command, no tool.
- `tell`: takes the card's first row. If it is red with a green and files changed, it calls `$.prompt.fill({ text })` (the person reads it and sends it; `fill`, not `submit`, because a prompt is theirs to spend) and answers `Filled the prompt with what changed since <command> was green.`; when `isFilled` is false it answers with the text itself. The text, four paragraphs:
  1. `` `<command>` passed <span> ago and fails now. The tree as it was when it passed is the git commit <first 12 of sha> (<ref>). ``
  2. `At the failing run <span> ago, <plural files> had changed since then, +<a> -<r>:` then one line per held file `<path> +<a> -<r>` (at most 20, most lines changed first), then `and <k> more` when cut.
  3. `` Read a file's hunks with `git diff <first 12 of sha> -- <path>`. A file listed here that the diff does not show is new since green: read it whole. Ignored files are not in the snapshot. ``
  4. `` Find which of these changes broke `<command>` before looking anywhere else. ``
  Otherwise no fill: nothing red answers `Nothing is red.`; a first row never green answers `<command> has never been green here: nothing to compare.`; an unchanged tree answers `Nothing in the snapshot changed since <command> was green. Ignored files are not compared.`
- `clear`: lists `refs/widgets/green/` (every tree of this repository), deletes each ref, empties the widget's index file, resets `runs`, `fault` and the pause, answers `Last green cleared: <plural snapshots> deleted.` Outside a repository: `Not in a git repository.`
- While off, `tell` and `clear` answer `Last green is off.` and run no git.
## Data
Verified in `plugin-authoring/types/claude-code.d.ts` (2.1.289). Every git run is `$.process.run(['git', '--no-optional-locks', ...], { cwd, env, timeoutMs })` ("no shell", "Git runs with repo hooks off", "Rejects when the command cannot start or is still running then"); `GIT_MS` 5 s, `SNAP_MS` 10 s for `add`.
- `on('tool.call', { tool: 'Bash' }, hook)`: reads `e.command`, `e.run_in_background`, `e.agentId`; `const ran = await next(e)`, reads `ran.deny`, `ran.isError`, `ran.result.backgroundTaskId` (only when `isError` is not true), and returns `ran` itself, always. A call counts when the switch is on, the widget is not paused, `agentId` is absent, `run_in_background` is not true, it was not denied or backgrounded, and `counted(e.command)` is not null. Any throw inside the widget's own work is caught and still returns `ran`.
- `counted(command)`, pure: null if the command has a newline; else trim, collapse runs of white space, drop a trailing ` 2>&1` from each `&&` segment; null if what is left holds `|`, `;`, `` ` ``, `$(`, `>`, `<` or a `&` outside `&&`; null if a segment starts with `cd`, `pushd` or `popd`; a segment is a check when its first word is not one of `cat ls echo grep rg find git head tail sed awk rm cp mv mkdir touch which` and one of its first three words matches `CHECKS` (`/\b(test|tests|pytest|jest|vitest|tsc|lint|eslint|build|check|clippy)\b/`, copied from `checks-widget`); null without a check segment; else the collapsed command, which is the name on the card.
- `look`: `git rev-parse --show-toplevel` in `await $.session.cwd()`; a non-zero exit or a rejection means no repository (`place.top` `''`). Then `git for-each-ref --format=%(refname)%00%(objectname)%00%(tree)%00%(committerdate:unix)%00%(contents:subject) refs/widgets/green/<wt>/` fills `runs` (command from the subject, `greenAt` from the date). Runs at `session.start` while on and at switching on. Each counted call runs the `rev-parse` again and reloads `runs` only when the top level has moved.
- Snapshot, after every counted call that has something to compare or keep (a failing command never green runs none): `git add -A` then `git write-tree`, both with `GIT_INDEX_FILE` `${$.plugin.root}/index-<wt>` and `cwd` the top level.
- Passed: `git commit-tree <tree> --no-gpg-sign -m <command>` with `GIT_AUTHOR_NAME` and `GIT_COMMITTER_NAME` `green-widget`, the two `_EMAIL` `green-widget@localhost`, the two `_DATE` `@<seconds of $.clock.now()> +0000`; `git update-ref <ref> <sha>`; with a ninth ref in the tree, `git update-ref -d` on the oldest. An unchanged tree makes no new tree object and only moves the date.
- Failed with a green: `git diff --numstat --no-renames -z <green tree> <tree>`; rows `<added>\t<removed>\t<path>` split on NUL, `-` (binary) read as 0.
- `clear`: `git for-each-ref --format=%(refname) refs/widgets/green/`, `git update-ref --stdin` with `delete <ref>` lines on `stdin`, `git read-tree --empty` with the index variable.
- `$.ui.toast`, once per change from green to red: `<command> went red: <plural files>, +a -r since green <span> ago` (`<command> went red with the tree unchanged since green`). `$.clock.every(30_000, ...)` moves the ages; `$.clock.now`, `$.plugin.root`, `$.prompt.fill` (`PromptFilled.isFilled`), `$.store`, `$.command.register`, `on('command.run')`, `on('session.start')`, the three `ui.render` hooks, `$.widgets.card`. Not used: `$.session.repo()` (its `root` is "the main working tree's for a worktree", the wrong tree), `$.ui.ask`, `$.fs`, `prompt.submit`, `tool.check`.
## State and storage
- `$.state` `isOn: boolean`, `tick: number`, `isPaused: boolean`, `fault: string` (`''` none).
- `$.state` `place: GreenPlace` `{ top: string; key: string }`, default both `''`.
- `$.state` `runs: GreenRun[]`, latest run first, at most 8: `{ key: string; command: string; greenAt: number; sha: string; tree: string; redAt: number; fileCount: number; added: number; removed: number; files: GreenFile[] }`; `greenAt` 0 is never green, `redAt` 0 is the last run passed, `fileCount` -1 is a red whose comparison failed (no since line); `GreenFile` `{ path: string; added: number; removed: number }`, at most 20.
- `$.store` `isOn` only. The timer handle is the only module-level `let`.
- In the person's repository: refs under `refs/widgets/green/` and the commits they hold, nothing else. A plain `git push` does not send them; `git log --all` shows them; `clear` deletes them and git collects the objects in its own time.
- File `${$.plugin.root}/index-<wt>`: a git index, written by git alone.
## Off
No card and no timer; the `tool.call` hook returns `next(e)` after reading the switch, with no git run, no state write and no toast. Switching off resets `place`, `runs`, `fault` and the pause. The refs stay until `clear`, which needs the widget on.
## Demo
`docs/engine.js` answers every `git rev-parse` with a `.git` path and has no ref store. Stand-ins needed in its `git`: `rev-parse --show-toplevel` answers `ROOT`; `for-each-ref` under `refs/widgets/green/` answers one green for `npm test` dated 14 minutes before now; `add`, `update-ref` and `read-tree` exit 0; `write-tree` answers a tree other than the seeded one; `commit-tree` answers a sha; `diff --numstat` answers `1\t1\tsrc/sum.js`. At rest: `all green`, `✓ npm test  14m 00s ago`. During the scripted turn the failing `npm test` turns the card to `1 red`, `✗ npm test  green 14m … ago`, `since green: 1 file, +1 -1`, `src/sum.js  +1 -1`; the passing `npm test` later in the turn leaves `all green`, `✓ npm test  0s ago`, which is the card after the turn.
## Live
`bun factory/tools/live.ts factory/floor/plugins/green-widget --allow "Bash" --say "/green-widget on" --say "Run these Bash commands one per call, exactly as written, then answer ok: (1) rm -rf green-live && mkdir green-live && cd green-live && git init -q (2) echo one > a.txt (3) test -f a.txt (4) echo two > b.txt (5) rm a.txt (6) test -f a.txt" --say "/green-widget tell" --say "/green-widget clear" --say "/green-widget off"`
One turn of six small tool calls in a throwaway repository inside the factory's scratch project; the person's repositories are never entered. A good run: `tell` (no prompt box in a `-p` run, so the answer is the text) names `test -f a.txt`, a 12-character commit, `2 files had changed since then, +1 -1`, and the rows `a.txt +0 -1` and `b.txt +1 -0` in either order; `clear` answers `Last green cleared: 1 snapshot deleted.`; the store prints `isOn` false. If `tell` answers `Nothing is red.`, `$.session.cwd()` did not follow the `cd` in (1): the builder logs that and sends the order back to design.
## Cost
No tokens and no model call. `tell` fills one prompt of a few hundred tokens, which the person sends or deletes. Per counted check: one `rev-parse` and up to four short git runs, awaited before the Bash result is handed on (tens of milliseconds on a warm tree, 10 s at the very most, once).
## Acceptance
- A1: on in a repository with no refs the card shows the empty sentence with no note in all three placements; with `rev-parse` exiting non-zero it shows the no-repository sentence, a passing `bun test` then runs no `add`, and `clear` answers `Not in a git repository.`
- A2: `counted` returns the collapsed command for `bun test`, `  npm  run lint `, `CI=1 bun test`, `bun install && bun test`, `bun test 2>&1`, `python -m pytest`; and null for `bun test | tail -5`, `bun test || true`, `bun test; echo ok`, `bun test > out.txt`, `cd pkg && bun test`, `cat test.txt`, `git commit -m "fix test"`, `ls tests`, `echo $(bun test)`, a two-line command and `bun install`.
- A3: a passing `bun test` runs `add -A` and `write-tree` with `GIT_INDEX_FILE` under `$.plugin.root`, then `commit-tree` with the command as message, the six identity and date variables and `--no-gpg-sign`, then `update-ref refs/widgets/green/<wt>/<cmd> <sha>`, all with `cwd` the top level; the card reads `all green` and `✓ bun test  0s ago`, 14 minutes of clock later `14m 00s ago`; the hook resolved to the very object `next` gave.
- A4: a failing `bun test` after that green, with `diff --numstat -z` answering six files (one binary, one path with a space), gives note `1 red`, `✗ bun test  green <span> ago`, `since green: 6 files, +120 -31`, the two largest files and `… 4 more in tell`; one toast with the specified text; a second failing run moves `redAt` and toasts nothing.
- A5: a failing run whose tree equals the green's shows `since green: the tree is unchanged` and the ignored-files line, and toasts the unchanged sentence; a failing `bun run build` never green runs no `add`, reads `never green` and toasts nothing; a passing run after a red returns the row to `✓` and the note to `all green`.
- A6: at `session.start` while on, and at `on`, `for-each-ref` rows for this tree become rows with their commands and ages (a subject holding spaces and quotes intact), a ref of another `<wt>` is never asked for; a counted call after the top level moved reloads `runs` for the new tree.
- A7: `tell` in A4 fills the prompt once with the four paragraphs (12-character sha, the ref, 6 files, both spans) and answers the filled sentence; with `isFilled` false the answer is that text; with 25 files it lists 20 and `and 5 more`; with nothing red, a first row never green, and an unchanged tree it answers the three specified sentences and fills nothing.
- A8: `clear` with three refs across two trees sends three `delete` lines on `stdin` to `update-ref --stdin`, runs `read-tree --empty` with the index variable, empties the card to the empty sentence, lifts a pause and answers `Last green cleared: 3 snapshots deleted.`
- A9: an `add` that rejects (timeout) records no green, shows `error` with the two pause sentences, and later counted calls run no git until `clear`; an `add` exiting 128 shows `No snapshot: <stderr line>` cut with `…`, and the next passing run removes it; a failing run whose `diff` exits non-zero is red with no since line; in each case the hook still returned `ran`.
- A10: a ninth command going green deletes the ref with the oldest date and drops its run; with two reds that have a green, one never green and two greens the card shows three rows in the specified order and files only under the first.
- A11: calls that are denied, `run_in_background`, carrying an `agentId`, or answered with a `backgroundTaskId` run no git and change no state.
- A12: while off, `tell` and `clear` answer `Last green is off.`, a passing and a failing check run no git, write no state and toast nothing; switching off cancels the timer and resets `place`, `runs`, `fault` and the pause, and sends no `update-ref`.
- A13: at 20, 40 and 60 columns no row of any state breaks the border; a long command ends in `…` and a long path starts with `…` with the fact whole; under 30 the ages are one unit, `never green` is `never`, the since line is `6 files +120 -31` and the note is `1 red`, `error` or nothing.
- A14: `TELL` is accepted as `tell`; `restore`, `tell now` and `what` answer `Usage: /green-widget [on|off|tell|clear]` and change nothing; no verb switches the widget on.
## widget.json
- title: `Last green`
- category: `Project and git`
- shows: `What changed in the working tree since each test, lint or build command last passed, measured against a hidden git snapshot taken at that moment and handed to Claude on request`
- commands: `/green-widget [on|off|tell|clear]`
- cost: `Keeps hidden git refs under refs/widgets/green in your repository (shown by git log --all, not sent by a plain git push) until clear; tell fills one short prompt for you to send`
