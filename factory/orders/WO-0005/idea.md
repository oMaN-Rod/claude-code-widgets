# Stakes

`stakes-widget`

## What it shows

Under the permission dialog for a destructive command, one measured line saying what a yes would actually lose. The card keeps the last few verdicts.

- `git reset --hard HEAD~3`: `Loses 3 commits (not on any remote) and uncommitted changes in 4 files`
- `rm -rf build/ tmp/`: `Deletes 212 files; 9 are untracked and cannot be recovered from git`
- `git push --force`: `Overwrites 2 commits on origin/main`
- `git checkout -- .`: `Nothing lost: every file is tracked and clean`
- anything it cannot read: `Could not measure: command uses a shell expansion`

At rest the card says `No destructive command asked yet`.

## Why it is remarkable

The permission dialog is the one moment the person decides alone and fast, and it shows only the command text. Stakes answers the question the person is really being asked, with numbers measured from the working tree, at the moment of the decision and in the dialog itself.

Closest existing widgets, and what Stakes adds:

- `guard-widget` counts allowed, asked and denied checks. It says nothing about what a call would do.
- `vows-widget` and `fence-widget` refuse a call or force an ask. Stakes never changes the decision.
- `footprint-widget` reports installs, removals and outside writes after they happened.

None of them writes into the dialog, and no widget in `plugins/` calls `$.ui.notice`.

## Sharpened scope

Keep it to a short, closed list of command shapes that it can measure exactly, and say `Could not measure` for everything else. A wrong number here is worse than no number.

- `git reset --hard [<ref>]`
- `git clean -f…` (with and without `-x`, `-d`)
- `git checkout -- <paths>` / `git restore <paths>` / `git checkout .`
- `git push --force` / `--force-with-lease` / `-f`
- `git branch -D <name>`
- `git stash drop` / `git stash clear`
- `rm -r…` / `rm -f…` on literal paths

The line always states the unrecoverable part first (untracked files, commits on no remote), since that is what the person cannot undo.

## API it needs

All present in `plugins/*/.claude-plugin/types/claude-code/index.d.ts`.

- `on("tool.call", { tool: "Bash" })`: the command and its `tool_use_id`, before core runs the permission prompt.
- `$.ui.notice(tool_use_id, text)`: one line under the dialog open for that call; core removes it when the call resolves.
- `$.tool.check({ tool, input })`: resolves `{ decision }` without opening a dialog, so probes run only when the answer is `ask`.
- Alternative route: a `tool.check` hook that returns the engine's verdict with `reason` set; on an `ask` the dialog shows a hook's reason.
- `$.process.run` with argv and no shell for the probes: `git rev-list --count`, `git status --porcelain`, `git branch -r --contains`, `git clean -n`, `git ls-files`, `git rev-list <upstream>..`; `$.fs.list` / `$.fs.stat` for `rm` targets.
- `$.state` for the card's history, `$.store` for the switch, `ui.render` with `$.widgets.card`, `command.run`.

## Cost

No model calls and nothing added to context. A few read-only git and file probes before a dialog that was going to wait on the person anyway. Attention: one line, only on commands that destroy something.

## Risks the designer must settle

1. Which route puts the line in the dialog: `$.ui.notice` from the `tool.call` hook, or `reason` from a `tool.check` hook. `$.ui.notice` refuses a call that is not open, so confirm the call counts as open before `next(e)` returns, or set the line while `next(e)` is pending.
2. The hook budget. Probes must have a hard time bound well inside it; when the bound is hit the dialog still opens on time with `Could not measure: took too long`. A hook that overruns is skipped, which must never delay or drop the ask.
3. Command parsing without a shell. Decide exactly what counts as readable: literal arguments only. Globs, variables, substitutions, pipes, `&&` chains, `cd` prefixes and `xargs` are `Could not measure` unless a chain's parts are each readable and the working directory is known.
4. Never state `Nothing lost` unless every probe succeeded. A failed probe is `Could not measure`, not a clean bill.
5. `rm` on a large tree: counting files must be bounded (stop at a cap and say `more than N files`).
6. `git push --force`: comparing with the remote uses the local remote-tracking ref, which may be stale. Say so in the line (`as of last fetch`) and do not fetch.
7. Windows: the probes are git and `$.fs`, which hold; `rm` may arrive as `Remove-Item` or `del` in a PowerShell tool. Decide whether those are in scope or honestly unmeasured.
8. Auto-allowed calls: when the decision is `allow` no dialog opens and no line shows. Decide whether the card still records the verdict afterwards or stays silent.
9. It must never deny, rewrite or force an ask. Its tests should prove the call's input and decision pass through unchanged.
10. The off state: no hook work at all, no probes.
