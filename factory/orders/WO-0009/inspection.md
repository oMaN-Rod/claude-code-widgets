# Inspection: WO-0009 Footnotes (`footnotes-widget`)

Verdict: **pass**.

## What was run

- `check.ts` with the spec: PASS, 15 acceptance tests plus the standard five.
- `render.ts` at rest, `--turns 1`, `--turns 3`, and with `on`, `off`, `show`, `clear`, an unknown verb, `ON`, `show all`, `clear now`, `--help`, `on off` and a blank argument.
- `render.ts` cannot show a checked reply: `docs/engine.js` has no `fs.exists`, so the check throws, is caught, and the card stays empty after a turn (as the spec's Demo section says it will until the stand-in is added). To see the other frames the engine text was patched in memory from a scratch script (an `exists` answering from its files, and a different answer); nothing in the repository was changed.
- The live run was read from `live.txt`; no second run was made.

## Frames that matter

At rest, 20 and 40 columns: matches the spec's empty drawing; the sentence wraps inside the border at 20.

Demo answer with the `exists` stand-in (what the demo page will show once the clerk adds it):
```
│ Footnotes    1/1 │      │ Footnotes                  1/1 found │
│ ✓ all found      │      │ ✓ 1 named, 1 found                   │
```
10 named, 8 failures:
```
│ Footnotes   2/10 │      │ Footnotes                 2/10 found │
│ ✗ sum.js:400     │      │ ✗ sum.js:400: file has 7 lines       │
│ ? retry.ts       │      │ ? retry.ts: not on disk              │
│ ✗ gone.ts:9-12   │      │ ✗ gone.ts:9-12: not on disk          │
│ ? refreshSessio… │      │ ? refreshSession(): not in this repo │
│ ? user_id        │      │ ? user_id: not in this repo          │
│ +3 more          │      │ +3 more                              │
│ Ask Claude       │      │ Ask Claude to check these            │
```
No line wraps or breaks the border at 20, 40 or 60; a 60-wide card (`/widgets width`) keeps a 23-digit line number and its reason on one row. `Nothing to check in the last reply.` wraps cleanly at 20. Off draws nothing.

## Live run

`on` answered `Footnotes on; /widgets places it.` A real `turn.complete` reached the widget with `reason: 'answer'`; `show` answered `4 named, 1 found:` with `✓ README.md:1`, `✗ README.md:99: file has 3 lines`, `✗ src/nowhere.ts:3: not on disk`, `? refreshSession(): not found in this repository`, exactly as the spec's Live section predicts, so real `git ls-files` and `git grep` ran on Windows and their output parsed. `off` answered `Footnotes off.` The store holds `isOn: false` and no other key. No errors.

## Code against the spec and the standard

- `turn.complete` returns what `next(e)` gave on every path and reads the switch before any `$.session`, `$.fs` or `$.process` call. `ui.render` returns `beneath` while off. `show` and `clear` answer `Footnotes is off.` and never switch on. No timer, no file, one store key.
- The whole check sits in one `try`; a rejected `cwd`, `repo`, `exists`, `ls-files` or `grep` leaves `last` as it was or marks symbols `git failed`, never a false `missing`.
- All six spec notes are settled: short `✓ all found`; the unchecked row under `Nothing to check`; `..` paths resolve at `<cwd>/` only; grep output trimmed and de-duplicated; rejections caught; one read per file.
- The button is seated into the card after `$.widgets.card` returns (the handle cannot cross into the layout plugin); the real card keeps the body in `children`, so the seat is found there as it is in the test stub.
- Tests use a 61-line route file, real argv and CRLF grep output, and assert colours, wraps and call counts, not only text. Each acceptance line has its own proof.

## Tried to break it

`src/sum.js:99999999999999999999999` (short, one row), `src/sum.js:3-1`, `x.y()()`, `__proto__` and `constructor.name` (the occurrence set is a `Set`, not an object), `/etc/passwd.txt:3` (left out), `../x.ts:3` (left out), `a.ts:`, `-e`, `sum(`, `(x)`, an unclosed fence, 25 paths. Nothing threw, nothing wrapped, no false red row.

## Findings (none blocks shipping)

1. `hooks/register.tsx:155-164`: a cited line of `0` (`src/sum.js:0`) is `found`. Right would be `short`, or left out; no file has a line 0. Rare in practice.
2. `hooks/register.tsx:40` and `types/index.d.ts`: "no reply checked yet" is `null`; the spec's State section says `undefined`. Nothing the person sees differs.
3. `hooks/register.tsx:31`: the extension test is case-sensitive, so `README.MD:99` is not a path and is left out. Safe side; an `i` flag would check it.
4. `hooks/register.tsx:149`: a path with a cited line under an ignored folder that is reached only by suffix (`pkg/index.js:10` inside `node_modules`) is a red `not on disk`, because the listing excludes ignored files. A path given from the session folder or the repository root resolves through `$.fs.exists` first, so this needs an unusual citation.
5. Shaped ordinary words in backticks (`GitHub`, `i.e`) are symbols and draw a yellow `?` when the repository does not hold them. Soft by design; the spec's closed rule admits them.
6. For the clerk: `docs/engine.js` needs the `fs.exists` stand-in before the demo card moves; with it the scripted answer gives `1/1 found`, as drawn above.

## Bar

Functional: the live run proves the whole path on real events. Original: no shipped widget checks what Claude's prose claims about the tree. Enjoyable: silent when the reply holds, one line when it does not, one press to ask for a correction, and it costs no tokens.
