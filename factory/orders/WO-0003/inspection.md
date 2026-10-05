# WO-0003 Collision: inspection

Verdict: **pass**. The checker passes, every fault in the order's brief is gone, and the widget stopped a real edit in a real session.

## Frames

`render.ts` alone shows only the empty card and, after a turn, `blind` / `No home folder found.`: the demo engine has no `env`, `fs.stat` or peer file yet (finding 1). The frames below come from the same renderer with the spec's stand-ins supplied from a scratch script.

```
╭ Collision  1 met ╮  ╭ Collision ──────────────────── 1 met ╮
│ ✕ sum.js         │  │ ✕ sum.js               api · stopped │
│ ✕ edit stopped   │  ╰──────────────────────────────────────╯
╰──────────────────╯
╭ Collision  6 met ╮  ╭ Collision ──────────────────── 6 met ╮
│ ✕ sum.js         │  │ ✕ sum.js          payment… · stopped │
│ ✕ format.js      │  │ ✕ format.js       payment… · stopped │
│ ✕ test.js        │  │ ✕ test.js             root · stopped │
│ ✕ package.json   │  │ ✕ package.json        root · stopped │
│ ✓ guide.md       │  │ ✓ guide.md            root · re-read │
│ ✕ index.js       │  │ ✕ index.js            root · stopped │
│ ✕ edit stopped   │  ╰──────────────────────────────────────╯
│ ✓ read again     │
╰──────────────────╯
╭ Collision   idle ╮  ╭ Collision  blind ╮
│ No files edited  │  │ Cannot write the │
│ 2 others nearby  │  │ shared folder.   │
╰──────────────────╯  │ Others cannot    │
                      │ see edits made   │
                      │ here.            │
                      ╰──────────────────╯
```

Every state matches the spec's drawings at 20, 30, 40 and 60 columns. No line wraps or breaks the border, the notes are whole, and blind with rows keeps the error text last. The 60-column card stays 40 wide, as the standard asks.

Verbs: `on`, `off`, bare, `clear`, `CLEAR`, ` on ` and `bogus` answer as the spec says. `clear` while off answers `Collision is off.` and a turn afterwards draws and writes nothing.

## Live runs

Three runs through `live.ts`, in the factory's scratch project.

1. On, an `Edit` of `a.txt`, then `echo two >> a.txt`. Both were recorded: `<config>/collision-widget/<session id>.json` holds one key, the lowercased whole path, with the time the Bash stat pass found. No context was added, nothing errored, and the store holds `isOn` only.
2. A new session read `a.txt` while off, switched on, then edited it. The edit was refused at `tool.check` with the spec's reason, naming the file, the place and `35s ago`. The model quoted it and told the user two sessions were at work. The refused call was not recorded and no file was written.
3. As 2, but the file was also changed on disk after the read. The widget's refusal arrived, not core's own "modified since read" error. So the widget answers before core does and adds what core cannot: which session, and a word to the user.

## Code and tests

- Every hook but `session.start`, `command.run` and `ui.render` checks the switch first; `tool.call` reads no clock while off. No timer exists.
- Writes go only to the session's own file under the config folder. `$.session.id()` throwing means no write and no verdict change. No random id.
- Eviction and the `seen` cap sort by time. A directory, a link or a non-`.json` name is never a slot.
- The tests feed results shaped like the real ones (confirmed against the live output) and assert each case of each line on its own data. A3, A5, A7 and A14 prove absence by counting calls, not by agreeing with themselves.

## Findings

None blocks. 1 is for the clerk; 2 to 6 are for a later order, and each is the spec's choice, not a slip in the build.

1. **Demo stand-ins** (`docs/engine.js`, clerk). Add `env.get('HOME')`, `fs.stat`, the `demo-other.json` peer and a `fs.list` entry with `kind` and `mtimeMs`. The peer's `at` must be strictly later than the turn's `Read`: with a fixed time the card showed `clear` and no row; with `Date.now() + 5` at each read it showed `1 met` and `✕ sum.js api · stopped` after turns 1 and 2.
2. **Reason text can be untrue** (`register.tsx:369`). When `seen` has no entry for the file (it was read while off, came in by an @-mention, or `clear` wiped it), the reason still says "after this session last read it". Run 2 read the file after the other edit and was told the opposite. Right: with no read on record, say "and this session has no read of it on record".
3. **Doubled prefix** (`register.tsx:369`). The engine already writes `denied by plugin collision-widget:`, so the model reads `collision-widget: collision-widget: a.txt was edited`. Right: drop the prefix from the reason; keep it on the Bash context line, which the engine does not label.
4. **A finished session counts as nearby** (`scan`, `register.tsx:157`). Runs 2 and 3 were stopped by a session that had already ended. Its file stays in the window for 30 minutes, so `1 other nearby` and "two sessions are working on this file" can describe one live session. Right: say "edited by another session" without claiming it is still at work, or shorten the window for a file whose `at` has stopped moving.
5. **Narrow wide rows** (`register.tsx:266`). At 30 to 35 columns an 8-character place leaves the name 5 to 10 characters (`✕ …m.js payment… · stopped`). Right: shorten the place before the name.
6. **Meetings never age** (`met`, `register.tsx:114`). A `stopped` row from hours ago stays until `clear` and the note stays `N met`. Right: drop a meeting once its `at` leaves the window.

## Left behind by the live runs

`~/.claude-factory/collision-widget/d32b3517-….json` (ages out of the window 30 minutes after 15:32) and three added lines in the scratch project's `a.txt`. A live run before then will show `1 other nearby`.
