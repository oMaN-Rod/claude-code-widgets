# Premise (`premise-widget`)
## Purpose
For anyone who has had a turn end with a confident answer that rested on something they never told Claude. While Claude thinks, the card quotes the sentences of its thinking summary that name something not given and a choice made anyway ("Since the database type isn't specified, I'll default to pg_dump"); when the reply flags the choice, the quote is dropped. What is left is what Claude filled in without telling you, and one verb starts the correction. No model call, no tokens. It needs one setting: on this build (2.1.289) Claude Code asks for no thinking text unless `settings.json` has `"showThinkingSummaries": true` (headless: `--thinking-display summarized`); without it the thinking block arrives empty, and the card says so and says how to change it. With it, the hook receives the summary Claude Code shows, a short paraphrase of the thinking, and that is all the card reads. It claims only that: an empty card means no sentence of the summary was worded this way, never that nothing was assumed. Kept from the idea: live quotes, the dropped-when-said rule, three distinct rest states, `fix`. Cut: any rule that guesses whether a later tool call verified an assumption.
## Rules
- Main loop only. A `turn.step` or `turn.complete` whose `e.agentId` is set is passed on unread.
- Sentence: chunks are joined per block (`kind` and `index`) in a buffer local to the step. A sentence ends at `.`, `!` or `?` followed by white space, or at a newline, but not at the full stop of `e.g.`, `i.e.`, `etc.` or `vs.`. The unfinished tail waits for the next chunk; a block's buffer is flushed as a last sentence when a chunk of another block arrives and when the step ends, however it ends. A sentence is cleaned: white space runs become one space, a leading `- `, `* ` or `1. ` is removed, the ends trimmed.
- The phrases below are taken from the 21 real thinking summaries listed under Live, not imagined. All match without regard to case, at word boundaries, with `'` or `’`.
- Gap: `isn't`, `wasn't`, `aren't`, `weren't` or `didn't`, a space, then `specify` or `specified`; `no`, one or two words, `is` or `was`, then `specified` or `given`; `i don't know`; `without specifics`; `without knowing`.
- Choice: `i'll`, `i will`, `i need to pick`.
- Trigger (thinking sentences only): a sentence that holds a gap and a choice, in either order, and does not end in `?`. A gap with no choice (`I don't know the stack, so I should ask.`) and a choice with no gap list nothing. Bare `assume`, `assuming`, `probably` and `likely` never match.
- Item: `quote` is the cleaned sentence, cut to 240 characters with `…`; `gist` is the sentence from its first choice onward, its closing `.` or `!` dropped, cut to 80 with `…`. An item whose `quote`, lowercased, equals one already held this turn is not added (a retried step lists nothing twice). At most 20 items per turn; the oldest gives way.
- Content words of a sentence: lowercased runs of letters and digits, 4 or more long, not starting with `assum` and not in the stop list: `that this with from have will just they their them then than since know specified specify without which what when your into only most some like about should would could there here also need pick write default being each`. Two words match when equal, or when both are 5 or more long and share their first 5 characters.
- Flag (reply sentences only): a word starting with `assum`, `placeholder`, `placeholders`, `replace`, `adjust`, `unknown`, `best guess`, or `specified` straight after `not` or a word ending in `n't`.
- Said: when a step ends, each reply sentence of that step (its `text` chunks, cut by the same rule, code and comments included) is held against every unsaid item of the turn. An item is said when one reply sentence holds a flag and shares at least one content word with the item's `quote`. Every step's text is checked, not only the last; an item thought in a later step than the sentence that flags it is kept. A reply that merely uses the chosen thing (`pg_dump` in a bare cron line) says nothing.
- Unspoken: the items not said, oldest first, numbered from 1. The card and both verbs use these numbers.
## Card
Title `Premise`. Inner width is the card width less 4. An item is its number, a space and its `gist`, wrapped by words by the widget to at most 2 rows (the second indented 2), cut with `…`. The last 3 unspoken items are drawn; with more, a dim last row. At most 7 rows. Sentences are wrapped by words by the widget and dim.
```
Empty: on, no turn seen yet. No note.
│ Premise                              │
│ What Claude takes for granted in its │
│ thinking and does not say appears    │
│ here while it thinks.                │
Working, nothing found yet. Note `live`.
│ Premise                         live │
│ Reading Claude's thinking…           │
Working, with items. Note `<n> so far`.
│ Premise                     1 so far │
│ 1 I'll default to a PostgreSQL       │
│   pg_dump example with placeholder … │
Best moment: the turn ended on a bare, confident answer. Note `<n> unspoken`.
│ Premise                   2 unspoken │
│ 1 I'll default to a PostgreSQL       │
│   pg_dump example with placeholder … │
│ 2 I'll go with a permissive          │
│   E.164-style pattern that matches … │
At rest, thinking seen, nothing unspoken (third row only when items were said):
│ Premise                              │
│ The thinking shown words nothing as  │
│ an assumption.                       │
│ 2 were said in the reply.            │
At rest, no thinking text arrived (hidden by the setting, or Claude did not think: the card cannot tell which and claims neither):
│ Premise                              │
│ No thinking text reached this card.  │
│ /premise-widget show says why.       │
Error: the reader threw; the row red. Items found before it are still drawn above it.
│ Premise                              │
│ Could not read this turn's thinking. │
Busiest at 20 columns: 5 unspoken, note `5` (the bare count under an inner width of 24).
│ Premise        5 │
│ 3 I'll default   │
│   to a PostgreS… │
│ 4 I'll go with a │
│   permissive E.… │
│ 5 I'll give a    │
│   PowerShell on… │
│ +2 earlier       │
```
At 40 the dim last row reads `+2 earlier · show lists all`. At 20 the nothing-unspoken state is at most 6 rows (`The thinking`, `shown words`, `nothing as an`, `assumption.`, `2 were said in`, `the reply.`) and the no-thinking state 5 (`No thinking text`, `reached this`, `card.`, `/premise-widget`, `show says why.`). Widths are counted in characters; wide (CJK) text may be cut by the terminal instead of by the widget, which is accepted.
## Commands
`/premise-widget [on|off|show|fix <n>|clear]`. The verb is matched without regard to case. Bare, `on`, `off` and the usage as in the template; `fix` with no whole number answers the usage. No second command, no tool.
- `show`: first line `Premise: <plural assumptions> in the thinking shown that the reply does not flag. Claude may have checked them since.`, then one line per unspoken item, `<n>. "<quote>"`, in full, then `<n> more said in the reply.` when any were. With nothing unspoken it answers the card's rest sentence for that state (empty, reading, could not read); in the nothing-unspoken state it answers that sentence, the said row when there is one, and then the LIMIT sentence: `Premise reads only the summary of the thinking, for sentences that name something not given and a choice made anyway. Claude may have assumed more than that.` In the no-thinking state it answers the WHY sentence: `No thinking text reached Premise this turn. Claude Code sends it only when settings.json has "showThinkingSummaries": true (headless: --thinking-display summarized). Set it, and restart Claude Code if it does not take effect. If it is set, Claude did not think this turn.` Never the WHY sentence while a turn is live.
- `fix <n>`: calls `$.prompt.fill({ text })` with `You assumed: "<quote>". That is wrong: `, where every `"` in the quote is written `'` and the text is one line. Nothing is sent. Answers `Filled the prompt with assumption <n>. Finish the sentence and send it.`; on `isFilled: false`, `Could not fill the prompt box. Assumption <n>: "<quote>"`; with no such item, `No assumption <n>. /premise-widget show lists them.`; a number of more than 3 digits answers the usage.
- `clear`: sets `turn` back to blank and answers `Premise cleared.` A turn in flight goes on being read from its next step.
- While off, `show`, `fix` and `clear` answer `Premise is off.` and read, fill and change nothing.
## Data
Verified in this build's types (`plugin-authoring/types/claude-code.d.ts`, 2.1.289; `plugins/*/.claude-plugin/types/` is absent from this checkout).
- `on('turn.start', ($, e, next))`: `TurnStartInput` `{ text, turnId }`. If on, `turn` becomes a fresh live record for `e.turnId`. `return next(e)`.
- `on('turn.step', async function* ($, e, next))`: `TurnStepInput` `{ turnId, index, model, effort?, messageCount, agentId? }`. Off, or `agentId` set: `return yield* next(e)`, nothing else. Otherwise the hook reads `const stream = next(e)` with `for await`, yields every chunk at once, unchanged and in order, then `return await stream.result` (`HookStream<TurnStepChunk, TurnStepResult>`), so the widgets above (`stream-widget`) get the same chunks and the same result. It reads `TurnStepThinkingChunk` (`kind: 'thinking'`, `index`, `text`) and `TurnStepTextChunk` (`kind: 'text'`, `index`, `text`); `tool`, `input`, `stop` and `engine` chunks are passed on unread. `e` goes down untouched.
- When thinking text arrives (read from this build's executable and proved by run, see Live): an interactive session asks for `summarized` thinking only when the setting `showThinkingSummaries` is true (default false); a headless stream-json session ignores the setting and asks for it only with `--thinking-display summarized`. Otherwise the reply carries a thinking block of 0 characters and no non-blank `thinking` chunk reaches the hook. The widget reads no setting and changes none.
- The reading of each chunk is inside its own `try`: a throw there sets `isBroken`, stops the reading for the rest of the step, and the chunk is still yielded. The step's end work (flush, said) runs in `finally`, in its own `try`.
- A step whose `turnId` is not the held one starts a fresh live record first (the widget was switched on, or cleared, mid-turn), after reading the switch again like every other write.
- State writes per step: one when the first non-blank thinking chunk of the turn arrives, one per item found, one at the step's end. Before each, the switch is read again; off, nothing is written.
- `on('turn.complete', ($, e, next))`: `TurnCompleteInput` `{ answer, turnId, agentId?, reason, ... }`. If on, main loop and `e.turnId` is the held one, `phase` becomes `settled`, whatever `e.reason` is. `return next(e)` with its result unchanged.
- `$.prompt.fill(input: PromptFillArgs): Promise<PromptFilled>` (`isFilled`, `refusal?`), from `fix` only, `mode` left out.
- `on('session.start')`, `on('command.run', { command: 'premise-widget' })`, the three `on('ui.render')` hooks, `$.widgets.card`. Drawing reads state only. No `$.model`, `$.fs`, `$.process`, `$.clock`, no timer.
## State and storage
- `$.state` `isOn: boolean`.
- `$.state` `turn: { id: string; phase: 'idle' | 'live' | 'settled'; sawThinking: boolean; isBroken: boolean; found: PremiseItem[] }`, blank `{ id: '', phase: 'idle', sawThinking: false, isBroken: false, found: [] }`.
- `PremiseItem`: `{ quote: string; gist: string; isSaid: boolean }`.
- `$.store` `isOn` only. No file. No quote of the thinking or the reply is ever written to the store or to disk. No module-level `let`: buffers live inside the step's generator.
## Off
No card, no reading: `turn.step` is `return yield* next(e)`, `turn.start` and `turn.complete` pass straight on. Switching off sets `turn` back to blank, so no quote outlives the switch; a step in flight writes nothing more.
## Demo
`docs/engine.js` raises `turn.start` and `turn.complete` but no `turn.step`. Shipping step, owned by the director because the file is outside the widget's folder, and the order does not ship without it: the scripted turn raises one main-loop `turn.step` between the two, whose bottom yields, in pieces that split words, the thinking `The test imports sum from src/sum.js. Since the test runner isn't specified, I'll default to node --test. Edit the file.` and then the text `Fixed the off-by-one in src/sum.js.`, and returns a `TurnStepResult`. At rest: the empty sentence. After the scripted turn, on the page and from `render.ts --turns 1`: note `1 unspoken` and `1 I'll default to node --test`. Until the stand-in is in, the card after the turn reads `No thinking text reached this card.` and `/premise-widget show says why.`, and nothing throws.
## Live
`bun factory/tools/live.ts factory/floor/plugins/premise-widget --claude "--thinking-display summarized" --say "/premise-widget on" --say "Think it through first and use no tools. Reply with only a cron line that backs up my database every night, nothing else." --say "/premise-widget show" --say "/premise-widget fix 1" --say "Use no tools. Reply with only the command that restarts my web server, nothing else." --say "/premise-widget show" --say "/premise-widget off"`
Runnable as written; two small prompts, no tools, in the factory's scratch project under the factory's config directory. A good run: both replies arrive whole; at least one `show` answers the numbered list, and every quote in it names something the prompt did not give and that reply does not mention (the reply and the quote are both printed, so the reader can judge); `fix 1` after a list answers, headless, `Could not fill the prompt box. Assumption 1: "..."`; no `show` is the WHY sentence or `Could not read`; the store prints `isOn` false and no other key. A bad run: both `show` answers are the rest sentence, or any quote is of something the reply did say. A `show` that gives the rest sentence under a bare reply is a miss to record, not a lie: the sentence now claims only what was read. `live.ts` still prints an empty `[assistant]` line for a thinking part; printing it would let the reader see what a miss missed, and is not needed to judge a hit.
Evidence, 2026-10-05: 27 real turns with `--thinking-display summarized` in the scratch project (5 from earlier factory runs, 22 from the designer's `claude -p` probes with no plugin loaded and no switch touched; the sessions are saved under the factory config's `projects/`). 21 carried a summary; 6 carried none. The gap and choice lists were written from the first 15 turns; the last 12 were held out, and against them the list as first written quoted 2 turns, both right, and missed 2 (`no specific path was given`, `without knowing`), which were then added and have met no fresh text since. With the lists above, a scratch copy of the rule over all 21 summaries gives: 7 turns with one unspoken quote, each read against its reply and found true (the cron prompt twice, `Since the database type isn't specified, I'll default to ...`; `Since no country is specified, I'll go with a permissive E.164-style pattern`; `They didn't specify which web server, ... so I'll just give the restart command`); 5 quotes dropped as said, each by a reply line such as `this assumes a Node.js app` or `Project type unknown`; 9 with nothing, none of which made a choice (refusals, answers, a tool turn). No false quote. Not shown by this: every prompt was built to leave a gap, the wording belongs to this build's summariser, and on ordinary tool turns the card will mostly rest. The interactive condition (the setting) is read from the executable and was not run: prove it by hand only after asking the owner, in a scratch project, leaving every switch and setting as found.
## Cost
None: no tokens, no model call, nothing added to a prompt. While on, a string match per streamed sentence of the main loop and a handful of state writes per step.
## Acceptance
Tests drive `turn.step` through the widget with a bottom that yields scripted chunks and returns a result, collect what the hook yields and returns, and read the card and `$.state`.
- A1: on, before any turn, the card shows the empty sentence and no note; after `turn.start` it shows `Reading Claude's thinking…` with the note `live`.
- A2: thinking `Since the database type isn't specified, I'll default to pg_dump. Now write it.` streamed as chunks that split mid-word and mid-sentence gives one item with that whole first sentence as `quote` and `I'll default to pg_dump` as `gist`; the item is on the card with the note `1 so far` before the step ends; a tail with no closing full stop is listed when the step ends; white space runs and a leading `- ` are cleaned; `I don't know the OS, e.g. Ubuntu or Debian, so I'll write POSIX sh.` is one item whose gist is `I'll write POSIX sh`.
- A3: each gap form with each choice lists its sentence, with `’` as with `'`, in capitals, and with the gap after the choice (`I'll give a one-liner for the current directory, since no specific path was given.`); these list nothing: `I don't actually know what this project uses to run its tests, so guessing a command would just be fabricating something.`, `They haven't shared any examples, and I have no way to look that up.`, `I could use a generic placeholder instead of assuming Postgres, but that feels less useful.`, `Since the project only has a README, there's nothing concrete to test yet.`, `I'll assume the migration has already been run.`, `The stack isn't specified, so what will I pick?`
- A4: after `turn.complete` with two unsaid items the note is `2 unspoken` and both are drawn numbered; `reason: 'aborted'` settles the same way; the next `turn.start` empties the list.
- A5: a turn with thinking and no trigger shows `The thinking shown words nothing as an assumption.`; a turn with text chunks and no thinking chunk shows `No thinking text reached this card.` and `/premise-widget show says why.`, as does a turn whose only thinking chunk is blank; the two sentences and the empty sentence are three different strings, and none of the widget's strings says there were no assumptions.
- A6: the item `Since they didn't specify a stack, I'll assume Node.js as the most common case.` is said by the reply line `# NOTE: written without inspecting the project, so this assumes a Node.js app` and then gone from the card, which reads the nothing-unspoken sentence and `1 was said in the reply.` (`2 were said in the reply.` for two); it is kept after `FROM node:22-alpine` (no flag) and after `Replace the port if yours differs.` (a flag, no shared word); `Since the database type isn't specified, I'll default to pg_dump.` is kept after `0 2 * * * pg_dump mydb > /var/backups/mydb.sql`; a flagged sentence in an earlier step's text says an item held then, and a later item is kept.
- A7: every chunk the bottom yields (`thinking`, `text`, `tool`, `input`, `stop`, `engine`) comes out of the hook unchanged, in order, each before the next is read, and the hook returns the bottom's result; with a second pass-through generator hook registered above and below, as `stream-widget` is, both see the same chunks and result.
- A8: a step with `agentId` lists nothing, sets no state and is forwarded whole; a `turn.complete` with `agentId` does not settle the main turn.
- A9: the same thinking streamed in two steps of one turn, or twice in one step, lists each assumption once; a 21st item pushes the oldest out; a step whose `turnId` is new starts a fresh list without a `turn.start`.
- A10: with a state write that rejects while reading, every chunk is still yielded, the result is still returned, and the settled card shows the red `Could not read this turn's thinking.` under any item found before; a bottom that throws mid-stream rethrows the same error after the tail is flushed.
- A11: `show` answers the first line with the count by `plural()` and the words `in the thinking shown that the reply does not flag`, each unspoken item in full as `<n>. "<quote>"`, and `1 more said in the reply.` when one was; with nothing unspoken it answers the card's sentence in the empty, reading and could-not-read states, the nothing-unspoken sentence followed by the LIMIT sentence in that state, and in the no-thinking state the WHY sentence, which names `"showThinkingSummaries": true` and `--thinking-display summarized`; `SHOW` is the same verb.
- A12: `fix 2` calls `prompt.fill` once with exactly `You assumed: "<quote>". That is wrong: ` for the second unspoken item, a quote holding `"` and a newline arriving as one line with `'`, and answers the filled sentence; `isFilled: false` answers the could-not-fill sentence with the quote; `fix 9` answers `No assumption 9. /premise-widget show lists them.`; `fix`, `fix x`, `fix 99999999999999999999999` and `what` answer the usage naming all five verbs and call nothing.
- A13: `clear` sets `turn` to blank, the card shows the empty sentence, and a later step of the same turn is read again; switching off sets `turn` to blank; while off `show`, `fix 1` and `clear` answer `Premise is off.`, `prompt.fill` is not called, `turn.start`, `turn.step` and `turn.complete` set no state, and the step's chunks and result pass through; a step in flight when the switch goes off writes nothing more, its fresh record included.
- A14: at 20, 40 and 60 columns no row of any state is longer than the inner width, an item takes at most 2 rows and ends in `…` when cut, only the last 3 of 5 unspoken items are drawn with their own numbers, the last row is `+2 earlier` at 20 and `+2 earlier · show lists all` at 40, the note is `5` at 20 and `5 unspoken` at 40, and the best-moment card is the same in all three placements.
- A15: a 300-character trigger sentence is held as a 240-character `quote` ending in `…` and a `gist` of at most 80 that starts at the choice; after every test above the store holds no key but `isOn`, no file was written, and no `$.model`, `$.fs`, `$.process` or `$.clock` call was made.
## widget.json
- title: `Premise`
- category: `Session`
- shows: `Quotes thinking-summary sentences that name a gap and a choice made anyway, unless the reply flags it, and starts your correction; no model call; needs "showThinkingSummaries": true in settings.json`
- commands: `/premise-widget [on|off|show|fix <n>|clear]`
- cost: empty
