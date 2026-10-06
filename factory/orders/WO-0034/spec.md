# Earshot (`earshot-widget`)
## Purpose
For anyone who types "stop, don't commit" while Claude is still working. The engine queues the message and nothing says whether Claude got it before or after it acted. Earshot shows, for each message typed over a running turn, whether a request has carried it yet, how late that was, and what Claude ran in between, changes first. Unlike Earpiece (notes you send to subagents) and Queue (prompts lined up for later), it measures the engine's own delivery of your message to the main loop. Settled, with the reason:
- "Heard" means one thing: a model request carried the message. Never whether Claude complied.
- Two kinds of message, because the live run showed the event means two things (the types say so too: `turnId` is set for a prompt "typed over that turn, or delivered into it", and only "a prompt typed while a turn ran fires at Enter"). A `composer` prompt reaches the widget at Enter: it is timed and waits. An `sdk` or `bridge` prompt reaches the widget only as the engine takes it off its queue and delivers it into the turn: it is heard at that event and its wait is unknown, so no lateness and no list are shown for it. This is the fault of the first build: it timed a headless message from its delivery and then waited for a second signal.
- Two signals hear a waiting message, whichever comes first: a `prompt.attachment` of type `queued_command` holding its text, or the start of the next main-loop `turn.step` of its turn. A request that starts after your Enter carries what the engine queued, so the step alone is enough; the live run matched no attachment and none was captured, so the widget does not depend on one. The step number of the idea stays cut.
- A prompt sent with `wait: true` (you asked it to wait its turn) is not a message for the running turn and is ignored, as is a slash command. The message is recorded before `next(e)` is called, so a signal that arrives while the chain beneath is still running finds it.
- Attachment matching is by text, in order: an attachment hears the oldest waiting message whose stored text appears in the attachment's text (both with whitespace collapsed). Two identical messages are heard in the order typed; a notification delivered into the turn matches nothing. Only a waiting message can be heard, so an attachment asked again (resume, invalidation) changes nothing.
- A call belongs to the list when it started at or after your Enter and returned while the message was still waiting. A request is only sent once the running calls have returned, so nothing is missed. The call already running at Enter is not listed; it is shown as what the message waits behind.
- A change is a call of `Edit`, `Write`, `NotebookEdit`, `Bash` or `PowerShell` whose result has no `isReadOnly: true`. Everything else is a read. A denied call is not counted.
- Main loop only: events with `agentId` are ignored. Only the person's own prompts count (`composer`, `bridge`, `sdk`).
## Card
Title `Earshot`. Note, from 30 columns only, for the newest message: `waiting`, `<span> late`, `heard`, `not heard`, `own turn`; none when empty. The quote is yellow, in double quotes, one row, cut with `…` before the closing quote. Change rows start with a yellow `!`. One row per value, cut at its end, never wrapped; only the empty sentences wrap.
```
Empty: no message typed over a turn yet.
│ Earshot                              │
│ Nothing waiting to be heard.         │
│ Type while Claude works: this shows  │
│ when Claude got your message and     │
│ what it ran first.                   │
Working: a message waits.
│ Earshot                      waiting │
│ "no, use pnpm"                       │
│ not heard yet · 41s                  │
│ behind Bash bun test                 │
│ ! Edit package.json                  │
│ and 1 read                           │
Best moment: heard, with something to undo.
│ Earshot                     48s late │
│ "no, use pnpm"                       │
│ heard 48s after you sent it          │
│ Before it heard you:                 │
│ ! Edit package.json                  │
│ ! Bash npm install                   │
│ ! Bash git commit -m "Add pnpm"      │
│ and 2 reads                          │
│ "wait" · 3s late                     │
Heard with nothing to undo.
│ Earshot                      4s late │
│ "no, use pnpm"                       │
│ heard 4s after you sent it           │
│ Nothing ran before it heard you.     │
Heard, sent by a host or Remote Control.
│ Earshot                        heard │
│ "Also say pineapple."                │
│ heard in the turn it was sent over   │
│ Sent remotely: wait not measured.    │
Error: the turn ended first.
│ Earshot                    not heard │
│ "no, use pnpm"                       │
│ The turn ended before Claude got it. │
│ Meanwhile:                           │
│ ! Bash git commit -m "Add pnpm"      │
Busiest at 20 columns:
│ Earshot          │
│ "no, use pnpm"   │
│ heard 48s late   │
│ Before that:     │
│ ! package.json   │
│ ! npm install    │
│ ! git commit -m… │
│ ! rm -rf dist    │
│ +2 more          │
│ and 2 reads      │
│ "wait" · 3s late │
```
Rules. The detailed message is the newest; up to 2 earlier ones follow as dim rows `"<text>" · <word>`, newest first, the word being the note that message would have. The list shows at most 4 changes, then `+<n> more`, then `and <plural read>`; with reads only it is the one row `<plural read>, nothing changed`; with nothing it is `Nothing ran before it heard you.` in green (while waiting: no list rows at all). An untimed message (`sdk`, `bridge`) has exactly the two rows drawn and never a list. While waiting, the `behind <label>` row shows the oldest call in flight and is absent when none is. A message for which a command was moved to the background has the row `A command went to the background` after its status row. A `not heard` message that then starts a turn reads `Ran as its own turn, <span> later.` in place of the turn-ended sentence, with the note `own turn`. Under 30 columns: no note, `heard <span> late`, `Before that:`, labels without the tool word, `Turn ended first.`, `Own turn, <span> later.`, `Went to background`, `Nothing ran first.`, and for an untimed message `heard this turn` and `Wait not timed.` A message with no text (images only) is quoted as `(no text)`. There is no failing I/O; the error state is the message that was never heard.
## Commands
`/earshot-widget [on|off|last|clear]`; the verb is matched without regard to case. Bare, `on`, `off` and usage as in the template (`Earshot on; /widgets places it.`, `Earshot off.`). No second command, no tool.
- `last`: the newest message in full, for when the card cut the list. Line 1 by status: `"<text>" is not heard yet, <span> so far.`; `"<text>" was heard <span> after you sent it.`; `"<text>" was not heard: the turn ended <span> after you sent it.`; `"<text>" was not heard in that turn and ran as its own turn <span> after you sent it.` Line 2: `Changes first: <labels joined with ", ">` with ` and <n> more` when more than 12, then `; <plural read>.`, or `<plural read>, nothing changed.`, or `Nothing ran in between.` Line 3, only when it applies: `A command went to the background to let it through.` An untimed message answers one line only: `"<text>" was heard in the turn it was sent over. It was sent remotely, so Earshot got it only at delivery and its wait is not measured.` With no message: `No message typed over a turn yet.`
- `clear`: forgets every message and answers `Earshot cleared: <plural message> forgotten.`
- While off, `last` and `clear` answer `Earshot is off.` and change nothing.
## Data
Verified in `plugin-authoring/types/claude-code.d.ts` (2.1.289). Every hook observes: it passes `e` on unchanged and returns the very object `next(e)` gave.
- `on('prompt.submit', hook)` (`PromptSubmitInput` `{ text, turnId?, wait, origin }`; result `PromptSubmitResult` `{ text }` or `{ drop }`): when on, `e.turnId` is present, `e.wait` is false and `e.origin.kind` is `composer`, `bridge` or `sdk`, take `$.clock.now()` and add the message with `e.text` before calling `next(e)`: `waiting` for `composer`; for `sdk` and `bridge` `heard` at once with `isTimed` false. After `next(e)`: when it answered `drop`, or the text is a slash command (the guard the build already has), the message is removed again (found by its `at`); otherwise its text becomes the answered `text`. Once per Enter.
- `on('prompt.attachment', { type: 'queued_command' }, hook)` (`UndeclaredAttachmentInput` `{ type, text, origin, agentId? }`; result `PromptAttachmentResult` `{ text }`): when on, no `e.agentId` and `e.origin.kind` is `engine`, the match above turns one waiting message to `heard` at `$.clock.now()`. Once per delivered message. The widget never calls `$.ui.invalidate('prompt.attachment')`.
- `on('turn.step', async function* hook)` (`TurnStepInput` `{ turnId, index, model, messageCount, agentId? }`; streams `TurnStepChunk`, result `TurnStepResult`): when on and no `e.agentId`, every waiting message whose `turnId` is `e.turnId` becomes `heard` at `$.clock.now()`; then `return yield* next(e)`, every chunk and the result untouched. Once per main-loop request; state is written only when a message of that turn waits.
- `on('tool.call', hook)` (`ToolCallInput`, `tool`, `tool_use_id`, `agentId?`, `file_path` / `notebook_path` / `command`; result `ToolCallResult` `{ result, deny?, isError?, isReadOnly? }`), every main-loop call while on: before `next(e)` the call joins `flight` with its label and start time; in a `finally` it leaves `flight`. After `next(e)`, unless `deny` is set, it is counted on every waiting message whose `at` is not after its start. When `e.tool` is `Bash` or `PowerShell` and `result` is an object with `backgroundedToDeliverMessage === true`, the oldest waiting message gets `isPushed`.
- `on('turn.complete', hook)` (`TurnCompleteInput` `{ turnId, reason, agentId? }`): when on and no `e.agentId`, every waiting message becomes `missed` at now and `flight` is emptied, whatever `e.reason` is (`answer`, `aborted`, `refusal`, `error`).
- `on('turn.start', hook)` (`TurnStartInput` `{ text, turnId }`): when on, each `missed` message whose text appears in `e.text` becomes `own` at now.
- `$.clock.every(1000, fn)` (`TimerCall`, returns `Timer` with `cancel()`): runs only while on and a message is waiting; each tick calls `$.ui.invalidate('ui.render')` (`InvalidatableEventName` includes the render events). The card reads `$.clock.now()` when drawn.
- Also: `$.store.get/set`, `$.command.register`, `on('command.run')`, `on('session.start')`, the three `ui.render` hooks, `$.widgets.card`. Not used: files, `$.process`, `$.session.messages`, any model call, anything added to a prompt.
- Label: `Edit` and `Write` `<tool> <file name of file_path>`; `NotebookEdit` with `notebook_path`; `Bash` and `PowerShell` `<tool> <command>`; any other tool its name (an `mcp__server__tool` name as `tool`). Whitespace collapsed, cut to 60 characters.
## State and storage
- `$.state` `isOn: boolean`.
- `$.state` `messages: EarshotMessage[]`, oldest first, at most 5 (a sixth drops the oldest): `{ text: string; at: number; turnId: string; isTimed: boolean; status: 'waiting' | 'heard' | 'missed' | 'own'; settledAt: number; changes: string[]; changeCount: number; readCount: number; isPushed: boolean }`. `text` has whitespace collapsed and is cut to 80 characters; `changes` holds the first 12 labels and `changeCount` counts all; `settledAt` is 0 while waiting; `isTimed` is true for `composer` only.
- `$.state` `flight: EarshotCall[]`: `{ id: string; label: string; at: number }`, the main-loop calls now running, `id` the `tool_use_id`.
- `$.store` `isOn` only. No file. The messages live in this session's state alone and are never written anywhere.
- The timer handle is the only module-level `let`; `sync` starts it when on and a message waits, cancels it otherwise, and is called at `session.start`, after every change of the switch and after every change of a message's status.
## Off
No card and no timer. `prompt.submit`, `prompt.attachment`, `turn.step`, `tool.call`, `turn.complete` and `turn.start` pass on to `next(e)` after reading the switch: no state is written and no clock is read. Switching off empties `messages` and `flight`, so no quoted text outlives the switch.
## Demo
`docs/engine.js` runs one scripted turn, one `turn.step` per tool call (an Edit of `src/sum.js`, a `git commit` among them), but raises no `prompt.submit` with a `turnId`. One stand-in needed, for `earshot-widget` only: when the `turn.step` that writes the Edit call has finished and before that call's `tool.call`, dispatch `prompt.submit` `{ text: 'wait, leave the tests alone', wait: false, origin: { kind: 'composer' }, turnId }` answering `{ text: e.text }`. The engine's own next `turn.step` then hears it; no attachment stand-in. At rest: the empty state. During the Edit the card shows the quote and `not heard yet · <n>s` counting up. After the turn: note `<n>s late`, `heard <n>s after you sent it`, `Before it heard you:` and `! Edit sum.js`. Without the stand-in the card stays empty after the turn.
## Live
`bun factory/tools/live.ts factory/floor/plugins/earshot-widget --allow "Bash" --say "/earshot-widget on" --say "Run this exact Bash command in the foreground, then answer with the one word done: bun -e \"await Bun.sleep(30000)\"" --say "Also say pineapple." --say "/earshot-widget last" --say "/earshot-widget off"`
One small turn in the factory's scratch project under the factory's own config directory. The tool sends the next line after 20 seconds of silence, so `Also say pineapple.` arrives while the 30-second command runs, and `last` is sent after the turn has ended. A good run: one turn whose answer has both `done` and `pineapple`; `last` answers `"Also say pineapple." was heard in the turn it was sent over. It was sent remotely, so Earshot got it only at delivery and its wait is not measured.`; the store prints `isOn` false. If Claude answers `pineapple` in a turn of its own, the message was not delivered into the turn and `last` rightly says `No message typed over a turn yet.`: run again. Any `not heard` or `<span> after you sent it` in this run is a fault. What this run cannot show: the tool is headless, so every prompt is `sdk`; the timed path of a `composer` prompt (waiting, lateness, the list) is proven by the tests and rests on the types' "fires at Enter". Seeing it live needs a person typing over a turn in a terminal, which the director asks the user for and does not do alone.
## Cost
None: no tokens, no model call, nothing added to any prompt. One redraw a second only while a message waits. Up to 5 of your messages, cut to 80 characters, are held in the session's memory until the session ends, `clear` or off.
## Acceptance
- A1: on with no message, the card shows the empty sentences and no note in all three placements, and `last` answers `No message typed over a turn yet.`
- A2: a `composer` `prompt.submit` with a `turnId` and `wait` false adds a waiting message, present before `next` resolves (an attachment or a step arriving while `next` is pending hears it), whose text ends as the answered text with whitespace collapsed, cut to 80 characters; one with no `turnId`, one with `wait` true, one from `task-notification` or `peer`, a slash command and one that `next` answers with `drop` leave no message; each resolves to the very object `next` gave.
- A3: with a message waiting and the clock moved on 41 seconds the 40-column card shows the quote, `not heard yet · 41s`, the note `waiting`, `behind Bash bun test` while that call is in flight and no `behind` row once it has returned; exactly one 1000 ms timer runs while any message waits, each tick calls `$.ui.invalidate('ui.render')`, it is cancelled when the last waiting message is heard or missed, on `clear` and on switching off, and none runs while on with nothing waiting.
- A4: an `sdk` and a `bridge` `prompt.submit` with a `turnId` each give a message that is heard at once and untimed: the card drawn above at 40 columns (note `heard`, the two rows, no list) and its narrow form at 20, no timer, `last` answering the one untimed line; a `turn.complete` 1 second later and calls run meanwhile change nothing on it.
- A5: a `prompt.attachment` of type `queued_command`, origin `engine`, whose text holds the message inside other framing, 48 seconds after Enter, gives the heard card drawn above: `48s late`, `heard 48s after you sent it`, `Before it heard you:`, the Edit, Write and Bash calls as `!` rows in the order run, `and 2 reads` for a Read and a Grep; `e` reaches `next` unchanged and the hook resolves to the object `next` gave.
- A6: the list leaves out a call that started before Enter, a denied call and a call with `agentId`; a `Bash` call whose result has `isReadOnly: true` is counted as a read; a call that fails with `isError` is listed; a call whose `next` throws leaves `flight` and rethrows.
- A7: an attachment with an `agentId`, one of another type, one with origin `hook`, one whose text does not hold any waiting message, and the same attachment asked a second time after it was heard change nothing (the lateness stays as first measured).
- A8: two identical waiting messages are heard one per attachment, the older first, and two different ones whose attachments arrive in the other order are each matched by their text; with no attachment at all, a main-loop `turn.step` of the message's turn 48 seconds after Enter hears every waiting message of that turn with the same card as A5, while a step with an `agentId` or another `turnId` hears none; the step hook yields every chunk and returns the result as `next` gave them.
- A9: a heard message with no calls shows `Nothing ran before it heard you.`; with two reads only, `2 reads, nothing changed`; with 6 changes, 4 rows and `+2 more`; a 13th change raises `changeCount` and is not stored; a sixth message drops the oldest; the two messages before the newest are drawn as `"<text>" · <word>` rows.
- A10: a `Bash` and a `PowerShell` result with `backgroundedToDeliverMessage: true` while a message waits add `A command went to the background` to the oldest waiting message; a failed call whose `result` is a string does not throw and adds nothing.
- A11: a main-loop `turn.complete` with reason `answer` and one with reason `aborted` turn every waiting message to `not heard` with `The turn ended before Claude got it.`, `Meanwhile:` and its list, and empty `flight`; a `turn.complete` with an `agentId` changes nothing.
- A12: a `turn.start` whose text holds a `not heard` message turns it to `own turn` with `Ran as its own turn, <span> later.`; a `turn.start` with other text leaves it; a heard message is never changed by either turn event.
- A13: `last` answers the three lines written above for a waiting, a heard (with changes, with reads only, with nothing, with more than 12 changes, pushed), a missed and an own-turn message; `clear` empties the card and answers `Earshot cleared: 2 messages forgotten.`; `LAST` works; `earshot`, `last 2` and `clear all` answer `Usage: /earshot-widget [on|off|last|clear]` and change nothing.
- A14: while off, `last` and `clear` answer `Earshot is off.` and switch nothing on; a mid-turn prompt, an attachment, a step, a tool call, a turn end and a turn start write no state, start no timer and pass on what `next` gave; switching off after use empties `messages` and `flight`; the store only ever holds `isOn`.
- A15: at 20, 40 and 60 columns no row of any state breaks the border; under 30 the narrow forms drawn are used and there is no note; an 80-character message is cut with `…` inside its quotes; a long command is cut at its end; a message with no text is quoted as `(no text)`.
## widget.json
- title: `Earshot`
- category: `Session`
- shows: `Whether Claude has got the message you typed while it was working: how late a request first carried it, and what Claude changed before it heard you`
- commands: `/earshot-widget [on|off|last|clear]`
- cost: empty
