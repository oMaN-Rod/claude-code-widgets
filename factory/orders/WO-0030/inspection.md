# Inspection, WO-0030 (green-widget, "Last green")

Verdict: **pass**. Judged within the director's ruling of 16:36 (the widget is judged on the second live run; the `test -f` recipe is a spec matter and no send-back to design for it).

## What was done

- Checker: `PASS  green-widget meets the standard.`
- `render.ts` at rest, `--turns 1`, `--turns 3`, each verb: at rest the empty sentence fits at 20, 40 and 60. After a turn the demo engine answers `git add` with exit 1, so the card reads `error / No snapshot: git add failed.` That is the missing stand-in the spec's Demo section lists, the clerk's to add, not a build fault.
- Because the demo engine cannot reach the main states, I drove a scratch copy of the widget with the machinist's own bench (fake git, real hooks) through 14 states at 20, 40 and 60 columns. No row broke the border in any of them.
- Read `hooks/register.tsx` and `tests/widget.test.tsx` against the spec and standard.
- Live: read `live.txt` (the director's two runs). No run of my own.

## Frames that matter

```
| Last green                     2 red |      | Last green 2 red |
| ✗ bun test           green 1d 2h ago |      | ✗ bun test    1d |
| since green: 1 file, +1 -1           |      | 1 file +1 -1     |
|   src/sum.js                   +1 -1 |      |  …c/sum.js +1 -1 |
| ✗ bun run lint       green 1d 2h ago |      | ✗ bun run li… 1d |
| · bun test --grep "a b" '… 4d 2h ago |      | · bun test -… 4d |
```
Restored after a restart (spec note 1, settled honestly: a dim `·` and no `all green` until the pass is seen):
```
| Last green                           |
| ✓ bun test                    0s ago |
| · bun run lint            3m 10s ago |
```
Paused at 20 columns wraps to three whole rows; a 100-character git stderr is cut with `…` on its second row.

## Live run (director's, second run)

`on`, seven Bash calls in a throwaway repository, `tell`, `clear`, `off`. A real `ui_toast` arrived: `sh check.sh went red: 2 files, +1 -1 since green 7s ago`. `tell` named `sh check.sh`, commit `b2e64b79d629`, the ref, `2 files had changed since then, +1 -1`, rows `a.txt +0 -1` and `b.txt +1 -0`. `clear` answered `1 snapshot deleted`. Store: `isOn` false only. No errors. `$.session.cwd()` followed the `cd`, real git accepted the private index, and the real `isError` shape reached the hook.

## Code read

- Off is inert: `tool.call` returns `next(e)` after reading the switch; `session.start` runs `look` only when on; renders return `beneath`; `tell` and `clear` answer `Last green is off.` with no git; switching off cancels the timer and resets `place`, `runs`, `fault`, pause.
- The hook returns `ran` itself on every path, with its own work in a try/catch.
- Nothing reaches a shell: the command is an argv element of `commit-tree -m`, tree and commit ids are checked against a hex pattern, refs go to `update-ref --stdin`.
- Writes are the store's `isOn`, refs under `refs/widgets/green/`, and the index file under `$.plugin.root`; nothing else.
- Tests feed realistic data (CRLF warnings on a zero exit, binary numstat rows, a path with a space, a lock-file stderr) and assert the git argv, env and cwd, not only the card.
- Spec notes 1, 2, 4, 5, 6, 7, 8 and 9 are settled in the build; `isSeen` was added to `runs` for note 1 and is in `types/index.d.ts`.

## Findings (none blocks; for the clerk and for a later order)

1. Demo, for the clerk: with note 1 settled as built, the card at rest will read `· npm test  14m 00s ago` with no note, not the spec's `all green / ✓`. After the scripted turn it reads `all green / ✓ npm test  0s ago` as specified. Add the stand-ins the spec lists to `docs/engine.js`; without them the demo card is `error`.
2. `register.tsx` `since()`, under 30 columns: the since line wraps when the counts are long (`5 files +350` / `-114`), splitting added from removed. It stays inside the border. Right would be one row, for example dropping the word `files` when it does not fit.
3. `counted()` (the spec's rule, copied from checks-widget) takes anything with a check word in its first three words: `wc -l tests/a.ts`, `npm install vitest` and `test -f a.txt` each became a `✓` row with a hidden commit, and three of them push a real `bun test` off the three-row card. Right would be `test`, `[`, `wc`, `stat`, `du`, `chmod` in the plain list and an install verb (`install`, `add`, `i`) disqualifying a segment. Spec matter; under the ruling it is recorded, not sent back.
4. Same root as the ruling: a Bash result carrying `returnCodeInterpretation` (a non-zero exit the host reads as meaningful, as `test -f` exit 1) is counted as a pass. Right would be not to count such a call at all, and likewise one with `result.interrupted` true, since a wrong green is the one thing the spec says must not happen.
5. An interrupted run of a command that has a green arrives as `isError` and is drawn and toasted as `went red`. Rare; right would be to skip a result whose text says it was interrupted.
6. `clear` empties only this tree's index file; other `index-<wt>` files stay under `$.plugin.root` (spec note 3, harmless).
7. Not counted, by the spec's rule and worth a line in the README row later: commands with a pipe, a `cd`, `bash -c '...'`, a wrapper such as `timeout 60 bun test`, and anything run through the PowerShell tool.

## Bar

Functional: the whole chain ran against real git in a real session. Original: nothing shipped states what changed in the tree since a check last passed. Enjoyable: the card is quiet until a check goes red, then says the one thing worth knowing and hands it to Claude in one verb. It passes.
