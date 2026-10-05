# Spec notes: WO-0005 Stakes

No blocking fault. The three faults of the last send-back are answered in the spec: `git sees no files there` through the `--error-unmatch` probe, `holds another repository` for a nested repository or submodule, and `cwd` from `classic.CwdChanged`. The E probe was run by hand in a scratch repository on Windows: exit 1 for `SRC`, an empty folder, `nested/extra.txt`, an absent path and `SRC build`; exit 0 for a tracked, an ignored and an untracked path and for `nested`. Settle the notes below while building; each is looked at again at inspection.

New with this spec

1. `types/index.d.ts` declares only `isOn` and `log`. Add `cwd: string | undefined` to the state contract.
2. Switching off must set `$.state.cwd` to `undefined` on every path that turns the switch off (`off` and the bare toggle), and `clear` must leave it. A11 asks for both orders: an event while off, and an event followed by `off` then `on`.
3. The `classic.CwdChanged` hook returns `next(e)` on every path, also when `new_cwd` is not a string. It does nothing else: no probe, no notice, no redraw.
4. With a `cwd`, `rev-parse --show-toplevel` carries it too, like every other probe. A `new_cwd` outside any repository then gives `git could not answer`, never a count taken in the session's directory.
5. Order in shape 5 is E, then `holds another repository`, then the counts, but a probe that exits non-zero for another reason, rejects or is truncated still wins over all three. A8 should hold one case where E exits 1 and another probe is truncated or rejects.
6. An absolute path is compared with the top level without case and with `/c/` read as `c:/`. A top level reached through a short (8.3) name or a link will not compare equal and reads `unrecognised form`; that is the safe side, keep it and do not try to resolve it.
7. A tracked file already deleted from disk is listed by `ls-files -m`, so `rm` of it reads as an unstaged change that would be lost. Acceptable; do not add a probe for it.
8. `rm -f gone` (an absent path) now reads `Could not measure: git sees no files there`. That is the chosen behaviour; name it in the README row's limits beside the `cd` made while off.
9. The line for U and M zero uses T alone (`all 203 files`), and for one file must read `the 1 file is` or another true singular; choose the wording and test it.

Carried over, still open or to be shown again

10. Switch order. Route awaits `next(e)` and then tests the switch; Off says the hook returns `next(e)` at once. Test `isOn` first and `return next(e)` before reading anything of `e` or of the verdict.
11. The 20-column header in the unmeasured state: `Stakes` (6) plus `unmeasured` (10) fills the 16 inner columns. Keep a space between title and note and cover it in A15.
12. `rm` as an argument (`grep rm notes.txt`, `git rm x`) is a candidate and gets a line. Chosen behaviour; keep one test of it and name it in the README row's limits, with `rm <dir>` without `-r`, `git checkout <file>` without `--`, and `git -C dir reset --hard` being silent.
13. A word that starts with `-` where shape 1 or 4 expects a ref, remote or branch is `unrecognised form`, never handed to git as a ref.
14. Shape 1 with N above zero and M zero: do not print `(0 on no remote)`.
15. Shape 4 with no upstream: `git could not answer`, and the count probe does not run.
16. `$.ui.notice` at `tool.check` is still unproven in a live dialog. The swallowed refusal keeps the hook safe; the director should look at one dialog in an interactive session before this ships.
17. No await between the last probe and `return verdict`. `log` keeps at most 80 characters of a command.
