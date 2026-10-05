# WO-0003 Collision (rebuild of collision-widget)

## Purpose
For someone running two or more Claude Code sessions on one machine (two terminals, a worktree and its parent, a subagent-heavy run next to a manual one). When this session is about to edit a file that another session edited after this session last read it, the edit is stopped before it runs, Claude is told to read the file again, and the card shows the person which files are shared, with which session, and what happened to each.

## Card
Title `Collision`. Note, first that applies: `blind` (error), `<n> met` (meetings, n at most 6), `clear` (files edited here), `idle`. Every note is 5 characters or fewer, so none is cut at 20 columns. No ages on the card, so no timer. In order below: Empty (no file edited here, no other session, no meeting); Watching (no file edited here, another session seen: reached by an edit `tool.check` that read the folder, or by `clear`); Working; Best moment; Error.
```
╭ Collision ───────────────────── idle ╮
│ No shared files. A file appears here │
│ when another session edits one that  │
│ this session edits.                  │
╰──────────────────────────────────────╯
╭ Collision ───────────────────── idle ╮
│ No files edited                      │
│ 1 other nearby                       │
╰──────────────────────────────────────╯
╭ Collision ──────────────────── clear ╮
│ 3 files edited                       │
│ 2 others nearby                      │
╰──────────────────────────────────────╯
╭ Collision ──────────────────── 2 met ╮
│ ✕ register.tsx         api · stopped │
│ ✓ …-long-name.test.tsx web · re-read │
╰──────────────────────────────────────╯
╭ Collision ──────────────────── blind ╮
│ Cannot write the shared folder.      │
│ Others cannot see edits made here.   │
╰──────────────────────────────────────╯
```
- Two count lines, always both unless Empty: `plural(n, 'file') + ' edited'` or `No files edited`; `plural(n, 'other') + ' nearby'` or `No others nearby`. Each is 16 characters or fewer and is one line at every width.
- Meeting rows, newest first, at most 6; the count lines are not shown with them. State is a glyph and a word, with colour only as a third cue: `✕` `stopped` red (an edit was refused, no re-read yet), `!` `changed` yellow (a command changed the file, seen afterwards), `✓` `re-read` green (Claude read it again). At 30 columns or more a row is glyph, name, and `<place> · <word>` at the right; the place is cut at 8 characters with `…` at its end, the name is the last path segment, truncated at its start with `…` to the room left.
- Under 30 columns a row is the glyph and the name, and under the rows one legend line per state present, in this order: `✕ edit stopped`, `! Bash changed`, `✓ read again`. One row per meeting at every width; no row or legend line wraps.
- Error: meeting rows (and legend) first if there are any, then the error text, which is prose and wraps at word breaks like the empty text. With no home folder the text is `No home folder found. Cannot watch other sessions.`
```
╭ Collision 2 met ─╮  ╭ Collision clear ─╮
│ ✕ register.tsx   │  │ 3 files edited   │
│ ✓ …name.test.tsx │  │ 2 others nearby  │
│ ✕ edit stopped   │  ╰──────────────────╯
│ ✓ read again     │
╰──────────────────╯
```

## Commands
- `/collision-widget` toggles; `on` and `off` set. Answers `Collision on; /widgets places it.` or `Collision off.`
- `/collision-widget clear` wipes the meetings, this session's recorded edits and reads, and rewrites this session's shared file with no files; `others` is kept. Answers `Collision cleared.` While off it answers `Collision is off.` and changes nothing.
- Anything else answers `Usage: /collision-widget [on|off|clear]` and changes nothing.

## Data
Verified in `plugins/moon-widget/.claude-plugin/types/claude-code/index.d.ts`. There is no file lock, delete or rename on `$.fs` (only `read`, `write`, `list`, `exists`, `stat`, `ancestors`), so the design avoids shared writes instead of locking them: each session writes only its own file, whole, from `$.state`, and never reads it back to merge.

- `session.start`: `$.command.register`, `$.store.get('isOn')`. Nothing else.
- `tool.check` (`ToolCheckInput`: `tool`, `input`, `tool_use_id`): `const verdict = await next(e)`. Returns it untouched when off, when `tool_use_id` is undefined (a query), when `verdict.decision` is `deny`, or when `tool` is not `Edit`, `Write`, `NotebookEdit` or `MultiEdit` (`MultiEdit` is not a tool of this build; it is matched by name so a build that has it is covered). Path from `input.file_path ?? input.notebook_path`. Reads the other sessions (below). If another session's time for the key is inside the window and later than `seen[key] ?? 0`, returns `{ decision: 'deny', reason }` and records a `stopped` meeting. Reason: `collision-widget: <name> was edited by another Claude Code session (in <place>) <span> ago, after this session last read it. Read the file again, then repeat the edit, and tell the user that two sessions are working on this file.`
- `tool.call`: the switch is read first; when off it is `return next(e)` and nothing else. When on and `e.tool` is `Bash`, `const started = await $.clock.now()` before `const ran = await next(e)`; other tools read the clock after. Returns `ran` untouched when `ran.deny !== undefined` or `ran.isError === true`.
  - `Read` (`e.file_path`): sets `seen[key]`; a `stopped` or `changed` meeting for the key becomes `re-read`. No disk write.
  - `Edit`, `Write`, `NotebookEdit`, `MultiEdit`: sets `mine[key]` and `seen[key]` to now, evicts, writes this session's file.
  - `Bash` without `ran.isReadOnly`: candidates are the words of `e.command` (split on spaces, quotes and `> < | ; & ( )`), each resolved as a path, plus every key other sessions hold inside the window; at most 40, each checked with `$.fs.stat(path)`. `$.fs.stat` rejects on a missing path and most words (`npm`, `test`, `-am`) are not files: a stat that rejects is skipped, and the pass goes on to the next candidate. One with `kind: 'file'` and `mtimeMs >= started - 1000` is recorded in `mine`, with one more condition for every candidate another session holds inside the window, whether the command names it or not: its `mtimeMs` must be more than 2000 after that session's time for the key. Otherwise the change on disk is that session's own edit, made while this command ran (`bun test a.test.ts` next to a session editing `a.test.ts`), and nothing is recorded or warned. For each recorded key another session holds later than `seen[key]`, and later than any meeting already recorded for it, records a `changed` meeting and appends one string to `ran.context`: `collision-widget: this command changed <name>, which another Claude Code session (in <place>) edited <span> ago. Read the file again before editing it further, and tell the user.` This is the one warning that arrives after the fact: a command's targets are not known before it runs.
- Reading the other sessions (once per edit `tool.check` and per recording `tool.call`): `$.fs.list(dir)`, keep entries with `kind: 'file'` and a `.json` name, skip those with `mtimeMs` older than the window, `$.fs.read` each, skip one that does not parse or has the wrong shape, skip every one whose `id` is this session's current id or `wrote` (the id of this session's last write that resolved): that file is this session's own. Sets `others` from the rest. If the file at this session's slot name holds an `id` that is neither of the two, another session took the slot: the slot becomes `<id>.json` and the next write goes there. A slot holding `wrote` is still this session's and is overwritten in place under the current id, so the folder never holds two files of one session.
- Writing: `$.fs.write` is attempted at every recorded edit and at `clear`, blind or not. A write that rejects sets `isBlind`; the next one that resolves clears it.
- `$.session.id()` is read at every write and every read of the others (it changes on `/clear` with no `session.start`; `mine`, `seen` and the meetings are kept across the change, and the session's own earlier file is known by `wrote`). If it throws, the hook does nothing: no random stand-in. `$.session.cwd()` resolves relative paths and gives `cwd`.
- `$.env.get`: `CLAUDE_CONFIG_DIR`, else `HOME`, else `USERPROFILE`, read once per session on first use while on. `dir` is `<CLAUDE_CONFIG_DIR>/collision-widget` or `<home>/.claude/collision-widget`: outside the plugin folder, so a reinstall keeps it. With none of the three, `dir` is `null` for the rest of the session: no `$.fs` call is made, no verdict changes, and the card is the no-home error.
- Key of a path: backslashes to slashes; relative joined to `$.session.cwd()`; `/c/…` becomes `c:/…` when the cwd has a drive letter; `.` and `..` folded; then lowercased whole. The key only compares; the card and messages show the last segment of the path as given. Two files differing only in case meet falsely on a case-sensitive disk; the cost is one extra read.

## State and storage
- `$.state` `isOn: boolean`.
- `$.state` `watch: { dir?: string | null; slot: string; wrote: string | null; mine: Record<string, { path: string; at: number }>; seen: Record<string, number>; meets: CollisionMeet[]; others: number; isBlind: boolean }`. `dir` is absent until the env is read. `wrote` is `null` until a write resolves, then the `id` that write carried. `CollisionMeet = { key: string; path: string; place: string; at: number; state: 'stopped' | 'changed' | 're-read' }`; `at` is the other session's edit time, `place` the last segment of its `cwd`. One meeting per key, updated in place, newest first, at most 6. `others` is the count of other sessions with a file inside the window at the last read. `seen` is capped at 200 by oldest time.
- `$.store` `isOn: boolean`. Nothing else.
- File `<dir>/<slot>`: `{ id: string; cwd: string; at: number; files: Record<string, { path: string; at: number }> }`. `files` is `mine` after eviction: entries older than 30 minutes dropped, then if more than 60 remain the ones with the smallest `at` are dropped (by time, never by key order, so a file edited again is the newest).
- Slot: chosen at the first write. Among the entries of `dir` with `kind: 'file'`, a name ending `.json` and `mtimeMs` above 0, the one with the oldest `mtimeMs`, if that is more than 24 hours old; otherwise `<id>.json`. A directory, a link (both list with `mtimeMs` 0) or a name without `.json` is never a slot. This keeps the folder from growing by one file per session with no delete call.
- Constants: window 30 minutes, 60 files, 6 meetings, 40 stats per command, stale slot 24 hours.

## Off
No `tool.check` verdict is changed, no `tool.call` result gains context, nothing is recorded in `$.state`, no file is listed, read, stat-ed or written, no clock, env or session call is made, nothing is drawn. The only work in a hook is the switch check. The shared file is left as it is: its entries age out for the other sessions within the window. There is no timer to stop.

## Demo
At rest: the empty card, note `idle`. After the scripted turn: note `1 met` and one row `✕ <file> api · stopped` for the file the turn's `Edit` targets. The turn in order: the `Read` of that file sets `seen`; the failing `Bash` (`isError`) is returned untouched; the `Edit` is denied at `tool.check` because the stand-in's time is later than that read, and the engine runs the call whatever the verdict, so `tool.call` records it and writes `demo-session.json`; then two successful `Bash` calls with no `isReadOnly` (`npm test`, `git commit -am …`) run the stat pass. Their words are not files, so each stat rejects and is skipped; the edited file is a key the other session holds, and its `mtimeMs` of 0 is not inside either call. Nothing is recorded, no context is added, and the row is still `✕` and `stopped` when the turn ends. A second turn re-reads (`✓`) and is stopped again. Stand-ins the engine lacks: `$.fs.stat` (its `fs` has only `read`, `write` and `list`), answering `{ kind: 'file', size, mtimeMs: 0, isLink: false }` for a path in the engine's file map and rejecting for any other; `$.env.get('HOME')` answering a folder (it answers undefined, which would show `blind`); a file `<home>/.claude/collision-widget/demo-other.json` with `id: 'demo-other'`, `cwd` ending in `/api`, and that `Edit` target under its key in `files` with `at` always the present moment; and `$.fs.list` of that folder returning the entry with `kind: 'file'` and a present `mtimeMs`.

## Cost
No model calls. Tokens only at a meeting: one refusal reason or one context line (about 60 tokens) and the re-read Claude then makes.

## Acceptance
Tests give `env.get`, `fs.list` and `fs.stat` through `ground()`'s `answers` (the list built from the ground's own `files` map) and the tool result through a bottom `tool.call` hook of their own.
- A1: on, nothing recorded: the card shows the empty text and the note `idle`. After an `Edit` passes `tool.call`, the session's file in `dir` holds that path's key with the clock's time and the card shows `1 file edited`, `No others nearby` and the note `clear`; after a second file, `2 files edited`. With no file edited here and one other session seen at an `Edit` `tool.check` that does not deny: `No files edited`, `1 other nearby` and the note `idle`; with two, `2 others nearby`.
- A2: another session's file holds the key, later than this session's last read: `tool.check` for `Edit` answers `decision: 'deny'` with a reason naming the file, the other session's folder and the age, nothing is recorded in `mine`, and the row shows `✕` and `stopped`. After a `Read` of the file through `tool.call`, the same `tool.check` returns the verdict beneath and the row shows `✓` and `re-read`. The other session's file is then rewritten with a later time for the key: the next `tool.check` denies again (a file warns more than once).
- A3: what must pass untouched does. A verdict beneath of `deny` is returned unchanged with no meeting recorded; a `tool.check` with no `tool_use_id` reads nothing and returns the verdict beneath. An `Edit`, a `Write` and a `Bash` whose result has `isError: true`, and an `Edit` whose result is `{ deny }`, each leave `mine`, `seen` and the meetings unchanged, write no file, make no `$.fs.stat` call and return the same object.
- A4: `Write`, `NotebookEdit` (`notebook_path`) and `MultiEdit` are each recorded at `tool.call` and each denied at `tool.check` under A2's conditions. `src/a.ts` against cwd `C:\Work\App`, `C:\Work\App\src\a.ts`, `c:/work/app/src/./x/../a.ts` and `/c/Work/App/src/a.ts` all give one key; `/Work/App/a.ts` and `/work/app/a.ts` give one key.
- A5: a `Bash` call with the command `npm test -am "x" src/a.ts > out.log`, where `$.fs.stat` rejects for every word but `src/a.ts` and reports that one modified during the call: the hook resolves with the result, `mine` holds `src/a.ts` alone, and no context is added. A call whose result has `isReadOnly` makes no `$.fs.stat` call. A command of 100 words, with other sessions holding 20 keys, makes 40 `$.fs.stat` calls and no more.
- A6: a `Bash` call that changed a file another session holds later than `seen`: the result carries one added context string naming the file and the folder, the row shows `!` and `changed`, and a second such call with no newer edit by the other session adds no context. A `Read` of the file then shows `✓` and `re-read`, and the next `Edit` `tool.check` returns the verdict beneath. A file held by another session, not named in the command, with `mtimeMs` inside the call and more than 2000 after that session's time, is recorded and warned about the same way.
- A7: a file another session holds that the command names (`bun test a.test.ts`), with `mtimeMs` inside the call and within 2000 of that session's time: not recorded in `mine`, no context added, no meeting. The same call with `mtimeMs` more than 2000 after that time records it and warns as in A6.
- A8: one engine as session `a`; the test writes session `b`'s file into the ground's `files` before each of `a`'s three edits, with one more entry each time. Afterwards `a`'s file holds its three entries, `b`'s file is the exact text the test last wrote, and the ground's `writes` name only `a`'s file.
- A9: 61 edits with rising times, then the first file edited again: the file holds 60 entries, the re-edited file is among them and the entry with the smallest time is the one dropped. An entry of this session older than 30 minutes is gone from the file at the next write; another session's entry older than 30 minutes does not deny. 201 `Read`s of different files leave 200 keys in `seen`: the oldest is dropped and the newest kept.
- A10: `dir` is under `CLAUDE_CONFIG_DIR` when set, else under `HOME` or `USERPROFILE` plus `.claude`; no write lands under `$.plugin.root`. When `$.session.id()` throws, no file is written, no verdict changes, and the file map never holds a name that is not a session id or a reused slot.
- A11: the first write reuses the name of a `.json` file older than 24 hours when there is one, and writes `<id>.json` when there is none. With only a directory (`mtimeMs` 0) and a 3-day-old `notes.txt` in `dir`, it writes `<id>.json`. If the slot is later found holding an `id` this session never wrote, the next write goes to `<id>.json`. A file in `dir` that is not JSON, or has the wrong shape, is skipped and the other sessions' files still count.
- A12: `session.id` answers `a` (through `ground()`'s `answers`), one file is recorded by an `Edit` and a second by a `Bash` call, then `session.id` answers `b`. An `Edit` `tool.check` of each file returns the verdict beneath, `others` is 0 and the card shows `No others nearby`. After the next edit `dir` holds one file, at the first slot name, with `id` `b` and all three entries. After `clear`, an `Edit` `tool.check` of the first file still returns the verdict beneath and no meeting is recorded.
- A13: `$.fs.write` rejects: the card shows `Cannot write the shared folder.` and the note `blind`, and `tool.check` still denies a file another session's readable file holds. At the next edit whose `$.fs.write` resolves, the note is no longer `blind`, the error text is gone and the file holds the edit. With no env variable giving a folder: the card shows `No home folder found.` and the note `blind`, no `$.fs` call is made, and an `Edit` `tool.check` returns the verdict beneath.
- A14: `clear` empties the meetings, `mine` and `seen`, writes the session's file with no files, and answers `Collision cleared.`; with another session seen, the card is then `No files edited` over `1 other nearby`. While off, `clear` answers `Collision is off.` and writes nothing; an `Edit` `tool.check` over a colliding file returns the verdict beneath; a `Bash` and an `Edit` `tool.call` make no `clock`, `fs`, `env` or `session` call and add no context; the state is unchanged.
- A15: seven meetings keep the newest six, and a second meeting for a key updates its row instead of adding one. At 20 columns each meeting is one row of glyph and name, with no place or word and a long name truncated at the start, and the legend holds `✕ edit stopped`, `! Bash changed` and `✓ read again` only for the states present; at 40 and 60 each row holds its place and word and there is no legend; no row wraps. At 20 columns the Working card's lines are `3 files edited` and `2 others nearby`, one row each, and the notes `idle`, `clear`, `blind` and `6 met` are each whole.

## widget.json
- title: `Collision`
- category: `Session`
- shows: `Stops an edit to a file another Claude Code session on this machine changed since this one last read it, and has Claude read it again first`
- commands: `/collision-widget [on|off|clear]`
- cost: `` (empty)
