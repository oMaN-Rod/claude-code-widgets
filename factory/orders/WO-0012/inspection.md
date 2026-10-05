# WO-0012 Ledger: inspection

**Verdict: pass.** The widget meets the spec, the standard and the bar. One figure for a project, honest about what it could not price, and a card that reads at every width.

## Checker

`bun factory/tools/check.ts factory/floor/plugins/ledger-widget --spec factory/floor/orders/WO-0012/spec.md` answers `PASS  ledger-widget meets the standard.` (19 s, run alone). A first run made while six renders were running beside it timed out two tests (`standard: stays inert while off` at 46 s, the first `A1` at 27 s); run alone it passes, so that was the machine, not the widget.

## Frames

At rest (empty), 20 and 40 columns, as drawn in the spec:

```
╭──────────────────╮   ╭──────────────────────────────────────╮
│ Ledger   project │   │ Ledger                       project │
│ Nothing counted  │   │ Nothing counted yet.                 │
│ yet.             │   │ Each turn's cost is added here.      │
│ Each turn's cost │   │ /ledger-widget scan adds this        │
│ is added here.   │   │ project's saved sessions.            │
│ /ledger-widget   │   ╰──────────────────────────────────────╯
│ scan adds this   │
│ project's saved  │
│ sessions.        │
╰──────────────────╯
```

After one turn, then a scan the stand-in engine cannot serve (fault row replaces the hint):

```
╭──────────────────╮   ╭──────────────────────────────────────╮
│ Ledger   project │   │ Ledger                       project │
│ $0.44            │   │ $0.44                      1 session │
│ 1 session        │   │ this session $0.44  since 4 Oct 2026 │
│ now $0.44        │   │ Saved sessions could not be read     │
│ scan failed      │   ╰──────────────────────────────────────╯
╰──────────────────╯
```

`--turns 3` gives `$0.56`, still `1 session`: the running total replaces, it is not added twice. Widened to 60 the right-hand parts move to the edge. 21, 35 and 39 columns keep the short rows; no line wraps or breaks the border at any width from 20 up.

## Verbs and attempts to break it

- `off`, bare: `Ledger off.`, no card. `scan`, `show`, `clear` while off: `Ledger is off.` each, switch untouched.
- `bogus`, `scan now`, `on off`: the usage line, nothing changed. `SCAN ` and `  ON  ` work as `scan` and `on`.
- `clear` then `show`: `Nothing counted yet for project.`, `This session: $0.00` and the not-read-yet line.
- Off after two turns, the three verbs, then on: the same card, no second git run (A12 proves the call count).

## Live run (`live.txt`, made by the director)

- `on`: `Ledger on; /widgets places it.`
- one real turn, then `scan`: `Read 2 saved sessions of scratch-project.` / `$0.18 over 2 sessions since 4 Oct 2026.`
- `show`: `scratch-project (C:\Users\O\.claude-factory\scratch-project)`, the same summary, `This session: $0.08`, and no not-read-yet line.
- `off`: `Ledger off.` Store: `{ "isOn": false }`, no other key.

This proves what the tests could only imagine: a real `turn.complete` reaches the widget and `session.usage().cost.usd` is a figure; real session files carry a `cwd` line and a `"type":"cost-state"` record with `totalCostUSD`; the running session's file can be read while it is written; and that session, measured and saved, is counted once (2 sessions, not 3). No error in the run.

## Code and tests

- `turn.complete` returns `next(e)` unchanged and reads only the switch while off. `session.start` does no git and no file read while off. Verbs never switch on. No timer, no `prompt.submit`, no model call.
- Writes: `isOn` in the store and `ledger.json` under `$.plugin.root`, nothing else.
- `ledger.json` of any wrong shape reads as empty; a damaged entry is dropped, not shown (A14 feeds six broken files).
- Money: 99.994 is `$99.99`, 99.996 is `$100`, 1234567.8 is `$1,234,568`. Row `mine` gives up `since `, then the date, never the money (spec note 1).
- The spec notes are settled: files too long to read have their own row and their own clause in the summary (`1 too long to read` / `1 too long`), switch-on by command reads the file, a root of `/` still has a name, a Windows root is proven in A4 with the folder `C--Work-Project`.
- 31 tests over A1 to A15 with session files shaped like the real ones (a user message that itself contains `"type":"cost-state"` and `"cwd"`, so a careless matcher would fail). Each proves its line; none only agrees with itself.

## Findings (none blocking)

1. `hooks/register.tsx`, `open` (line 143): `$.session.root()` is awaited with no catch, so a rejection at `session.start` would stop the hook before `next(e)`. Right: fall back as `session.id` does, or leave `view.key` empty and draw nothing. Not seen in the live run; for the next touch of this widget.
2. Only unpriced sessions (A7): the card shows `$0.00   0 sessions` over `5 without a cost record`. True, but `0 sessions` beside five that exist reads oddly. Right would be the empty sentence with the unpriced row under it. A matter of taste the spec left open.
3. `hooks/register.tsx` line 274: `const paired =(` lacks a space. Cosmetic.
4. For the clerk: the stand-in engine answers `Could not read /demo/home/.claude/projects.` to the demo's opening `scan`. The three files of the spec's Demo section must be added to `docs/engine.js`, or the demo page shows the fault row at rest.
5. For the catalog: a session over 3,500,000 bytes that was never measured is not priced, and these are the dearest. The card says so (`too long to read`); the limit is the spec's and stands.
