# WO-0018 Tap: inspection

Verdict: **pass**. It meets the spec and the standard, and it does something no shipped widget and no engine feature does: a connected MCP tool read on a clock with no model turn.

## What was run

- `check.ts` with the spec: `PASS  tap-widget meets the standard.` (20 tests, 0 fail).
- `render.ts` at rest, `--turns 1`, and with `add`, `run`, `show`. The demo engine does not simulate `mcp.call`, so the bench frames carry `nothing came back`; real readings were judged through the A15 test and my own breaker tests on a scratch copy of the widget (nothing in the floor folder was touched).
- `live.txt`, made by the director. No second live run.

## Frames

```
20 columns, empty                 40 columns, two taps
│ Tap              │              │ Tap                           2 taps │
│ Name a server    │              │ 1 list_pull_requests              0s │
│ and a tool:      │              │   nothing came back                  │
│ /tap-widget add  │              │ 2 list_issues                     0s │
│ <server> <tool>  │
│ /tap-widget list │              20 columns, two taps
│ shows them.      │              │ Tap            2 │
                                  │ 1 list_pull_… 0s │
                                  │   nothing came … │
```

The name gives way to the age, the note drops to the bare count under 36 inner columns, every tap is two rows, no line breaks the border. The four-tap frame at 20 columns (A15) gives `1 list_p…`, `* 3 issues: Unh…`, `  server error:…`, as the spec draws.

## Live run

Matches the spec's "good run" line for line: `Tap on; /widgets places it.`; eight `claude_ai_Claude_Docs <tool>` rows; `Not added: call failed: no connected MCP tool "list_things" on a server named "nosuch"` (the engine's real words, with the caller prefix stripped); the read-only refusal for `send_mail` with no call; `Tap off.`; store `{ "isOn": false }` and nothing else. The director's log says seven tools were printed twice. They were not: each answer appears once under `[assistant]` and once under `[turn ended]`, as every answer in the file does. The eight rows are distinct.

Not proven live, by the spec's own design: a call that succeeds against a real server. The person makes that one hand check (`add` a list tool, see the reading, `drop 1`).

## Code read

- Off: the tick returns first thing while off; `sync` cancels the timer; switching off empties `reads` and `flying`; a late answer is thrown away because its `askedAt` no longer matches. `list`, `add`, `run`, `show`, `drop`, `clear` answer `Tap is off.` and reach nothing. No verb switches it on.
- One module-level `let`, the timer. The store holds `isOn` and `taps` only; `taps` is deleted, not left empty.
- A store written by hand is filtered to well-formed taps, deduplicated, four at most.
- Server text is cleaned before it is stored, answered, toasted or drawn; `raw` keeps its line breaks and indentation.
- Tests use realistic payloads (pull requests with ids and timestamps, a structured issues object), a hand-moved clock and hung calls; they prove their lines rather than agree with themselves.

## Breaking it

Held up: `ADD`, `Clear`, `run 01`, `run 1.5`, `run 1 x`, `drop -1`, `run 99999999999999999999999` (`No tap 99999999999….`), two JSON objects, a tab between the words, a 300-character tool name (cut on the card), a CJK title, `0`, `false`, `[]`, `{}`, an empty string, an undefined result, off while an `add` is in flight (`Tap is off.`, nothing saved).

## Findings (none blocks; for the next time this widget is on the bench)

1. `hooks/register.tsx`, `counted`: `{ "status": ["up"] }` reads `1 statu: up`. The rule strips any single trailing `s`, so `status`, `series`, `alias`, `news`, `analysis` lose a letter. Right: strip only when the key does not end in `us`, `is`, `ies` or `ss`. The rule is the one my spec note 6 proposed, so it is not held against the build.
2. `added`: `add github anyway` answers `anyway does not look read-only ... end the line with: anyway`. Right: with `anyway` taken off first there is one word left, so the usage line.
3. `added`: a `clear` that lands while an `add` is still calling answers `Tap cleared.`, and the tap is then saved when the call settles. Right: `add` checks that nothing cleared it in between, as it already does for the switch.
4. `tick`: while any call is unsettled the whole tick does nothing, so one tap that never settles stops every other tap's refresh until it is dropped or the widget is switched off and on. The ages keep growing and `run <n>` says `Tap <n> is still being read.`, so the person can see it. It follows the spec ("one after the other") and the test engine cuts a hook at 10 s, which suggests the real one does not hang for ever; the spec should say what a hang looks like.
5. `listed`: two entries with the same name from `$.tool.list` print the same row twice. Not seen live. Right: one row per distinct name.
6. `show <n>` on a failing tap answers the fault, not the last `raw`. The spec says `raw`; the build's choice agrees with "no old value is shown" and is the better one. The spec should be brought in line.
7. `add` does not cap the length of `server`; a 300-character word is stored whole. The card and answers cut it, so nothing breaks.
8. Ages are true as of the last tick or call, so they move once a minute, not once a second. As specified.
