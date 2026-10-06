# Last green

Plugin: `green-widget`. Command: `/green-widget [on|off|tell|restore|clear]`.

## What it shows

The moment each check last passed, kept as a hidden git snapshot of the whole working tree. While the checks pass the card is a clock: `bun test green 14 min ago`. Once a check that has a green goes red, the card becomes the answer to "it worked a minute ago":

```
bun test red, green 14 min ago
since green: 6 files, +120 -31
parser.ts 2 hunks, lexer.ts 1 hunk, ...
```

- `/green-widget tell` hands Claude what changed since green, so it debugs the delta and not the codebase.
- `/green-widget restore` puts the tree back to the green snapshot after a confirm dialog, snapshotting the red tree first so the restore can itself be undone.
- `/green-widget clear` deletes every ref the widget wrote.

At rest, before any check has passed: `No green yet: the next passing test, lint or build is kept`. Outside a git repository: one line saying so, and nothing else runs.

## Why it is remarkable

Nothing shipped or waiting ties the state of the tree to the moment it worked. `checks-widget` lists runs, `proof-widget` says whether edits were checked, `watch-widget` reruns a command, `diff-widget` shows the last edit only. Claude Code's own rewind is keyed on prompts and covers only files Claude's edit tools touched; this snapshot covers everything in the tree, including what a Bash command, a formatter or the person changed, and it is keyed on the one fact that matters: the checks passed here.

The card turns the most common sentence said at a terminal into a measured fact, with no model call, and the claim is checkable by the person with `git diff <ref>`.

## Sharpened from the inventor's version

1. **A green belongs to a command.** A passing `eslint` is not a passing `bun test`, and `bun test parser.test.ts` is not the suite. Keep one green per normalized check command; a red run is compared with the last green of that same command, and the card names the command. A command that has never been green shows red with no "since".
2. **`tell` sends a pointer, not the diff.** Hand Claude the ref name, the stat and the hunk headers, and the line `git diff <ref> -- <path>` to read the hunks it wants. That is a few hundred tokens whatever the size of the change. Use `$.prompt.fill`, so the person sees and sends it, unless the designer finds a reason for `$.prompt.submit`.
3. **No new snapshot when the tree has not changed.** Compare the new tree hash with the last one for that command and only move the timestamp.

## API it needs (all checked in `claude-code.d.ts`)

- `tool.call` on Bash: await `next(e)`, read `isError`; the check matcher is the one in `plugins/checks-widget/hooks/register.tsx` (`CHECKS`), copied, since plugins cannot import one another.
- `$.process.run(argv, { env, cwd, timeoutMs })` (`ProcessRunInit.env` exists; "Git runs with repo hooks off"). Snapshot with `GIT_INDEX_FILE=<temp file>`: `git add -A`, `git write-tree`, `git commit-tree`, `git update-ref refs/widgets/green/... <sha>`. The user's index, stash, branch and HEAD are never touched.
- `git diff --stat <sha>` and `git diff --numstat <sha>` for the card.
- `$.ui.ask(question, options)` to confirm `restore` (it rejects when dismissed and in a `-p` run: treat both as no).
- `$.session.repo()` to stay inert outside a repository.
- `$.ui.toast` once when a command goes from green to red.
- `$.prompt.fill` for `tell`.
- `$.state` for the session's greens; the refs themselves are the durable record, so a new session can find the last green by reading `git for-each-ref refs/widgets/green`.

## Cost

No tokens and no model call until `tell`, which fills one short prompt. One short git run after each passing check and one `git diff --numstat` after a failing one. Hidden refs under `refs/widgets/green` in the person's repository: the last few per command are kept, older ones deleted, all removed by `clear`. While off, the hook passes every call through and runs no git.

## Risks the designer must settle

1. **False greens.** `bun test | tail`, `cmd || true` and `a; b` exit 0 whatever the test did. Decide which command shapes count; a wrong green is worse than no green. The same care for a check Claude ran in a subfolder or another worktree (`cwd`).
2. **Speed on a large tree.** `git add -A` into an empty temp index hashes every file. Seed the temp index from the real one (copy it, or `git read-tree HEAD`) so only changed files are hashed; give the run a timeout and skip the snapshot when it is exceeded, saying so on the card. Never delay the Bash result: snapshot after `next(e)` has resolved.
3. **What the snapshot leaves out.** `git add -A` honours `.gitignore`, so `node_modules`, build output and `.env` are not in it. The card or `restore`'s dialog must say that a restore does not bring those back, which matters when the red is caused by an install.
4. **Restore without touching the index.** `git restore --source=<sha> --worktree -- .` rewrites files in the snapshot but leaves files created since green in place; decide whether those are removed (and list them in the dialog) or kept. The red tree must be snapshotted and its ref confirmed written before one file changes, and the dialog must state the count of files that will change. If restore cannot be made provably undoable, ship without it: the card and `tell` carry the idea alone.
5. **Refs in someone else's repository.** Name them so they cannot collide across worktrees of one repository (refs are shared), cap how many are kept, and confirm they are not pushed by a default `git push` and not shown by `git log --all` noise the person would trip on (they will appear in `--all`; say so in the README row or keep the count small). Snapshots keep objects alive until `clear`.
6. **Submodules, a rebase or merge in progress, a bare or shallow repository.** Stay inert, with one line saying why, where a snapshot or restore would be wrong.
7. **Tests must not touch the user's repository.** Every test and any live run works in a throwaway repository under a temp folder.
8. **The card at 40 columns.** Long commands and long file lists must cut cleanly; the red state has to fit in four or five lines.
