# Squiggle (`squiggle-widget`, WO-0013)

## Purpose
For the person who names a file in a prompt from memory, a stack trace or a chat message. While they type, a word written as a path is checked against the project's files: one that exists turns green in the prompt box, one that does not gets a red underline, and the card says what each resolves to or the nearest real name. The misnamed-file turn is caught before Enter, when fixing it costs nothing. Nothing is added to the prompt and the draft is never rewritten.

## Card
Title `Squiggle`. The empty, working and error texts are sentences and wrap at any width. Word rows, `+N more` and the partial line are one line each; a word truncates at its end, a path at its start (`truncate-start`) so the file name stays.

Empty (note `412 files`), body wraps:
```
│ Type a file name in your prompt: it  │
│ lights up if it exists.              │
```
Working, before the first index is ready (note `indexing`): `Reading the file list.`

Best moment (note `1 missing`; with no miss `2 found`):
```
│ ✗ auth-midleware.ts                  │
│   nearest src/auth-middleware.ts     │
│ ✓ src/db.ts                          │
│ ✓ register.tsx  3 files              │
```
Missing words first, then found, each in draft order; at most 4 words, then a dim `+2 more`. `✗` red, `✓` green, the `nearest` row dim. A miss with no near name has no second row. A found word shows the path it resolves to, or `<word>  N files` when several match.

Error (note `unchecked`): `Could not list this project's files. Nothing is checked.`
Partial index (note `partial`): found rows as above, then dim `Partial list: misses not marked.` (at 20 columns `Partial list.`), whatever made the index partial. With no rows, the empty text.

Busiest at 20 columns (note `1 ✗`):
```
│ ✗ auth-midlewar… │
│   …middleware.ts │
│ ✓ src/db.ts      │
│ +2 more          │
```

## Commands
- `/squiggle-widget`, `on`, `off`: the switch. `on` builds the index, then fills the card from the draft already in the box.
- `/squiggle-widget check [text]`: checks `text`, or the draft in the box when none is given, and answers `Squiggle: 412 files.` followed by one line per word: `✓ src/db.ts`, `✗ auth-midleware.ts  no such file, nearest: src/auth-middleware.ts`, or `No file name in that text.` It ignores the cursor rule: every word is judged, the one under the cursor too. It rebuilds a stale index first. It never changes the box or the card. While off it answers `Squiggle is off.`
- No `fix` verb: the widget only paints and reports.

## Data
- `on('prompt.edit')`: every edit. `const r = await next(e)`; words are found in `r.text` (not `e.text`), and the hook returns `{ ...r, decorations: [...(r.decorations ?? []), ...mine] }`. Inside this hook: no `$.process`, no `$.fs`, no `$.prompt` call. Any throw while checking returns `r` as it came.
- `PromptDecoration`: `{ start, end, color: 'green' }` for a found word, `{ start, end, color: 'red', underline: true }` for a missing one; offsets are UTF-16 units into `r.text` and cover the path only (not wrappers or `:42`).
- `$.process.run(['git', '--no-optional-locks', 'ls-files', '--cached', '--others', '--exclude-standard'], { cwd: repo.root, timeoutMs: 3000 })`: at switch-on, at `session.start` when on, and at `turn.complete` when the index is stale.
- `$.fs.list`: only when `$.session.repo()` is null. Breadth-first from `$.session.cwd()`, skipping names that start with `.` and `node_modules`; stops at 2,000 files or 200 folders (then partial).
- `on('tool.call')`: after `next`, a `Write`, `Edit`, `NotebookEdit`, `Bash` or `PowerShell` call that was not denied and is not an error sets `index.isStale`. Nothing else is read.
- `on('turn.complete')`: if stale, rebuild once, then refill the card from `$.prompt.read()`.
- `on('prompt.submit')` (`composer`, `bridge`, `sdk`): empties `found`; passes the prompt on untouched.
- `$.prompt.read()`: at switch-on, after a rebuild, and for a bare `check`. A throw or a missing method counts as an empty draft.

### What counts as a path
Split the text on whitespace. From each word strip leading `@ ( [ " ' \` <` and trailing `) ] " ' \` > , ; : ! ? .`, then a trailing `:line` or `:line:col`. Turn `\` into `/` and drop a leading `./`. The word is never a candidate if it contains `://`, `*`, `?`, `{`, `$` or a `..` segment, or starts with `/`, `~`, `www.` or a drive letter. Otherwise it is a candidate when:
- it has no slash and ends in an extension that some indexed file has (so `2.1.0` and `e.g` are not); or
- it has a slash and its first segment is the name of a folder in the index (so `and/or` is not).

At most the first 8 candidates of a draft are checked.

### Verdicts
- Found: the word equals an indexed path or folder, or ends one at a `/` boundary (so `x.ts`, `hooks/x.ts` and a cwd-relative path all resolve). Matching is exact in case.
- Nearest: over lowercased base names whose length is within 2 of the word's, Levenshtein distance at most 2, base name at least 4 characters before the extension; at most 2,000 comparisons per word; ties go to the shorter path, then alphabetical. A case-only difference is a miss whose nearest is the real file.
- A miss without a slash and without a near name is not a verdict: not painted, not listed (`Node.js`, a new file).
- A miss with a slash is listed as `no such file` even with no near name.
- In the box and on the card, the word the cursor touches (`start <= cursor <= end`) is never missing: it is painted and listed only if found. `check` does not apply this.
- Partial index: only found words are painted or listed.

## State and storage
- `$.state` `isOn`: boolean.
- `$.state` `index`: `{ status: 'building' | 'ready' | 'failed'; source: 'git' | 'folder'; count: number; isPartial: boolean; isStale: boolean; builtAt: number }`.
- `$.state` `paths`: `string[]`, forward slashes, relative to the repo root (or cwd), at most 10,000; more, or truncated git output, sets `isPartial`.
- `$.state` `found`: `{ word: string; verdict: 'found' | 'missing'; to: string; matches: number }[]`, at most 8. Written only when it differs from what is held, so a key that changes no verdict redraws nothing.
- One module-level `const` lookup (path set, folder set, extension set, base name to paths) derived from `paths` and tagged with `builtAt`. The hook reads `index` each edit and reads `paths` only when the tag differs (after a rebuild or a reload).
- `$.store` `isOn`. No files.

## Off
The `prompt.edit` hook returns `next(e)` untouched; no process runs, no folder is listed, `tool.call`, `turn.complete` and `prompt.submit` pass through. Switching off resets `index`, `paths` and `found` and empties the lookup. Paint already in the box goes at the next edit.

Known and not a fault: paint appears on the first edit after switch-on or after a rebuild; the card is right at once. Ignored files are not indexed, so they are never painted.

## Demo
The engine has no `prompt.edit` and no `$.prompt.read`. The widget must start without them. Stand-in asked of `docs/engine.js`: `prompt.read: async () => ({ text: 'fix src/formt.js and test.js', cursor: 28 })`. `formt` has 5 characters and is 1 edit from `format`, so the Nearest rule gives `src/format.js`; the cursor touches `test.js`, which exists.
- At rest with the stand-in: note `1 missing`, rows `✗ src/formt.js`, `nearest src/format.js`, `✓ test.js`. Without it: the empty card, note `8 files`.
- After the scripted turn: `prompt.submit` empties the list; the turn's `Edit` marks the index stale, so `turn.complete` rebuilds and refills from the stand-in and the card ends on the same three rows. Without the stand-in: the empty card, note `8 files`.

## Live
```
bun factory/tools/live.ts factory/floor/plugins/squiggle-widget --say "/squiggle-widget on" --say "/squiggle-widget check open README.md and REDME.md" --say "Create the file notes/plan.md containing the word hi. Do nothing else." --say "/squiggle-widget check notes/plan.md and notes/plam.md" --allow "Write"
```
A good run: the first check answers a file count, `✓ README.md` and `✗ REDME.md  no such file, nearest: README.md`; the second answers a count one higher, `✓ notes/plan.md` and `✗ notes/plam.md  no such file, nearest: notes/plan.md`. This proves the folder index, the matcher and the rebuild after a turn that wrote a file. A headless session has no prompt box, so `prompt.edit` is proved by tests only.

## Cost
None. No model call, nothing added to a prompt. One `git ls-files` at switch-on and one after each turn that ran a writing tool.

## Acceptance
- A1: On with a ready index and no path in the draft, the card shows the empty text with the note `N files` (`1 file` for one); before the index is ready it shows `Reading the file list.` with the note `indexing`.
- A2: Candidates: `src/x.ts`, `x.ts`, `./x.ts`, `src\x.ts` and a folder `src/hooks` are; `https://a.b/x.ts`, `2.1.0`, `and/or`, `src/*.ts`, `../x.ts`, `/etc/x.ts`, `C:\x.ts`, a bare word and an extension no indexed file has are not; only the first 8 are checked.
- A3: Wrappers and suffixes are stripped: `(src/x.ts).`, `"x.ts",`, `@src/x.ts` and `x.ts:42:7` each resolve to the same file, and the decoration covers only the path.
- A4: Found: an exact path, a path ending at a `/` boundary, a base name with one match (the row shows its path) and with several (`N files`), and a folder; a case-only difference is missing with the real file as nearest.
- A5: Nearest follows the stated rule (distance, length window, 4-character minimum, tie-break, 2,000-comparison cap): `src/formt.js` gives `src/format.js`, and `src/sun.js` beside `src/sum.js` gives no `nearest` row; a slash-less miss with no near name is neither painted nor listed; a slash miss with no near name is listed without a `nearest` row.
- A6: The hook returns the `text` and `cursor` of `next(e)` unchanged, keeps decorations already on the answer, adds `color: 'green'` for found and `color: 'red', underline: true` for missing, with offsets into the answer's text when a hook beneath rewrote it.
- A7: The word the cursor touches is never painted red or listed as missing, is painted green if found, and turns red once the cursor moves past it.
- A8: The best-moment card: missing first, each group in draft order, the `nearest` row, at most 4 words then `+N more`, notes `N missing` and `N found`; at 20 columns the note is `N ✗`, paths truncate at the start and no row wraps.
- A9: During `prompt.edit` no `$.process`, `$.fs` or `$.prompt` call is made, `found` is not written when the verdicts did not change, and a throw while checking returns the answer of `next(e)` as it came.
- A10: The index is built with the stated `git ls-files` call at switch-on and at `session.start` when on; with no repository it walks folders, skipping dot names and `node_modules`; a failed or timed-out listing shows the error card and paints nothing; over 10,000 paths, truncated output or a capped walk each show the note `partial` and the line `Partial list: misses not marked.` (`Partial list.` at 20 columns, on one line) and mark only found words.
- A11: A successful `Write`, `Edit`, `NotebookEdit`, `Bash` or `PowerShell` call marks the index stale and a denied or failed one does not; `turn.complete` then lists the files once and refills the card from `$.prompt.read()`; a turn with no such call lists nothing.
- A12: Switched on with a draft in the box, the card lists its words at once from `$.prompt.read()`; when `$.prompt.read` is missing or throws the widget still starts and shows the empty card.
- A13: `prompt.submit` from `composer`, `bridge` and `sdk` empties the list and passes the prompt on with its text and context unchanged.
- A14: `check <text>` answers the count and one line per word, or `No file name in that text.`; bare `check` uses the draft and reports a missing word under the cursor as missing; it rebuilds a stale index first, never calls `$.prompt.fill`, leaves `found` alone, and answers `Squiggle is off.` while off; an unknown verb answers the usage.
- A15: Switching off resets `index`, `paths` and `found`; while off `prompt.edit` returns exactly what `next(e)` gave, and no process runs at `session.start`, `tool.call` or `turn.complete`.

## widget.json
```json
{
  "title": "Squiggle",
  "category": "Project and git",
  "shows": "Underlines file names that do not exist, as you type them in the prompt box, and paints the ones that do green",
  "commands": ["/squiggle-widget [on|off|check [text]]"],
  "cost": ""
}
```
