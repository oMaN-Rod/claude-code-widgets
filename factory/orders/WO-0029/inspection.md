# WO-0029 Skimmed: inspection (third build)

Verdict: **pass.** The one fault of the second inspection is fixed, with the two notes that rode with it. What is left are edges for a later order and the owner's fullscreen hand check, which no tool on the floor can stand in for.

## What was checked

- Checker: `PASS  skimmed-widget meets the standard.`
- Render at rest, `--turns 1`, `--turns 3`, and `on`, `off`, bare, `show`, `SHOW`, `clear`, `what`, `show 2`, `on on`: the empty card at 20, 40 and 60 columns, no broken border, no card while off. The render tool raises no `AssistantMessage` draw, so the other states stand on the tests and on the second inspection's probes; the apply, judge and card code did not change in this build.
- `hooks/register.tsx` read whole. Changed since the second build: `MARK`, `WORD`, `STOP`, `unmarked` (lines 43 to 45, 97 to 105) and two more `isOn` reads in `flush` (lines 358, 359). Everything else is as passed before: the turn hooks read the switch first, the message hook returns the engine's drawing and reads only `isOn`, verbs do not switch on, one timer armed and cancelled only in `sync`, store holds `isOn` only, no file, module level is `let timer` and `const queue`.
- Tests: A8 now carries `NAMED` (five lines, each expected verbatim: `db_migrate_all`, `seed_data.sql`, the glob in a span, `__init__.py` in a span beside `**skipped**` and `_its_`, a URL with `a_b`) and `STOPPED` (`e.g.`, `...`, `i.e.` and `vs.`, `etc.` before a capital, `etc.` before a lower-case word). A13 now switches off from inside the flush's own `state.get` and checks `book` is back at its default. Both prove their lines with real-shaped data.

## Probe of the scan (the pure functions, copied to scratch, 24 lines)

The lines of the second inspection now read right:

```
I did not run `db_migrate_all` ...        => I did not run db_migrate_all ...
I didn't update seed_data.sql.            => unchanged
The glob `src/**/*.test.ts` was skipped.  => The glob src/**/*.test.ts was skipped.
**Note:** the tests were _skipped_ ...    => Note: the tests were skipped ...
It did not fail... but 3 were skipped!    => one caveat, whole
... e.g. the v1.2 path.                   => not cut at e.g.
could not reach https://example.com/a_b?x=1.  => unchanged
I skipped 2 * 3 * 4 checks.               => unchanged
No tests failed. No, I did not run the migration.  => only the second
```

The same text fed in seven pieces gives the same caveats and weight as fed whole; fenced code, a table row and `0 failed` are left out.

## Live run (director's, `live.txt`, third build)

Good as far as headless goes: `on` answered `Skimmed on; /widgets places it.`, the reply came back word for word, `show` answered the two error sentences, `off` answered `Skimmed off.`, the store holds `{ "isOn": false }` and nothing else, no error. It proves the hook is harmless with no viewport. It proves nothing about the signal.

## Findings

None blocks. All are notes for a later order.

1. **Note. Outside a backtick span, a star or underscore at a name's edge still goes** (`unmarked`, line 104). `Unable to open my_file*.txt` is quoted `my_file.txt`; `*args or **kwargs` as `args or kwargs`; `_private` as `private`; a bare `__init__.py` as `init.py`. The last is what the transcript itself draws (markdown reads it as bold), and Claude writes such names in backticks nearly always, where they are kept. Right, if it is ever touched: remove a run only when it has a partner run on the same line.
2. **Note. The split still cuts after a title or a number.** `Dr. Smith said it failed.` is quoted `Smith said it failed.`; `Version 2. was not yet done.` as `was not yet done.` Right: no split when the next word starts in lower case, or after a one- or two-letter capitalised word.
3. **Note. A task box stays in the quote**: `- [ ] **TODO**: migration not yet run.` is quoted `[ ] TODO: migration not yet run.` `LEAD` (line 42) could take `[ ]` and `[x]` with the list mark. Links and `~~` are kept as written, which the spec allows.
4. **Note. One narrow path can still write `book` after off**: the `update` fallback at line 361 runs after an `isOn` read, not inside it, so an off landing between the two lets it write a page. It needs a version clash and an off in the same instant, and the page is uncounted, so nothing is ever drawn from it.
5. **Open, the owner's.** The four-part hand check in a fullscreen terminal is unmade: `onScreen` arrives and changes on a scroll; a timer armed from the render hook is accepted; a long reply's top caveat is quoted at the turn's end and leaves after a second back on screen; a press moves the transcript. If the first or second fails the widget is silent, never wrong, and the order should come back. When it is made, look also at whether the engine re-lays a finished reply (a late new `of` puts the page in doubt for good) and whether a wide table or long code block above a caveat pushes it past the margin.

## Why it passes the bar

No shipped widget reads `onScreen`; this is the first that watches what the person saw. It claims one fact, leaves every doubt unquoted and says so (`not judged`), costs no tokens, and its quote now names things as Claude wrote them. Every state reads at 20 columns.
