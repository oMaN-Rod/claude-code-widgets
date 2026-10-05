# Inspection: WO-0031 Attic (`attic-widget`), third build

Verdict: **pass**. Both faults of the second inspection are fixed, nothing new came in with the fixes, and the live proof holds on this build. Four small points are listed for the record; none is worth another trip.

## What was run

- Checker: `PASS  attic-widget meets the standard.` 20 tests pass.
- Render at rest, `--turns 1`, `--turns 3`, and with `show`, `Show`, `stow PowerShell`, `keep WebFetch`, `clear`, `stow Bash`, `keep`, `KEEP  x  y`, `stow <b>`, `keep ToolSearch`, an 80-letter name, `off`. The harness lists no tools, so every frame is the `no search` card; every answer is as specified and no row leaves the border.
- Four probe tests on a scratch copy (outside the floor) with the widget's own kit, for states the harness cannot reach.
- Live: read `live.txt` (the director's three runs on this build, logged 21:50); no run of my own.

## Frames that matter

Harness, 20 and 40 columns (the blind state, as drawn in the spec):

```
│ Attic  no search │   │ Attic                      no search │
│ No ToolSearch in │   │ No ToolSearch in this session, so    │
│ this session, so │   │ nothing is moved. Still counting.    │
│ nothing is       │
│ moved. Still     │
│ counting.        │
```

Probe, switched on mid-session in session 8 over a stored book, then `keep` on a deferred MCP tool the session had not recorded, then one turn:

```
before keep   note `2 away`   2 tools in the attic, 1 forward.
keep answer   mcp__github__search_pull_requests_and_issues stays listed.   (one invalidate)
its describe  { description, isDeferred: false }
show          forward mcp__github__...: kept by you
after a turn  On demand 3.1k -> 8.4k tokens / 5.3k less in every request   (base left at 3100)
```

Probe, huge values: 1234 tools, session 5000, 123,456,789 tokens on demand. 40 columns `On demand now: 123457k tokens`; 20 columns `123457k on dema…`, cut inside the border, no wrap.

## The two faults of the second inspection

1. A hook switching the widget on: fixed. `woken` (line 343) reads the store only while the `isOn` state value has version 0, and `session.start` always writes it. Probe: session started off, switched on and off again, the store's `isOn` then set true from outside, a describe raised: answer untouched, no card, `stow PowerShell` answers `Attic is off.` The A13 test proves the same on the kit and on a bare bench (one store read, state `isOn false` at version 1 only).
2. `keep` on an unseen on-demand tool: fixed. `shelved` invalidates once, `placed` (line 363) forwards a kept tool when its describe arrives deferred, and `show` prints `kept` only for a tool the book knows as listed. A9's last block proves it with a mid-session switch-on.

The two wording points are fixed too: a session at a drive root prints `in /`, and the dry-run count includes a stowed or kept tool.

## What the live runs showed

- Session started on, no verb: seven `would go` rows (`Agent`, `ListAgents`, `PowerShell`, `ReportFindings`, `ScheduleWakeup`, `Skill`, `Workflow`) and `On demand now: 24.3k tokens`. Real describes reach the book and real breakdown rows of kind `deferred` are read.
- The spec's run: `stow Skill` answered the specified sentence, `show` gave `away Skill: stowed by you`, the would-go rows without `Skill`, and `On demand now: 25.2k tokens`. The 0.9k rise over the unmoved session is the proof that the `tool.describe` answer moved the schema. The `tool_reference` for `Skill` is not that proof: the unmoved session returned it as well.
- `clear` forgot 36 tools; no error in any run; the store was left as `isOn: false` and nothing else.

## Findings (small, none blocks)

1. `figures`, line 171: when on-demand tokens fall below half the baseline the change row is dropped (`On demand 3.1k -> 1.0k tokens` alone). The spec gives `<d> more in every request` whenever on-demand fell, and the A5 test asserts the deviation. What stays on the card is true; right is to print `2.1k more in every request`, or have the spec name the guard.
2. `stow` on a tool the engine already defers (probe: a deferred `WebFetch`) answers `is in the attic from the next request. One prompt-cache miss.`, counts it as `1 tool in the attic.`, and a later call reads `Claude fetched WebFetch from the attic.` Nothing moved and there is no cache miss. Right: answer that it already waits on demand, and leave it out of the away count.
3. In the dry run `show` opens `watching, nothing moved.` and the next line can be `away Skill: stowed by you` (it is in the live run). The spec words the line so; `watching, 1 stowed by you.` would be truer. A design wording point for a later revision.
4. In a session switched on mid-way the first `keep` of any tool invalidates even when the tool turns out to be listed already: one prompt-cache miss the spec's "only when the tool's place changed" would spare. It is the price of fixing fault 2 and the right side to err on.

## What is good and should stay

The plan is a pure function of the stored book, so a tool's answer does not change within a session (A4). Every hook returns `next(e)` first while off; verbs answer `Attic is off.`; there is no timer, no file, no module-level `let`; the store holds `isOn` and `book:<key>` only. A throw in the widget's own work still returns the engine's answer. The floor answer does not depend on the session's list; an empty tool list is blind; a call-only entry never counts as recorded; `show` caps at 20 rows. The idea is new to the catalog: it is the first widget that changes what each request carries from counted evidence, undoes itself when the evidence turns, and shows the engine's own number for it.
