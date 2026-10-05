# Aside (`aside-widget`)
## Purpose
For anyone who, mid-session, wants to ask Claude something about the conversation itself ("why did the first test fail?", "which files have you touched?") without spending a turn on it or steering the work. The question is answered from the session's own transcript by a tool-less fork, the answer stays on a card while the work goes on, and the card says how many turns old the answer has become. The command runs at once even while a turn is in flight, which is when a side question is most wanted.
## What is dropped from the earlier version
The second `/aside` command, switching the widget on by asking, the clipboard copy, and the list of earlier questions. The card holds one question and its answer.
## Asking
`ask <question>` while on:
- `question` is the text after `ask`, whitespace runs made one space, trimmed, cut to 300 characters; its case is kept. Empty: the usage line, nothing changed.
- When `talk.status` is `'asking'`: answers `Still answering the last one; /aside-widget clear drops it.` and makes no call.
- Else `talk` becomes `{ status: 'asking', question, answer: '', turns: 0, ticket: old ticket + 1 }`, then one `await $.model.fork({ prompt: BRIEF + '\n\n' + question })`. `BRIEF` is `This is a side question from the user about the conversation so far. Answer it in plain text, in under 280 characters. Use no tools and do not carry on with the task.`
- A fork that rejects counts as `{ isAnswered: false, reason: 'api-error' }`.
- When the reply arrives and the widget is off, or `talk.status` is not `'asking'`, or `talk.ticket` is not this ask's ticket, the reply is dropped, `talk` is left alone and the command answers `Aside dropped the answer.`
- `isAnswered`: `answer` is `reply.text` with whitespace runs made one space, trimmed, cut to 600 characters; an empty one is treated as `empty-reply`. `status` becomes `'answered'`; the command answers `Answered on the Aside card.`
- Not answered: `status` becomes `'failed'`, `answer` is the sentence for `reply.reason`, which is also the command's answer: `nothing-to-fork` `Nothing to ask about yet. Finish one turn first.`; `api-error` `The model could not be reached. Try again.`; `empty-reply` `The model gave no answer.`; `aborted` `The question was cut short.`
## Card
Title `Aside`. Inner width is the card width less 4; long forms at 36 or more, short below.
- Note: empty when `status` is `'idle'`; `asking`; `no answer` when failed; when answered, empty at 0 turns, else long `plural(turns, 'turn') ago`, short `<turns> ago`.
- Idle: one dim sentence that wraps by words: `No side question yet. /aside-widget ask <question> asks about this conversation without adding a turn to it.`
- Otherwise row `question`: bold, one line, `wrap="truncate-end"`. Then row `answer`, wrapping by words: asking, dim `Reading the conversation…`; failed, the sentence in red; answered, the answer, and when it is longer than inner width times 8 characters, its first (inner width times 8) minus 1 characters followed by `…`. `/widgets width aside-widget <columns>` shows more.
```
Empty: on, nothing asked.
│ Aside                                │
│ No side question yet. /aside-widget  │
│ ask <question> asks about this       │
│ conversation without adding a turn   │
│ to it.                               │
Working: the fork is out.
│ Aside                         asking │
│ Why did the first test fail?         │
│ Reading the conversation…            │
Best moment: answered, two turns later.
│ Aside                    2 turns ago │
│ Why did the first test fail?         │
│ The loop in src/sum.js started at    │
│ index 1, so the first item was never │
│ added.                               │
Error: asked before the first turn ended.
│ Aside                      no answer │
│ Why did the first test fail?         │
│ Nothing to ask about yet. Finish one │
│ turn first.                          │
Busiest at 20 columns: a long answer, cut at 128 characters.
│ Aside      2 ago │
│ Why did the fir… │
│ The loop in      │
│ src/sum.js       │
│ started at index │
│ 1, so the first  │
│ item was never   │
│ added. It start… │
```
## Commands
One command, registered with `immediate: true` so it runs while a turn is in flight; `argumentHint` and usage `[on|off|ask <question>|clear]`. The argument is trimmed; the first word is the verb, lower-cased.
- bare, `on`, `off`: the switch. On: `Aside on; /widgets places it.` Off: `Aside off.` Switching off also sets `talk` to its idle value with the ticket kept, so a reply still on its way is dropped.
- `ask <question>`: as above. Answers where the answer is, or why there is none.
- `clear`: sets `talk` to idle with the ticket kept; answers `Aside cleared.` It also frees a card stuck on `asking`.
- Anything else, `ask` with no question included: `Usage: /aside-widget [on|off|ask <question>|clear]`, nothing changed.
- While off, `ask` and `clear` answer `Aside is off.`, call nothing and leave the switch off.
## Data
- `on('session.start')`: nothing of `e`. `$.command.register({ name, description, argumentHint, immediate: true })`, restores `isOn` from `$.store.get('isOn')`. Nothing else.
- `on('command.run', { command: 'aside-widget' })`: `e.args`.
- `$.model.fork({ prompt })`: once per accepted `ask`, never otherwise. Read from `ModelForkResult`: `isAnswered`, `text`, `reason` (`'nothing-to-fork'`, `'api-error'`, `'empty-reply'`, `'aborted'`). `usage` is not read.
- `on('turn.complete')`: `e.agentId` only. `const done = await next(e)`, returned unchanged always. Off, an `agentId`, or `talk.status` not `'answered'`: nothing more. Else `turns` goes up by one. Aborted turns count too.
- `$.store.get`, `$.store.set`, `$.state`, `$.widgets.card`, the three `on('ui.render')` hooks of the template, `fit()`, `plural()`. No timer (no `sync`), no clock, no `prompt.submit`, no file, no toast, no tool.
- Verified in this build's types (`plugin-authoring/types/claude-code.d.ts`): `fork: (request: ModelForkRequest) => Promise<ModelForkResult>` with `ModelForkRequest = { prompt: string }`; `CommandSpec.immediate?: true` ("typed while a turn is in flight runs at once"); `TurnCompleteInput` carries `agentId?: string`; `CommandRunResult.text`. The fork is tool-less and resolves, never null, on every provider failure.
## State and storage
- `$.state` `isOn: boolean`.
- `$.state` `talk: AsideTalk = { status: 'idle' | 'asking' | 'answered' | 'failed'; question: string; answer: string; turns: number; ticket: number }`, initially `{ status: 'idle', question: '', answer: '', turns: 0, ticket: 0 }`. This session only: an answer is about this conversation.
- `$.store` `isOn: boolean`, the only key. No file.
## Off
No card. `session.start` registers the command and reads `isOn`. `turn.complete` returns `next(e)` and counts nothing. `ask` and `clear` answer `Aside is off.`; no fork is made. Switching off writes `isOn` and empties `talk`; a reply that arrives afterwards is dropped, so on again shows the empty card.
## Demo
Opening line `ask Why did the first test fail?`. The engine's `model.fork` answers after a pause with `Only the loop start in src/sum.js changed: it began at 1 and now begins at 0.`, so no stand-in is needed. At rest: note empty, the question, that answer. After the scripted turn: the same rows under the note `1 turn ago`.
## Live
`bun factory/tools/live.ts factory/floor/plugins/aside-widget --say "/aside-widget on" --say "/aside-widget ask What did I ask first?" --say "Reply with the one word: ok" --say "/aside-widget ask What one word did you just reply with?" --say "/aside-widget off"`
A good run: the first `ask` prints `Nothing to ask about yet. Finish one turn first.`; the second prints `Answered on the Aside card.` and is followed by no assistant message, so the session has exactly one model turn, the `ok`. The store prints `isOn` false and no other key.
## Cost
One model call per `ask`: the session's transcript again (served from the prompt cache while it is warm) plus the question, and a reply of under 280 characters. Nothing is added to the conversation or to any prompt.
## Acceptance
How the tests prove these: `model.fork` is given through `ground()`'s `answers`, recording each request; a test that needs the working state answers it with a promise the test resolves later. Turns end through `$.turn.complete({ answer, durationMs, isAborted, turnId, reason })`.
- A1: on with nothing asked, the card shows the empty sentence, the note is empty and no `question` row is drawn.
- A2: `ask Why did the first test fail?` with a fork answering `The loop started at 1.` makes one fork whose prompt is `BRIEF`, a blank line and the question; the command answers `Answered on the Aside card.`; the card shows the question, the answer and an empty note.
- A3: while the fork is unresolved the note is `asking` and the rows are the question and `Reading the conversation…`; a second `ask` answers `Still answering the last one; /aside-widget clear drops it.` and makes no second fork; once resolved the answer replaces the working row.
- A4: a fork answering `nothing-to-fork`, `api-error`, `empty-reply`, `aborted`, a fork that rejects, and one answered with only spaces each give the note `no answer`, the question, and that reason's sentence on the card and as the command's answer; a following `ask` that is answered replaces it.
- A5: after an answer, one main-thread `turn.complete` gives the note `1 turn ago`, a second `2 turns ago`, an aborted one counts, and one with an `agentId` does not; each resolves to what `next(e)` returned; a new `ask` sets the note back to empty.
- A6: turn ends while idle, asking or failed change nothing on the card.
- A7: a question of `  why   did\n it fail?  ` is asked and shown as `why did it fail?`, `ASK Why?` keeps `Why?`, a 400-character question is cut to 300, and an answer of 700 characters with line breaks is kept as 600 characters on one line.
- A8: `clear` after an answer answers `Aside cleared.` and the card is the empty one; `clear` while the fork is unresolved empties the card, the late reply leaves it empty and its command answers `Aside dropped the answer.`, and a new `ask` afterwards is accepted.
- A9: `off` while the fork is unresolved, then `on`, shows the empty card, and the late reply does not change it.
- A10: while off, `ask why?` and `clear` answer `Aside is off.`, make no fork, write nothing to the store and leave the switch off; a turn end while off leaves `talk` as it was.
- A11: `ask` with no question, `ask` followed by spaces, and an unknown verb each answer `Usage: /aside-widget [on|off|ask <question>|clear]`, make no fork and change nothing.
- A12: the command is registered at `session.start` with `immediate: true` and the hint `[on|off|ask <question>|clear]`; with `isOn` true in the store the card is shown after `session.start` with no command run, and no fork is made.
- A13: at 20 columns the note for two turns is `2 ago`, the question row is one line, and a 300-character answer is drawn as its first 127 characters and `…`; at 40 columns the note is `2 turns ago` and an answer of 288 characters is drawn whole while one of 289 is cut to 287 and `…`; at 60 columns the 300-character answer is drawn whole.
- A14: the answered card has the same title, note, question and answer in the `side`, `above` and `below` placements, and is drawn in none of them while off.
## widget.json
- title: `Aside`
- category: `Session`
- shows: `Ask a side question about the conversation, even mid-turn, and get the answer on a card without adding a turn to the transcript`
- commands: `/aside-widget [on|off|ask <question>|clear]`
- cost: `One model call per question: the conversation so far, from the prompt cache while it is warm, plus a reply of under 280 characters`
