# Inspection: Squiggle (`squiggle-widget`, WO-0013)

**Verdict: pass.** It meets the spec and the standard, and it is the first widget that draws inside the prompt box. No blocking finding; six notes for shipping and for a later revision.

## What was run

- `check.ts --spec`: `PASS  squiggle-widget meets the standard.` (includes `claude plugin validate` and the 20 tests).
- `render.ts` at rest, `--turns 1`, `--turns 3`, and with `on`, `off`, `check`, `check <text>`, an unknown verb, and `off` followed by `check`.
- The demo engine has no `$.prompt.read` yet, so `render.ts` can only show the empty card. To see the filled card I drove the same `shoot()` from a scratch script that supplies a draft through a stand-in `read`; nothing in the widget, the spec or the tools was changed.
- The director's live run (`live.txt`); no second run was made.

## Frames

Empty, at rest and after 1 and 3 turns (identical, as the spec says without the stand-in):
```
╭──────────────────╮   ╭──────────────────────────────────────╮
│ Squiggle 8 files │   │ Squiggle                     8 files │
│ Type a file name │   │ Type a file name in your prompt: it  │
│ in your prompt:  │   │ lights up if it exists.              │
│ it lights up if  │   ╰──────────────────────────────────────╯
│ it exists.       │
╰──────────────────╯
```
Demo draft `fix src/formt.js and test.js`, cursor 28 (same after a scripted turn):
```
╭──────────────────╮   ╭──────────────────────────────────────╮
│ Squiggle     1 ✗ │   │ Squiggle                   1 missing │
│ ✗ src/formt.js   │   │ ✗ src/formt.js                       │
│   src/format.js  │   │   nearest src/format.js              │
│ ✓ test.js        │   │ ✓ test.js                            │
╰──────────────────╯   ╰──────────────────────────────────────╯
```
Busiest, seven verdicts with a 46-character missing path:
```
╭──────────────────╮   ╭──────────────────────────────────────╮
│ Squiggle     3 ✗ │   │ Squiggle                   3 missing │
│ ✗ docs/a-very-l… │   │ ✗ docs/a-very-long-missing-file-nam… │
│ ✗ src/formt.js   │   │ ✗ src/formt.js                       │
│   src/format.js  │   │   nearest src/format.js              │
│ ✗ src/indx.js    │   │ ✗ src/indx.js                        │
│   src/index.js   │   │   nearest src/index.js               │
│ ✓ README.md      │   │ ✓ README.md                          │
│ +3 more          │   │ +3 more                              │
╰──────────────────╯   ╰──────────────────────────────────────╯
```
No row wraps or breaks the border at 20, 40 or 60 columns; 60 keeps the 40-column card, as the standard asks. Notes shorten correctly at 20 (`8 files`, `1 ✗`, `listing`, `failed`, `partial`).

## Trying to break it

All answered as the spec says, no fault thrown:
- `../../etc/passwd C:\Users\x.js ~/a.js /abs/x.js src/*.js $HOME/x.js`, URLs, `git@host:a/b.js`: `No file name in that text.`
- ``(src/format.js:12:3), `test.js`; <README.md>! @docs/guide.md.``: four `✓` lines, wrappers and `:line:col` stripped.
- `readme.MD Test.js`: both missing with the real file as nearest. `test.js` five times with `tst.js` twice: one `✓ test.js`, `tst.js` silent (3-character stem).
- `./././test.js`, `.\src\sum.js`, `src/sum.js/`: found. A 300-character path: answered whole, truncated on the card.
- `on extra`, `checks x`, `clear`: usage. `check` while off: `Squiggle is off.`, and it does not switch the widget on.

## Code reading (`hooks/register.tsx`)

- Off is inert: `prompt.edit` returns `next(e)` untouched, `tool.call`, `turn.complete` and `prompt.submit` read the switch before any write, `session.start` only registers and restores. No timer. Switching off resets `index`, `paths`, `found` and the lookup.
- `prompt.edit` makes no `$.process`, `$.fs` or `$.prompt` call, works on `r.text` and `r.cursor`, keeps earlier decorations, and a throw returns `r`. `found` is written only when it changes.
- The one module-level object is the `const lookup` the spec names. Store: `isOn` only. No files.
- Tests: each acceptance line has a test that feeds realistic shapes (real `git ls-files` output, truncated output, `FsEntry` trees, a real `Write` result, denied and errored results) and asserts exact decorations, card lines and reply text. A9 and A15 watch every state write through a `state.set` tap, so they prove "nothing is written" and do not only agree with themselves.

## Live run (`live.txt`)

- The scratch project has no `.git`, so the run used the **folder walk** on Windows paths (spec note 14): `Squiggle: 1 file.`, `✓ README.md`, `✗ REDME.md  no such file, nearest: README.md`.
- After the real `Write` of `notes/plan.md` the count is `2 files`, `✓ notes/plan.md`, `✗ notes/plam.md  no such file, nearest: notes/plan.md`. A rebuild only happens when the index is stale, so the real `tool.call` result shape set the flag.
- No error. Store: `{ "isOn": true }` and nothing else. The spec's Live line has no `off`, so the switch was left on in the factory's own config directory; harmless there.
- `prompt.edit` and the `git ls-files` path are proved by tests only, as the spec states.

## Findings (none blocking)

1. **Demo stand-in is not in `docs/engine.js` yet.** `prompt: { suggest, submit, fill }` has no `read`. Until shipping adds the `prompt.read` the spec asks for, the demo page shows only the empty card. Right: the three rows above, at rest and after the scripted turn.
2. **`session.start`, `on` and `turn.complete` wait for the listing** (`register.tsx` 427, 442, 485), up to the 3-second timeout. Right, in a later revision: start the build without awaiting it at `session.start` and `turn.complete`; the `Reading the file list.` card already covers the gap.
3. **`git ls-files --cached` lists tracked files deleted from disk**, so a deleted file is painted green until it is staged. Right: accept, or add `--deleted` and subtract.
4. **Non-ASCII paths from git come quoted and octal-escaped** (`"src/caf\303\251.ts"`), so they never match. Right: pass `-z` (or `-c core.quotePath=false`) and split on NUL.
5. **A wrong-case or misspelled first folder is silent** (`Src/sum.js`, `scr/sum.js`): the candidate rule needs an indexed first segment. As specified; the most common slip this misses. Worth a spec change later.
6. **`src/sum.js#L3` and `src/sum.js?x`**: the first is `no such file` with no nearest, the second is ignored. Right, later: strip a `#L…` suffix as `:line` is stripped.
