# WO-0017 Earpiece: inspection 6 (after the fifth send-back)

Verdict: **pass**, within the director's ruling of 08:41 (the order passes on (a), (b) and (c) only).

## The ruling's three things

- (a) A whisper typed as soon as the agent has started reaches it: **met.** In `live.txt`, `/whisper 1 the word is heron` was typed straight after `started`, while the subagent was issuing its first Bash call, and answered `Whispered to agent 1 (count slowly). The card says heard once it has answered.` The build now looks for a missing row itself (`seek`, register.tsx: up to three refreshes 750 ms apart inside a 4 s `$.clock.after` limit) before it may answer `No agent <n> on the card.`
- (b) The word comes back and the bare `/whisper` reads heard: **met.** Bare `/whisper` answered `1 count slowly · Bash · heard`, with no `unread`; the subagent's report and the main loop's last answer were `heron`.
- (c) Nothing throws on the demo page: **met.** `render.ts` at rest, `--turns 1`, `--turns 3` and with every verb draws the red error card and never faults (the demo engine has no `agent.list`; the spec says to draw this state until the stand-in exists).

## Frames (demo engine, no stand-in)

```
--- 20 columns ---          --- 40 columns ---
╭──────────────────╮        ╭──────────────────────────────────────╮
│ Earpiece         │        │ Earpiece                             │
│ Could not read   │        │ Could not read the agents.           │
│ the agents.      │        ╰──────────────────────────────────────╯
╰──────────────────╯
```
`/earpiece-widget on` > `Earpiece on; /widgets places it.`; `off` > `Earpiece off.` and no card; `bogus` > the usage, switch untouched; `/whisper`, `/whisper 2 leave tests alone`, `/whisper 9 hi` > `Could not read the agents.`; `/whisper x` > `Usage: /whisper <number> <note>`. No wrapped or cut line at 20, 40 or 60. The working, best-moment and 20-column frames are proven by A2, A5, A10, A14 and A15 against the spec's drawings, since the demo engine cannot make an agent.

## Live run (the director's, `live.txt`; no second run made)

- Sign 1: whisper accepted by append. Sign 3: `heard`, no `unread`. Sign 5: `heron`. Sign 6: the store holds `isOn: false` and nothing else; no error line in the log.
- Sign 4: `/whisper 1 too late` answered `Whispered to agent 1 (count slowly)...` because the agent was still on run 7 of 8, which the spec allows; nothing was started or resumed by it, and the agent still reported `heron`.
- Sign 2 (first Bash `task_started` after the next `>>>` line): the ruling says a tool cycle a few seconds slower than control run B is not a fault. Not judged.
- The `heron` turn after `/earpiece-widget off` is the background agent's own completion notice, not something the widget caused.

## Code read

- Off: every hook returns early or passes straight to `next(e)`; `/whisper` answers `Earpiece is off.`; switching off outdates in-flight refreshes, blanks the roster and cancels the timer. No verb of `/whisper` switches the widget on.
- `tool.call` awaits nothing before `next(e)`; `turn.complete` awaits one state read; `agent.spawn` awaits `next(e)` first and lets `follow` run beside it. Every wait is bounded by `$.clock.after`; there is no `$.clock.sleep` and no `$.session.send`.
- Only `isOn` is stored. Descriptions are cut to 80, reasons to 120, notes refused over 300, numbers held to four digits.

## Findings

1. **Tests run close to the 5 second limit; the checker is not steady on a busy machine.** `tests/widget.test.tsx`, whole file. The checker passed 7 of 8 runs here. The first run failed on `standard: stays inert while off` (5224 ms) and `A11: with a list that never answers...` (5129 ms), and one direct suite run failed `A7: a number that is not there answers no agent after three looks` (5026 ms). All three are timeouts, not wrong answers; the untouched template tests took 4.1 to 4.7 s in the same minutes (in this widget and in the shipped strays-widget), so the host was slow, with three other orders on the floor. Still, spec note 12 asked for no test over 2 seconds and many take 3 to 4.5 s. Right: the shipper runs the checker on a quiet floor and reruns once on a timeout-only failure; a later touch of this widget should give the slow tests `timeoutMs` as strays-widget does, or split them. Not sent back: the ruling limits what this order passes on, and no assertion failed.
2. **`lap` is a `$.state` key the spec's State section does not name.** register.tsx, the `lap` atom `{ begun, landed }`. It is session-only, never stored, and is the refresh ticket the spec's Refresh rule needs. Right: the spec's State section lists it at the next design touch. Not a fault of this build.
3. **The demo page shows only the red error card.** `docs/engine.js` has no `agent.list`. Right: the director adds the stand-in the spec's Demo section describes at shipping (two running agents, an append that answers a `uuid`, the scripted `/whisper 2 leave tests alone`), so the page shows `sent` then `heard`. Until then the widget's one remarkable thing cannot be seen there.
4. **`heard` can err early by one request** (spec note 2): a model request already in flight when the note lands adds an assistant message that never saw it. In the live run it was true. No answer words it as a promise beyond "once it has answered". Left as the spec has it.
