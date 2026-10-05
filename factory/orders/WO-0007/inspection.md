# Inspection of WO-0007 (notebook-widget)

Verdict: **pass**, with six findings, none blocking.

## What was run

- `check.ts` with the spec: `PASS  notebook-widget meets the standard.`
- `render.ts` at rest, `--turns 1`, `--turns 3`, and every verb plus odd input through `--do`.
- Populated cards: `render.ts` cannot call a plugin tool, so the rows were drawn by `shoot()` from a scratch script that seeded the demo engine's store (3 notes, 8 notes, width 60, odd strings). Nothing in the repo was changed.
- `live.txt` (the director's run) was read; no second live run was made.

## Frames

Empty, 20 and 40 columns: matches the spec's drawing; the sentence wraps cleanly, no border broken.

```
│ Notebook         │      │ Notebook                             │
│ Nothing noted    │      │ Nothing noted yet.                   │
│ yet.             │      │ Claude jots here what the next       │
│ Claude jots here │      │ session should know of this project. │
```

Three notes restored, and the full card at 20 columns: as drawn in the spec.

```
│ Notebook                      3 kept │      │ Notebook    full │
│ 1 Tests need Docker: run make up fi… │      │ 1 Tests need Do… │
│ 2 Prices are integer cents, never f… │      │ 8 Deploys go th… │
│ 3 src/legacy is generated; edit tem… │      │ full, replacing  │
│ /notebook-widget show: in full       │      │ show: in full    │
```

At 60 columns the card stays 40 wide; after `/widgets width` 60 the rows use the room and the two closing lines keep the long wording. Every row is one line at every width.

## Commands

- `show`, `drop 1`, `drop`, `clear` on an empty notebook answer as the spec says; `drop 99999999999999999999999` echoes 20 characters; `note hi`, `clear all` answer the usage and change nothing; `SHOW` works.
- After `off`: `show`, `clear`, `drop 1` each answer `Notebook is off.` and leave the switch off; bare toggles back on.

## Code against the spec and the standard

- `session.start` reads only `isOn` while off; `open()` (store read, tool registration) runs only when on.
- `tool.call` and `prompt.submit` check the switch first. `session.compact` calls `next(e)` first, as it must, and touches `book` only when on.
- Verbs never switch on. Switching off writes only `isOn`. No timer, no clock, no file. Store keys are `isOn` and `notes:<folder>` only.
- `replace` and the typed `drop` argument are echoed through `String()` and cut to 20 characters.
- Spec note 2 was settled by answering `Already in the notebook.` when the text is held at another number, and A4 tests it. Note 11 is tested in A6 and A12.
- Tests: 15, one per acceptance line, with realistic notes, Windows and POSIX paths, the earlier `{ text, at }` shape and a stand-in beneath for `session.compact`. They prove the lines and do not only agree with themselves. They cannot show a truncated row; the seeded render above does.

## Live run (`live.txt`)

- `on`, the `jot` call (`Noted (1 of 8).`), `show` (`1 note for this project:` / `1. Tests run with bun test.`) and `off` all answered as the spec says. No error.
- The real `tool.call` event reached the hook with `text` at the top level, as the tests assume. The session found the tool through ToolSearch before calling it.
- Store: `isOn: false` and `notes:c:/users/omarrodriguez/.claude-factory/scratch-project` holding the one string. Nothing else.
- Not shown: the read-back. The notebook was empty at the only prompt, so no context block was attached in a real session (finding 1).

## Findings

1. **Read-back is unproven live.** `live.txt` is a first run; the block is only attached when notes already exist. The spec's own Live section names the proof: a rerun whose first turn mentions the note. Right: the director reruns the same command once (the scratch project now holds the note) and checks the first assistant turn. The mechanism (`context` on `prompt.submit`) is the one collision-widget and redact-widget already ship with, so this does not hold the order.
2. **Stored entries are read but not cleaned** (`kept()`, `register.tsx:39`). The earlier version allowed 240 characters; such a note is kept at 240, shown and read to Claude at that length, past the spec's "each at most 200". An empty string in the store draws a row that is only a number (`3` and blank). Right: `kept()` cleans each entry as the tool does (single spaces, trim, cut to 200) and skips empties. Reachable only from an old or hand-edited store. Partly a spec gap.
3. **`replace` with the text that note already holds** (`register.tsx:217`) rewrites the store, answers `Noted (n of 8).` and turns the number green, though nothing changed. Right: answer `Already in the notebook.` and write nothing.
4. **Two `jot` calls in flight together** (`register.tsx:209-226`): each reads `book`, then `keep()` sets a fixed value, so the second would drop the first's note while both answer `Noted`. Not reproduced; Claude Code normally runs such tools one at a time. Right: compute the new list inside `update($, book, held => ...)`.
5. **The demo shows only the empty card.** `--turns 1` and `--turns 3` never change the card because the demo engine's scripted turn has no `jot` call; the spec's Demo section says a stand-in is needed. The widget is right; the shipper must add the scripted call or the demo page will show a notebook that never fills.
6. **A wide glyph at the cut** (an emoji in a note) pushes the `…` one column into the right padding in the render tool. The border holds. Terminal-dependent; no change asked.

## The bar

Functional: yes. Original: it is the only widget that gives Claude a tool of its own and carries something across sessions, and the person can see and drop every note. Enjoyable: the green number on a fresh note and the `+1` are the right small reward. Better than the earlier version on every fault of the brief.
