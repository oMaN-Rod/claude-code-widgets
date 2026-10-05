# Inspection: WO-0005 Stakes (`stakes-widget`), fourth pass

## Verdict

Pass. The three faults of the third pass are fixed, the build matches the spec, and every line the widget wrote under real git on this machine was true. One thing is still unseen and the director should look at it before shipping: the line under a real dialog (see Live run).

## What was done

- Checker: `PASS  stakes-widget meets the standard.`
- Render at rest, `--turns 1`, `--turns 3`, and after `on`, `ON`, `off`, `clear`, `clear now`, `bogus`: the empty card matches the spec at 20, 40 and 60 columns; `off` draws nothing; unknown verbs answer the usage line and change nothing.

```
│ Stakes           │      │ Stakes                               │
│ No destructive   │      │ No destructive command asked yet.    │
│ command asked    │      │ When Claude asks to run one, what a  │
│ yet.             │      │ yes would lose shows in the dialog.  │
```

- The demo engine never answers `ask`, so the other card states were judged from `show()` and tests A2, A12 and A15 (20-column best moment and the `unmeasur…` header are asserted row by row).
- `hooks/register.tsx` against the spec and standard: `tool.check` and `classic.CwdChanged` return `next(e)` before any other work while off; the verdict object is returned untouched; a throw from `next` is not caught; a refused `ui.notice` is swallowed; every probe is an argv with `--no-optional-locks` and `timeoutMs: 1000`; no timer; only `isOn` is stored; `clear` and unknown verbs do not switch it on; `cwd` is in the state contract.
- Tests: the `process.run` stand-in is keyed on the exact argv and answers exit 1 for anything not laid out, so a test cannot pass on a probe the widget did not make. Each proves its line with git-shaped data.
- Break attempts: the real `tool.check` hook was driven with 90 commands against real git (no shell) in scratch repositories on this machine (Windows, `core.ignorecase` true): a tracked folder with one unstaged change and one staged new file, an ignored `build`, an empty folder, a nested repository, a clone with a remote two commits ahead and two local commits unpushed.

| command | line under the dialog |
| --- | --- |
| `rm -rf SRC`, `rm -rf empty`, `rm -rf gone`, `rm -rf nested/extra.txt`, `rm -rf SRC build` | `Could not measure: git sees no files there` |
| `rm -rf nested` | `Could not measure: holds another repository` |
| `rm -rf src build loose.txt` | `Loses 2 files not in git and unstaged changes in 1 file; deletes 5 in all` |
| `rm -rf <top>/src` (absolute) | `Loses unstaged changes in 1 file; deletes 3 in all` |
| `rm -rf <top>`, `<top>/../r4/src`, `./`, `.GIT`, `C:/Windows`, `--no-preserve-root /` | `Could not measure: unrecognised form` |
| after `CwdChanged` to `packages/a`: `rm -rf dist` | `Loses 1 file not in git; deletes 1 in all` |
| after `CwdChanged` to `C:/Windows`: anything | `Could not measure: git could not answer` |
| `git reset --hard HEAD~4` | `Loses changes in 1 file and 4 commits (2 on no remote)` |
| `git push -f`, `--force-with-lease`, `--force origin main` | `Overwrites 2 commits on origin/main, as of last fetch` |
| `git clean -fdq` | `Deletes 3 untracked paths, none recoverable` (the `q` is dropped from the dry run, or it would count nothing) |
| `rm -rf "src"`, `rm -rf src; echo ok`, `echo rm` | `Could not measure: not a plain command` |

  No command produced a `Nothing lost` that was false, and the verdict object came back unchanged every time.

## Live run

From `live.txt`, made by the director after this build. `on`, `clear` and `off` answer as the spec says; the model asked `git checkout .`, core answered `This command requires approval`, the headless host refused it and nothing errored. The store holds only `isOn`. The run cannot show the line under a dialog (a headless session opens none), and `clear` ran before the end, so it does not show that the entry reached the card either. The types document `$.ui.notice(e.tool_use_id, ...)` inside a check hook, and a refusal is swallowed, so the worst case is a card with no line under the dialog. The director should open one dialog in an interactive session (`git checkout .` with a changed file) and see the line before this ships.

## Findings

None blocks. All are notes for the README row or a later order.

1. **`cwd` is reset to `''`, not `undefined`** (`register.tsx` lines 36, 110, 346). The spec says `undefined`. `ran()` treats both as no directory, so behaviour is as specified; the contract type still reads `string | undefined`. Right: `undefined`, or the spec says the empty string.
2. **`(all on a remote)`** (`reset`, line 158). `git reset --hard HEAD~3` with every dropped commit pushed reads `Loses 3 commits (all on a remote)`. The spec has no such wording (note 14 only forbade `(0 on no remote)`). It is true as of the last fetch and tested in A2 line 164; keep it and add it to the spec's shape 1.
3. **`git` with a global option** (`OPTIONED`, line 23). `git -C src reset --hard` reads `unrecognised form`, better than the silence the notes expected, but `git --no-pager log --grep reset` gets the same line when asked. Harmless; right is to match the verb only as the first non-option word.
4. **Pathspec magic** (`remove`, line 238). A path word starting with `:` is read by git as magic (`:/` is the whole repository), so the count can be of other files than `rm` deletes. Every case tried landed on `Could not measure`. Right: add `--literal-pathspecs` after `--no-optional-locks` for the `ls-files` and `diff` probes.
5. **Case-blind compare on a case-sensitive disk** (`isBelow`, `rebased`, lines 95 to 102). As the spec orders. On Linux `/home/A/repo/src` with the top level `/home/a/repo` is measured as the other folder. Needs two folders differing only in case; name it in the limits.
6. **Limits for the README row**, unchanged from earlier passes: `rm <dir>` without `-r` overstates; `git checkout <file>` without `--` and `git checkout -f` are silent; `rm -f gone` reads `git sees no files there`; `rm -rf node_modules` will usually read `too many files to count`; a `cd` made while off is not followed; `git branch -D` and `git stash drop` are not read.

## Against the bar

Functional: the lines are true, and where the widget cannot know it says so. Original: no shipped widget writes into the permission dialog or changes a decision the person is about to make. Enjoyable: one short line at the moment it matters, and a card that reads at every width. Better than what is shipped.
