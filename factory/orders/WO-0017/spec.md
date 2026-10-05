# Earpiece (`earpiece-widget`)
## Purpose
For anyone who fans work out to subagents and then watches a spinner. While agents run, the card gives each one a numbered row with the tool it is on and the last sentence it wrote. When a row shows an agent going wrong, `/whisper 2 leave tests alone` puts a note into that one agent's conversation without stopping the turn or the other agents, and the row says `sent`, then `heard` once the agent has answered after it.
## Terms
- Live: an `AgentInfo.status` of `pending`, `running` or `waiting`. Over: any other status, or an id `$.agent.list()` no longer returns. A row that is over stays over.
- Number: given to an id the first time it is seen live, counting up from `next`. An id keeps its number as long as it has a row. Description: `AgentInfo.description` with runs of white space made one space, cut to 80 characters ending in `…`; blank, the agent's `type`, else `agent`. This is what the row, the bare listing and the whisper answer show. Agents are listed flat, a nested one (`parentId`) like any other.
- Left out: an agent first seen over or `idle`, and an agent whose first read answers `{ deny }` (a teammate in its own pane). A denied id goes into `skipped` and is not read again. Neither gets a row or a number. A first read that rejects is not a denial: the id gets a row and a number and shows `starting…`.
- Line: from the agent's messages, the last `assistant` message whose `text` is not blank; runs of white space made one space; split at `/(?<=[.!?])\s+/`; the last piece, cut to 200 characters. None yet: `''`, drawn as `starting…`.
- Tool: the last entry of the last assistant message's `toolUses` if its `text` is `undefined` (in flight), else `''`. `mcp__a__b` is shortened to `b`; cut to 10 characters.
- State word: live, the tool, or `waiting` when the status is `waiting` and there is no tool; over, `failed` for `failed`, `stopped` for `killed`, `done` otherwise.
- The note: `Note from the person running this session, typed while you work (sent with /whisper): <text>`.
- Heard: counted, not matched, because the live run showed that a real read does not hand the appended row back as a `user` message holding the note, or did not answer, while reads did hand back the assistant messages (the tool and the line were right). Answers: the number of `assistant` messages in a read, tool-use-only ones included. A new whisper is `sent` with `seen: null`. The first read of its row that answers with messages, in a refresh begun after the whisper was stored, sets `seen` to the answers; any later read with more answers than `seen` makes it `heard`. So `heard` means the agent has written again since the note went in; it errs late, never early. A whisper still `sent` when its row goes over becomes `missed`, after that row's last read. A conversation past the 4096 entries a read returns stays `sent`. One whisper per row; a new one replaces it. A note appended while a tool use is in flight changes nothing about that call: the agent reads it with its next request, after the tool's result; until then the person sees the tool and `sent`.
- Refresh: `$.agent.list()`; add rows for new live ids; mark rows over; then one `$.session.messages({ agentId })` for each live row that is drawn and each row with a `sent` whisper (and one last read for a row that just went over), setting line, tool, whisper and `isUnread` (false when the read answered with messages; true when it answered `{ deny }` or rejected, and such a read leaves line, tool and whisper as they were). Then `sync`. No hook on an agent's path (`agent.spawn`, `tool.call`, `turn.complete`) awaits a refresh: it starts one, lets it run, and returns; a refresh that rejects is swallowed. If the list call rejects, `isBlind` is set and nothing else changes; the next list that answers clears it.
## Card
Inner width is the card width less 4. Title `Earpiece`. Note: `<n> live` while any row is live (`99+ live` above 99, so it fits beside the title at 20 columns), `done` when rows exist and none is live, none when there are no rows. Each agent takes two rows, both `wrap="truncate-end"`: the number (bold) and description cut with `…` to leave the mark right-aligned after one space; then the line, dim, indented two spaces, cut with `…`. Mark: at an inner width of 30 or more, the state word and the whisper word joined by ` · `; narrower, the whisper word if there is one, else the state word. Over rows are dim throughout. At most 4 agents are drawn, live before over, then by number; the rest are one dim row `+<n> more`. While any row is live and the inner width is 24 or more, a last dim row reads `/whisper <number> <note>`. The empty sentence is wrapped by words by the widget.
```
Empty: no rows. No note.
│ Earpiece                             │
│ No agents running. When Claude       │
│ starts subagents, each gets a row    │
│ here, and /whisper <number> <note>   │
│ slips one a note.                    │
Working: three agents, the third has written nothing yet.
│ Earpiece                      3 live │
│ 1 audit the auth module         Grep │
│   Two callers skip the token check.  │
│ 2 rewrite tests                 Edit │
│   Now rewriting the tests folder.    │
│ 3 update the changelog               │
│   starting…                          │
│ /whisper <number> <note>             │
Best moment: agent 2 was whispered to and answered; agent 3 finished (dim).
│ Earpiece                      2 live │
│ 1 audit the auth module         Grep │
│   Two callers skip the token check.  │
│ 2 rewrite tests         Read · heard │
│   Understood, leaving tests alone.   │
│ 3 update the changelog          done │
│   Added the 2.4.0 entry.             │
│ /whisper <number> <note>             │
All over, until the next prompt: note `done`, rows dim.
│ Earpiece                        done │
│ 2 rewrite tests         done · heard │
│   Left tests alone; fixed src/sum.j… │
│ 3 update the change… failed · missed │
│   Added the 2.4.0 entry.             │
Error: `isBlind`. The sentence in red, no rows, no note.
│ Earpiece                             │
│ Could not read the agents.           │
Busiest at 20 columns: seven agents, six live.
│ Earpiece  6 live │
│ 1 audit th… Grep │
│   Two callers s… │
│ 2 rewrite… heard │
│   Understood, l… │
│ 4 check th… sent │
│   Running the d… │
│ 5 profi… waiting │
│   starting…      │
│ +3 more          │
```
## Commands
- `/earpiece-widget [on|off]`: the switch, with the template's answers and usage. Not `immediate`. Switching on runs one refresh, so agents already running get rows. No `clear` (nothing collected outlasts a prompt) and no tool for Claude.
- `/whisper <number> <note>`: the second command, registered with `immediate: true`. Reason: it is typed in a hurry while a turn runs, which is the only time it is useful, and the widget's own command waits for the turn to end. No shipped or floor widget uses the name. `argumentHint` `<number> <note>`. Arguments are trimmed; the note keeps its case. Checked in this order, the first that applies answers:
  - off: `Earpiece is off.` and nothing else happens.
  - bare: one refresh is run and waited for (so the listing never rests on a timer period that did not come), then one line per row, `2 rewrite tests · Read · heard · Understood, leaving tests alone.` (empty parts left out; a row with `isUnread` has `unread` after the whisper word, the only place it shows), or `No agents on the card.`; while `isBlind`, `Could not read the agents.`
  - not `/^(\d{1,4})\s+(\S[\s\S]*)$/` (so a number of five digits or more too): `Usage: /whisper <number> <note>`.
  - a note over 300 characters: `A whisper is at most 300 characters.`
  - no row with that number: `No agent <n> on the card.` While `isBlind` the list call of the next step is made before this check, so a list that still rejects answers `Could not read the agents.`
  - `$.agent.list()` is called now; it rejects: `Could not read the agents.`; the row's id is absent or not live: `Agent <n> has finished.`, and the append is not called.
  - `$.session.append({ agentId, message: { type: 'user', content: [{ type: 'text', text: <the note> }] } })`. A result with a `uuid`: the whisper is `sent`.
  - any other result (`{ deny }` has no `uuid`) or a rejection, one branch for both: `Agent <n> could not be reached: <reason>` (the `deny` string or the rejection's message, white space made single, cut to 120 characters, or `no reason given`), and the row keeps the whisper it had. Nothing else is tried. The widget never calls `$.session.send`: in the live run a send after a refused append resumed an agent that had just finished, which cost a subagent turn and two main-loop turns. An agent that finishes between the list and the append gets this answer.
  - sent: the row's whisper becomes `{ note, status: 'sent', seen: null }`, refreshes already in flight are outdated so none of them sets `seen`, one refresh is started, and the answer is `Whispered to agent <n> (<description>). The card says heard once it has answered.`
## Data
All verified in this build's types (`plugin-authoring/types/claude-code.d.ts`; `plugins/*/.claude-plugin/types/` is absent from this checkout).
- `on('session.start')`: `$.command.register` twice (`CommandSpec.immediate?: true` on `whisper`), `$.store.get('isOn')`, `sync`; if on, one refresh. `on('command.run', { command: 'earpiece-widget' })` and `on('command.run', { command: 'whisper' })`: read `e.args`.
- `on('agent.spawn')`: `await next(e)` first (`AgentSpawnResult` resolves once the subagent started), then, if on, starts one refresh without awaiting it; returns the result unchanged.
- `on('tool.call')`: if on and `e.agentId !== undefined`, and at least 1000 ms have passed since `readAt` by `$.clock.now()`, sets `readAt` and starts one refresh without awaiting it; then `return next(e)` with `e` untouched. The call is never held on `agent.list` or `session.messages`. A main-loop call reads nothing.
- `on('turn.complete')`: if on and `e.agentId !== undefined`, starts one refresh (not throttled) without awaiting it, and `return next(e)`.
- `on('turn.start')` (main loop only; a subagent's run raises none): if on, drops every over row; if no row is left, `next` goes back to 1.
- `$.agent.list(): Promise<AgentInfo[]>`: reads `id`, `description`, `status`. Once per refresh and once per whisper.
- `$.session.messages({ agentId }): Promise<SessionMessage[] | SessionMessagesDeny>`: told apart with `Array.isArray`; reads `role`, `text`, `toolUses[].tool`, `toolUses[].text`, and counts the `assistant` entries. At most 4 live rows plus rows with a `sent` whisper per refresh, and the same once per bare `/whisper`.
- `$.session.append(args: SessionAppendArgs): Promise<SessionAppendResult>`: only from `/whisper`, as above; reads `uuid`, else `deny`. The append is a plugin's own row (door `note`), so `witness-widget` and any `session.append` hook see it. The types say of its `agentId`: "One that names no running loop is refused." `$.session.send` is not used.
- `$.clock.every(3000, ...)`: one refresh per period, only while on and a row is live. The three `on('ui.render')` hooks and `$.widgets.card`: from the template. Drawing reads state only.
## State and storage
- `$.state` `isOn: boolean`.
- `$.state` `roster: { rows: EarpieceRow[]; next: number; skipped: string[]; readAt: number; isBlind: boolean }`, blank `{ rows: [], next: 1, skipped: [], readAt: 0, isBlind: false }`.
- `EarpieceRow`: `{ id: string; number: number; description: string; status: 'live' | 'waiting' | 'done' | 'failed' | 'stopped'; tool: string; line: string; isUnread: boolean; whisper: { note: string; status: 'sent' | 'heard' | 'missed'; seen: number | null } | null }`. `$.store` `isOn` only. No file. The timer handle is the only module-level `let`.
## Off
No card, no list or message reads, no append, no timer. `agent.spawn`, `tool.call`, `turn.complete` and `turn.start` pass straight to `next(e)`. `/whisper` answers `Earpiece is off.` Switching off cancels the timer and sets the roster back to blank, so numbers start at 1 when it is switched on again.
## Demo
The engine (`docs/engine.js`) has no `$.agent`, no `session.messages` by `agentId`, no `session.append` and no event carrying `agentId`, and its opening lines reach only a widget's own command. Stand-in needed, for this widget only: `agent.list` answering two `running` agents (`audit the auth module`, `rewrite tests`) with a short fixed conversation each (`rewrite tests` ending in `Now rewriting the tests folder.`); `session.append` with an `agentId` answering a `uuid`, after which the second read of that agent and every later one also holds the assistant message `Understood, leaving tests alone.`; an opening step that runs `/whisper 2 leave tests alone`; and, at the end of the scripted turn, both agents `completed` with a `turn.complete` carrying each `agentId`. At rest: `2 live`, row 2 marked `sent`, then `heard` with its new line from the first 3 second tick. After the scripted turn: the note `done`, both rows dim, row 2 `done · heard`. Without the stand-in the widget must draw the error card, not throw.
## Live
`bun factory/tools/live.ts factory/floor/plugins/earpiece-widget --allow "Agent,Bash" --hold 10 --say "/earpiece-widget on" --say "Start one subagent with run_in_background true, description 'count slowly', with this brief: run the Bash command bun -e 'await Bun.sleep(4000)' eight times, one call at a time, then reply with only the word a note from the person gave you, or NONE if there was no note. Do not wait for it. Reply with only: started" --say "/whisper 1 the word is heron" --say "Run the Bash command bun -e 'await Bun.sleep(15000)' once, then reply with only: waited" --say "Run the Bash command bun -e 'await Bun.sleep(15000)' once, then reply with only: waited" --say "/whisper" --say "Run the Bash command bun -e 'await Bun.sleep(15000)' once, then reply with only: waited" --say "Run the Bash command bun -e 'await Bun.sleep(15000)' once, then reply with only: waited" --say "/whisper 1 too late" --say "Reply with only the word the count slowly subagent reported. Start nothing." --say "/earpiece-widget off"`
Control run B is made once, first, and its log kept beside the proof: the same command without the first `--say`, so the widget is off, all three `/whisper` lines answer `Earpiece is off.` and the final answer is `NONE`. B says how a headless session paces a background agent with no widget in it (in the last run the agent's tools moved only while a main turn ran, which is why the waiting turns are there: a `bun -e` timer blocks where a `sleep` is refused, and each stays under the 20 quiet seconds after which `live.ts` types the next line). A good run, in order: (1) `/whisper 1` answers `Whispered to agent 1 (count slowly). The card says heard once it has answered.`; `could not be reached` here sends the order back to ideation. (2) The `[system task_started]` of the subagent's first Bash call comes no later than in B: before the same `>>>` line, and within 5 seconds of B's time where the events carry times. Later than B is a build fault against Refresh (a hook or the timer holds the call). (3) The bare `/whisper`, typed about 30 seconds after the note with the agent still at work, lists `1 count slowly` with `heard` and no `unread`. `sent · unread`: reads of a working agent do not answer, and the order returns to design with that fact. `sent` without `unread`: reads answer but show no new assistant message, and it returns with that fact; either way the log now says which. `No agents on the card.`: the agent finished early and a turn dropped its row; the run is void, not failed. (4) `/whisper 1 too late` answers `Agent 1 has finished.`, `No agent 1 on the card.` or `Agent 1 could not be reached: ...` (or `Whispered to agent 1 (count slowly).` if the agent is still live); after it no `task_started` names the subagent again and the main loop says nothing that a typed line did not ask for. (5) A main-loop answer is `heron`. (6) The store prints `isOn` false and no other key, and stderr is empty. The run cannot type mid-turn; the `immediate` path during a foreground Agent call is the same calls and is proven by hand, as is `done · heard` on a foreground agent's row (a background agent's own completion turn drops its row).
## Cost
No model calls and no tokens for reading. No hook delays an agent's tool call, answer or start: reads run beside them. A whisper adds its note (at most 400 characters) to one running subagent's context and nothing to the main conversation. The widget has no call that can start or resume an agent, so a whisper that arrives too late costs nothing.
## Acceptance
How the tests prove these: `agent.list` and `session.messages` are given through `ground()`'s `answers`, each recording its requests and answering in the shapes above; a `session.send` hook in the test records every send, and A13 holds that count at none. `session.append` has no stand-in: in `claude plugin test` it always rejects with `no implementation for session.append`, so a whisper under test always takes the refused branch, and the append that answers a `uuid` is proven by the Live run alone. A `sent` whisper is planted instead (tried on this build: another plugin's `$.state.set` on `roster` is denied, while a test's `on('state.set', ...)` hook that rewrites `e.value` of the widget's own `roster` write is kept): the hook adds `{ note, status: 'sent', seen: null }` to a row on the next write, and the reads that follow drive it. Agent events are dispatched with an `agentId`; the kit's clock drives the timer and the throttle; a refresh started by an agent event is not awaited by its hook, so a test lets it settle before reading the card. Every test ends well inside the 5 second limit on a cold run: a line is split over several tests rather than drawing many cards in one (A14: one test per width, the 100 agents drawn once).
- A1: on with no agents, the card shows the empty sentence naming `/whisper <number> <note>` and no note; `session.start` registers `earpiece-widget` and `whisper`, the second with `immediate: true`; restored off, it makes no list call.
- A2: an `agent.spawn` that resolves, with three running agents listed, gives rows numbered 1 to 3 in list order with each description, the note `3 live` and the hint row; an agent with no assistant text shows `starting…`; the spawn's result is returned unchanged; a 200-character description with line breaks is one line of 80 characters ending in `…` in the bare listing and the whisper answer, and a blank one shows the agent's `type`.
- A3: the line is the last sentence of the last non-blank assistant message with white space made single and at most 200 characters; an in-flight `mcp__db__run_query_now` shows `run_query_`; an answered tool use shows no tool; status `waiting` with no tool shows `waiting`.
- A4: with append rejecting as it does under test, `/whisper 2 Leave Tests alone` (agent 2 listed `running`) answers `Agent 2 could not be reached: ` and a reason that names `session.append`, is single-spaced and at most 120 characters; the row has no whisper afterwards and its mark is `Edit`; a row with a planted `heard` whisper keeps it; no send is made.
- A5: a planted `sent` whisper stays `sent` on the first read (which sets `seen` to that read's assistant count, a tool-use-only message counted) and on a second read with the same count, also when a `user` message was added; it becomes `heard` on the first read with one assistant message more; a row that goes over while `sent` shows `missed`, and `done · heard` when its last read has one more; a refresh that answers late does not turn `heard` back into `sent`.
- A6: bare `/whisper` makes one list call and waits for its reads before answering, so a message added since the last refresh is in the listing with no timer period passed; a row whose read answers `{ deny }` or rejects lists `unread` after its whisper word (`2 rewrite tests · Edit · sent · unread · Now rewriting the tests folder.`), keeps its line, tool and `sent`, and loses `unread` on the next read that answers; the card never shows `unread`.
- A7: `/whisper x`, `/whisper 2`, `/whisper two words` and `/whisper 99999999999999999999999 hi` answer the usage; a 301-character note answers the limit; `/whisper 9 hi` answers `No agent 9 on the card.`; a whisper to a row whose agent the fresh list shows `completed` or omits answers `Agent 2 has finished.` and leaves the row's whisper as it was. Bare `/whisper` lists every row, and `No agents on the card.` with none.
- A8: a finished agent keeps its number and its last line, dim, with `done`, `failed` or `stopped`; an agent started meanwhile takes the next number, never a used one; a main `turn.start` drops over rows and keeps live ones with their numbers; a `turn.start` that leaves no row makes the next agent number 1; a whisper to a dropped number answers `No agent <n> on the card.`
- A9: an agent whose first read answers `{ deny }` gets no row and no number and is not read again; one whose first read rejects gets a row and a number showing `starting…`; an agent first seen `idle` or `completed` gets none; a `{ deny }` on an existing row keeps its line; an agent with a `parentId` is a row like any other.
- A10: with seven live agents the card draws four, then `+3 more`, with the note `7 live`; live rows come before over rows; one refresh reads only the four drawn agents plus any undrawn row with a `sent` whisper.
- A11: the 3000 ms timer runs only while on with a live row and stops when the last row goes over; two agent `tool.call`s within 1000 ms cause one list call and a third after 1000 ms another; a main-loop `tool.call` causes none; every `tool.call` reaches `next` with its input unchanged; with an `agent.list` that never answers, an agent's `tool.call` still reaches `next` and resolves with its result, an agent's `turn.complete` with its answer and `agent.spawn` with its result.
- A12: when `agent.list` rejects the card shows only `Could not read the agents.` and `/whisper 1 hi`, `/whisper 9 hi` and bare `/whisper` answer the same; the next list that answers brings the rows back; with no `$.agent` answer at all the card still draws this state.
- A13: while off, agent events and timer periods cause no list or read and `/whisper 1 hi` and bare `/whisper` answer `Earpiece is off.`; switching off cancels the timer and empties the roster, so the first agent after switching on is number 1; the store never holds a key but `isOn`; no test in the file, on or off, records a `session.send`.
- A14: at 20, 40 and 60 columns no row of any state is longer than the inner width; `Earpiece` is whole beside `12 live` at 20, and 100 live agents read `99+ live`; with a planted `heard` whisper the mark is `Edit · heard` at 40 and `heard` at 20; the hint row is absent at 20 and present at 40.
- A15: the best-moment card is the same in the `side`, `above` and `below` placements and absent from the two the layout's `site` does not name.
## widget.json
- title: `Earpiece`
- category: `Session`
- shows: `Every running subagent with the tool it is on and its last sentence, and /whisper slips one of them a note without stopping the turn`
- commands: `/earpiece-widget [on|off]`, `/whisper <number> <note>`
- cost: `A whisper adds its note to one subagent's context; no model calls`
