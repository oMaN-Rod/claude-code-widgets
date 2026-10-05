# Skimmed (`skimmed-widget`)
## Purpose
For anyone who comes back to a long reply, reads the last paragraph and starts typing. The sentence "I did not run the migration" is always in the reply; the failure is that it scrolled away. Skimmed watches which rows of each reply the transcript's viewport showed, and when a turn ends it quotes, on the card, the caveat sentences whose rows left the screen while Claude was still writing and have not been back. It reads no model and adds nothing to a prompt. Settled, with the reason:
- One claim, and it is a fact: these rows were off screen since Claude wrote them. A row counts as shown once it has been on screen 1s in all while its reply had been still for 500ms, or is on screen now. Time on screen while the reply still streams earns nothing: the viewport follows the stream, so every row passes through it. Nothing is ever claimed about reading.
- Every doubt is left unquoted (the slack, a resize, a reply never seen growing, a reply jumped away from without a report), and none is called shown: `all shown` is drawn only when every caveat counted was judged. A false "off screen" is the one error that ends trust in the card.
- The types file does not say whether a growing reply's new row count comes in the draw that carries its new text or in a later one ("Reported once drawn and again when it changes"). The rules below hold under both orders: the rows of a new text are taken whenever they come within 500ms of it, and neither report earns credit.
- A render hook may not write state ("Refused while a `ui.render` hook draws"), so the hook only queues the report; one short timer writes it. That queue is the one module-level `const` besides the timer handle, and it lives 100ms.
- The card shows the last turn only, so an old caveat does not nag; `show` lists the session.
- Cut: the bar of rows shown, a `go` verb, a per-caveat dwell figure, planting keys in the message drawing, any rewrite of `AssistantMessage`.
## Terms
- Report: an `AssistantMessage` render whose `e.props.onScreen` is not `undefined`, taken while on: `{ id: e.requestId, text: e.props.text, on: onScreen, columns: e.viewport?.columns || 80 }` (a width of 0 reads as 80). A report whose `on` is null carries no `of`; the page keeps its own.
- Flush: 100ms after the first queued report, one `$.clock.now()` stamps the batch, the reports are applied in order and state is written once, only if it changed. The whole flush runs inside `try`; a throw drops that batch and nothing else.
- Apply, for the page of `id` (made on first sight, with `moved` now): (1) credit: if `page.on` is set and the report has the page's text length, `columns` and `of`, every row of `page.on` gains `now - max(page.on.at, page.moved + 500)` when that is positive, capped at 1000; (2) text: a length other than `page.size` scans the new text, sets `size` and `moved`, and, when the page already existed, sets `isGrown` and `turn` (the book's, while busy); (3) layout: other `columns` on a page that existed is doubt. Another `of` is the rows of a new text when `page.of` was 0 or `now - page.moved` is 500 or less (so with the text, or in a draw after it): it is taken, `ms` is cut or padded with 0 to `min(of, 300)` and `moved` is set. Another `of` later than that is a resize, so doubt. Doubt takes the values, sets `moved` and sets `isDoubted` for good; (4) `page.on` becomes `{ first, last, at: now }` or null.
- Scan: resumes at `read.at` (the start of the last unfinished line; from 0 when the text got shorter). A source line weighs `max(1, ceil(length / columns))`. Outside ``` fences, a line is stripped of leading `#`, `>`, list marks and of `*`, `_`, backticks, split after `.`, `!`, `?` followed by a space, and a sentence matching `\b(did not|didn't|could not|couldn't|unable to|skipped|not yet|failed|untested|not verified|note that|note:|warning:|caveat)` without regard to case is a caveat: `{ text (spaces collapsed, 200 characters, then `…`), before, weight }`, `before` the weight of the lines above. A table row (a line starting with `|`) is skipped, and a match does not count when one of the two words before it is `0`, `no`, `none` or `nothing` (`0 failed`, `none were skipped`). At most 5 a page, the first five.
- Rows of a caveat: `floor(before / page.weight * of)` to `ceil((before + weight) / page.weight * of)`, widened each side by `max(3, ceil(of / 10))`, clipped to the reply. Its place is the middle row as a whole percent of `of`.
- Counted: the caveats of pages with `isGrown` and `turn` of 1 or more. Not judged: a counted caveat whose page has `isDoubted` or an `of` of 0 (it grew with no window ever reported), or whose rows pass row 299; nothing is said of it, shown or off screen. A page whose `of` was 0 is judged like any other once a window reports its rows. Off screen: a judged caveat none of whose rows has 1000 in `ms` or lies in `page.on`.
- Kept: 40 pages. Over that the pages never grown go first, longest unreported first, then the grown ones.
## Card
Title `Skimmed`. Notes at 30 columns and wider: `watching`, `all shown`, `<n> off screen`; under 30 only the bare count, when there are any. Sentences wrap. The card lists the off-screen caveats of the book's current turn, in reading order, at most 2: each quote in `“”`, word-wrapped by the widget to at most 3 rows (cut with `…`; a word too long for any row goes on in the row in hand and is split where that row ends), then a `Button` `▸ <p>% down its reply` (`▸ <p>% down` under 30); then dim `… <k> more in show` (`… <k> more` under 30).
```
Empty: on, no page yet.
│ Skimmed                              │
│ No replies watched yet. A caveat     │
│ that scrolls away while Claude is    │
│ still writing is quoted here.        │
Working: a turn is running.
│ Skimmed                     watching │
│ Claude is writing. Caveats that      │
│ leave the screen are quoted when the │
│ turn ends.                           │
At rest: every caveat of the last turn was judged, none is off screen.
│ Skimmed                    all shown │
│ Nothing off screen in the last turn. │
│ 3 caveats found                      │
│ 1 earlier in show                    │
At rest, not known: a reply was resized or never in the window.
│ Skimmed                              │
│ Nothing to quote from the last turn. │
│ 3 caveats found                      │
│ 2 not judged                         │
Best moment: back at a 160-row reply, reading its last paragraph.
│ Skimmed                 2 off screen │
│ Off screen since Claude wrote them:  │
│ “Note: the two integration tests     │
│ were skipped because the database    │
│ container did not start.”            │
│ ▸ 20% down its reply                 │
│ “I did not run the migration.”       │
│ ▸ 55% down its reply                 │
Error: no page, and the layout is not fullscreen.
│ Skimmed                              │
│ This layout does not report what is  │
│ on screen. Skimmed needs the         │
│ fullscreen layout and claims nothing │
│ here.                                │
Busiest at 20 columns (3 off screen):
│ Skimmed        3 │
│ Off screen since │
│ Claude wrote     │
│ them:            │
│ “Note: the two   │
│ integration      │
│ tests were skip… │
│ ▸ 20% down       │
│ “I did not run   │
│ the migration.”  │
│ ▸ 55% down       │
│ … 1 more         │
```
At rest with nothing off screen in the current turn, `n` its counted caveats and `u` those not judged: the note `all shown` and `Nothing off screen in the last turn.` are drawn only when `n` is 1 or more and `u` is 0; otherwise there is no note and the sentence is `Nothing to quote from the last turn.` The dim rows: `<plural(n, 'caveat')> found`, left out at 0; `<u> not judged`, left out at 0; `<k> earlier in show` counts off-screen caveats of earlier turns and is left out at 0. Pressing a button calls `$.ui.scroll` for that reply; the reply's top is revealed, the percent says how far down to look. A `deny` or a throw toasts `Skimmed: the transcript did not move (<reason>)`. A press writes no state; the caveat leaves the card when its rows are shown.
## Commands
`/skimmed-widget [on|off|show|clear]`, verb matched without regard to case. Bare, `on`, `off` and the usage as in the template (`Skimmed on; /widgets places it.`, `Skimmed off.`). No second command, no tool.
- `show`: with no page and `e.presentation.isFullscreen` false, the error card's two sentences. With no counted page otherwise (none, or only pages of turn 0 or never grown), `No replies watched yet.` Else `<plural(n, 'caveat')> off screen since Claude wrote them, of <m> found in <plural(p, 'reply')>:` (at 0, `Nothing off screen: <plural(m, 'caveat')> found in <plural(p, 'reply')>.` when none is unjudged and `Nothing to quote: <plural(m, 'caveat')> found in <plural(p, 'reply')>.` when some are), one line per off-screen caveat of the session `t<turn>  <p>% down  <text>`, then, when `u` of the session is 1 or more, `<u> not judged: the reply was resized, was never in the window, or runs past row 300.`, then `Shown means on screen 1s or more after its reply stopped changing, or on screen now, with a margin of rows either side. Nothing here says a shown line was read.` `m` and `p` count counted caveats and their pages.
- `clear`: empties the pages and the queue, keeps `turn` and `isBusy`, answers `Skimmed cleared.`
- While off, `show` and `clear` answer `Skimmed is off.` and touch nothing.
## Data
Verified in `plugin-authoring/types/claude-code.d.ts`, engine 2.1.289.
- `on('ui.render', { component: 'AssistantMessage' }, hook)`: props `{ text: string; isFirstOfReply: boolean; onScreen?: OnScreen | null }`, `OnScreen` `{ first, last, of }`: "`null` while drawn outside it, absent where the surface does not say"; "Reported once drawn and again when it changes: on a scroll, for the messages at the viewport's edges only"; "the blank row the engine draws above a message is its row 0". Envelope `e.requestId` ("the message id for a message"), `e.viewport?.columns`. The hook is `const drawn = await next(e)`, then inside `try`: one `isOn` read, a push on the queue, `sync($)`; it returns `drawn` itself. It reads no other state, so a flush never redraws the transcript.
- `$.clock.after(ms, fn)` (`TimerCall`) for the flush, started and cancelled only in `sync`; `$.clock.now()` once a flush. No `$.clock.every`.
- `$.state.set`: "Refused while a `ui.render` hook draws (write from `onPress` or another event)"; the flush writes from the timer.
- `on('turn.start')` (`TurnStartInput` `{ text, turnId }`; "a subagent's run raises no `turn.start`"): `turn + 1`, `isBusy` true. `on('turn.complete')` with `e.agentId` undefined: `isBusy` false. Both `return next(e)`.
- `$.ui.scroll({ to: { requestId }, block: 'start' })`: `UiScrollResult` `{ deny? }`, "a transcript row is revealed only while the plugin answers the person's own input"; called from the `Button`'s `onPress` only, seated in the card as `landmarks-widget` does. `$.ui.toast(text)`.
- `e.viewport?.isFullscreen` on the three card hooks and `e.presentation.isFullscreen` at `command.run`. `$.store`, `$.command.register`, `$.widgets.card`, `atom`/`read`/`update`. Not used: `$.ui.invalidate`, `$.fs`, `$.model`, `prompt.submit`, `tool.call`.
## State and storage
- `$.state` `isOn: boolean`.
- `$.state` `book: SkimmedBook` `{ turn: number; isBusy: boolean; pages: SkimmedPage[] }`, default `{ turn: 0, isBusy: false, pages: [] }`. `SkimmedPage` `{ id: string; turn: number; isGrown: boolean; isDoubted: boolean; moved: number; columns: number; of: number; size: number; weight: number; read: { at: number; weight: number; isFenced: boolean }; on: { first: number; last: number; at: number } | null; ms: number[]; caveats: SkimmedCaveat[] }`; `SkimmedCaveat` `{ text: string; before: number; weight: number }`. The reply's text is never stored.
- Module: `let timer: Timer | undefined` and `const queue: Report[]`, emptied by every flush, by `clear` and by off.
- `$.store` `isOn` only. No file.
## Off
No card. The `AssistantMessage` hook returns the engine's drawing after one `isOn` read and queues nothing; the two turn hooks return `next(e)`. Switching off cancels the timer, empties the queue and resets `book`; a flush that fires late finds the switch off and writes nothing.
## Demo
`docs/engine.js` raises no `AssistantMessage` render. Stand-in needed: in the scripted turn, between `turn.start` and `turn.complete`, four `ui.render` dispatches for `{ component: 'AssistantMessage', requestId: 'demo-reply', surface: 'terminal', viewport: { columns: 80, rows: 40, isFullscreen: true } }`, 150ms apart, the text growing by quarters of a 160-line reply whose lines 32 and 88 are the two sentences drawn above and `onScreen` following its end (`{ first: 0, last: 39, of: 40 }` up to `{ first: 120, last: 159, of: 160 }`). At rest: the empty card. After the turn: the best-moment card as drawn. With no stand-in the card stays on the empty sentence and never throws.
## Live
`bun factory/tools/live.ts factory/floor/plugins/skimmed-widget --say "/skimmed-widget on" --say "Reply with exactly: Note: I did not run anything." --say "/skimmed-widget show" --say "/skimmed-widget off"`
One tool-less turn, headless, where no viewport exists. A good run: the reply arrives word for word, `show` answers `This layout does not report what is on screen. Skimmed needs the fullscreen layout and claims nothing here.`, and the store prints `isOn` false. This proves the hook is harmless and the widget silent without a viewport; it cannot prove the signal. The idea's first risk stays open until a person runs a fullscreen terminal session with the widget on, which the builder must not do in the user's setup without asking. That hand check is four things: `onScreen` arrives and changes on a scroll (and whether a growing reply's new `of` comes with its text or after; the rules take both); a timer armed from the render hook is accepted; a reply longer than the screen with a caveat near its top is quoted at the turn's end and leaves the card after scrolling back to it for a second; a press moves the transcript. If the first or second fails, the order goes back.
## Cost
None: no tokens, no model call, nothing added to context. Per assistant text draw: one state read and one queue push; at most ten state writes a second while a reply streams or the person scrolls.
## Acceptance
- A1: on, fullscreen, no report yet: the card shows the empty sentence with no note in all three placements and `show` answers `No replies watched yet.`
- A2: a render whose `onScreen` is absent queues nothing and arms no timer; with no page the card under `isFullscreen` false shows the error sentences and `show` under `presentation.isFullscreen` false answers them; with a page held, the same layout draws the ordinary card.
- A3: on or off, the `AssistantMessage` hook returns the very object `next` gave and writes no state during the draw; a throw in its body still returns that object; twenty reports inside 100ms make one state write, at the 100ms mark, and a batch that changes nothing makes none; a throw inside a flush is caught and the next batch is applied.
- A4: after `turn.start`, reports of one reply growing to 160 rows at 80 columns with the window on its last 40 rows, caveats on lines 32 and 88 of 160, then `turn.complete`, fed in each of two orders (every step's text and row count in one report; every step as the new text with the window of the step before, then the same text with its own window and `of`): in both the note is `2 off screen`, the header, both quotes in reading order wrapped as drawn, and buttons reading `▸ 20% down its reply` and `▸ 55% down its reply`.
- A5: the same reports before `turn.complete` draw the working card, note `watching`, with no quote; a page seen while no turn has started since on (turn 0) is never listed, on the card or in `show`.
- A6: after A4 and 500ms with no change, two reports of the unchanged reply 1000ms apart with the window over the first caveat's rows drop it from the card (note `1 off screen`); 900ms apart it stays, and so does the 1000ms pair begun 100ms after the last change (600ms earned); while the window lies over it, it is not listed whatever its credit, and it returns once the window leaves with under 1000ms earned; a report that changes the text or the `of` earns its rows nothing, in either order of A4.
- A7: doubt is neither listed nor called shown: a caveat whose widened rows include one shown row is not listed; after a report with other `columns`, or another `of` under the same text more than 500ms after the page last moved, the A4 turn draws no note, `Nothing to quote from the last turn.`, `2 caveats found` and `2 not judged`, for good; a caveat past row 299 and the caveats of a reply that grew with a null window throughout read the same way, and that reply's are quoted once a window has reported its rows without showing theirs; a reply seen once and never growing is not counted; `columns` 0 is read as 80.
- A8: the scan quotes the whole sentence with its markdown marks gone, matches every listed phrase in either case and no sentence without one, finds none in `All 42 tests passed, 0 failed.`, `None were skipped.` and the table row `| lint | skipped |`, ignores fenced code, cuts at 200 characters with `…`, keeps the first five of a page; a text fed in six pieces yields the same caveats, `before` and `weight` as the text fed whole; a text that gets shorter is scanned again from its start.
- A9: a finished turn whose caveats are all judged and shown draws `all shown`, `Nothing off screen in the last turn.` and `<n> caveats found`; with none found it draws `Nothing to quote from the last turn.` alone, with no note; after the next `turn.start` and `turn.complete` the A4 caveats read `2 earlier in show` and are quoted nowhere on the card.
- A10: `show` after A4 answers the header `2 caveats off screen since Claude wrote them, of 2 found in 1 reply:`, the lines `t1  20% down  <text>` and `t1  55% down  <text>` with the text whole, and the closing rule; with all shown it answers `Nothing off screen: 2 caveats found in 1 reply.` and the rule; with the page in doubt, `Nothing to quote: 2 caveats found in 1 reply.`, the line `2 not judged: the reply was resized, was never in the window, or runs past row 300.` and the rule; with only turn-0 pages, `No replies watched yet.`
- A11: pressing the first button calls `$.ui.scroll` with `{ to: { requestId: <the reply's id> }, block: 'start' }` and writes no state; an answer of `{ deny: 'not person-initiated' }` and a throw each toast `Skimmed: the transcript did not move (<reason>)`.
- A12: `clear` empties the pages and the queue, keeps `turn`, answers `Skimmed cleared.` and the card returns to the empty sentence; `SHOW` is taken as `show`; `what` and `show 2` answer `Usage: /skimmed-widget [on|off|show|clear]` and change nothing.
- A13: while off, `show` and `clear` answer `Skimmed is off.`, and reports, `turn.start` and `turn.complete` write no state and arm no timer; switching off with a batch queued cancels the timer, and advancing the clock writes nothing; `book` is back at its default.
- A14: at 20, 40 and 60 columns no row of any state breaks the border; a quote takes at most 3 rows and a longer one ends in `…`; a quote of `Note:` and one 60-letter word starts that word on the row of `“Note:`; 3 off screen show 2 and `… 1 more in show` (`… 1 more` under 30); under 30 the note is the bare count or nothing and the buttons read `▸ <p>% down`.
- A15: a 41st page drops the never-grown page reported longest ago, and a grown page only when no other is left to drop; a row's `ms` never passes 1000 and `ms` never holds more than 300 entries.
## widget.json
- title: `Skimmed`
- category: `Session`
- shows: `The caveats in Claude's replies that left your screen while Claude was still writing and have not been back, quoted in full; it never claims that what was on screen was read`
- commands: `/skimmed-widget [on|off|show|clear]`
- cost: ``
