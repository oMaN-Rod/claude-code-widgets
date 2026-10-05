# Spec notes: WO-0023 Pen

The spec passes. Every hook and call it names is in the types file (`plugin-authoring/types/claude-code.d.ts`, 2.1.289): `turn.step` as a `StreamHook` (`StreamingEventName = 'turn.step' | 'process.spawn'`), `TurnStepToolChunk` (`index`, `id`, `name`), `TurnStepInputChunk` (`index`, `json`), the text, thinking, stop and engine chunks, `TurnStepInput.agentId`, `HookBudget.ms` 10 000 summed over the response, "Returning nothing lets its last `next(e)`'s result stand", and `$.clock.now(): Promise<number>`. 108 lines, 14 acceptance lines, every main state drawn, a 20-column drawing, Demo and Live present.

Notes for the machinist to settle while building. I will look at each at inspection.

1. `Stopped before it ran.` is 22 characters and the inner width at 20 columns is 16, so by A13 it would be cut to `Stopped before …`. Give the row a short form that fits whole under 30 columns (for example `Stopped.`) and cover the stopped state at 20 columns in A13's test.
2. The Settled drawing shows 4 tail rows where the rule (last 5 non-blank lines) would give 5 for a 212-line file. The rule governs; the drawing is short by a row.
3. The cursor when the text has just ended in a newline, or the line being written holds only spaces: the tail's last row is then a finished line. Put the cursor at the end of that row as the Card section says, and do not draw an empty row for it. Also check the row that is exactly the inner width: it is cut to one less so the cursor never pushes the border.
4. The `finally` that sets `stopped` runs a `$` call after the stream beneath has thrown or the consumer has returned. It must not throw out of `finally`, or it would replace the throw A8 says reaches the caller. Guard it.
5. `written` means the arguments are whole, not that the tool ran: an Esc or a refusal after the arguments close leaves `written`. That is what the spec says and it is acceptable; do not add wording that claims the tool ran.
6. Switched off and on again inside one step: the spec says nothing more is copied in that step. Keep that, and make the card show the empty sentence until the next step's followed call. Worth one assertion in A14.
7. The empty sentence at 20 columns wraps to about eight rows. Check it wraps on words inside the border; A13's "any state" includes it.
8. Indentation is removed after the 120-character cut and after tabs became two spaces; a tail whose rows are all indented deeper than the card is wide must still show text, not spaces.
9. `show` does not cut the path (up to 200 characters). Fine for text output; keep it on one line.
10. The demo stand-in changes `docs/engine.js` (a generator-aware dispatcher and a `turn.step` stream before each scripted call). That file is outside the widget folder: log it for the director rather than leaving the card resting on the demo page. The widget itself must show the empty sentence there until it lands.
11. Log the live run's piece count `p` as the spec asks. If it is 1, say so plainly in the log: the "line by line" claim of `shows` then rests on the settled tail alone and I will judge the widget on that.
