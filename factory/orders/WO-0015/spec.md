# Critic (`critic-widget`)
## Purpose
For anyone about to commit work Claude wrote and wanting a reader who was not in the room. `review` sends the uncommitted diff, and nothing of the conversation, to a separate model that is told to list only real defects; the card holds what it found; `tell` hands the list to Claude with the next prompt, to fix or to reject with a reason.
## What is dropped from the earlier version
The second command `/critic` (one command, verbs `review`, `tell`, `clear`); a review that switches the widget on; `auto` (a model call after every editing turn, and with it the `tool.call` and `turn.complete` hooks and the timer); `model <name>` (the reader is always `sonnet`); the stored `model` and `isAuto`; the review count; "no defects" as the reading of any reply without bullets.
## Terms
- The diff: `stdout` of `$.process.run(['git', 'diff', 'HEAD', '--no-color', '--no-ext-diff'])`, run in the session's working directory. It covers tracked files only; a new untracked file is not read. Its first 40,000 characters are sent; it is `cut` when it was longer or `isStdoutTruncated` is true.
- The request: `$.model.complete({ model: 'sonnet', system: BRIEF, prompt: <the diff>, maxTokens: 900, timeoutMs: 60_000 })`. BRIEF: `You are a second pair of eyes on a git diff. Report only defects that would cause wrong behaviour, a crash, data loss or a security hole. Never comment on style, naming, tests that could be added, or anything you only suspect. Write one finding per line as "- path:line: what breaks and when", at most six lines. If you find no defect, reply with exactly NONE.`
- Reading the reply: trimmed text that matches `/^none\.?$/i` is clean. Otherwise each line that matches `/^[-*]\s+\S/` after trimming is a finding: the bullet removed, runs of white space made one space, cut to 240 characters; the first 6 are kept. One or more findings is found; none is the failure `unreadable`.
- Failures, each a sentence: git exits non-zero `No git repository here, or no commit yet.`; `$.process.run` rejects `Could not run git diff.`; the diff is blank after trimming `Nothing uncommitted in tracked files.` (no model call); `api-error`, or `$.model.complete` rejects, `The reviewing model could not be reached.`; `empty-reply` `The reviewing model gave no answer.`; `aborted` `The review took too long and was stopped.`; unreadable `The reviewer's reply could not be read.` Only `reason` is read; `status` and `error` are never printed.
- Ticket: a number in the state, raised by each `review`. A reply is kept only if the review is still `reading` with the same ticket; `clear` and switching off set the status to `idle`, so a late reply is dropped.
## Card
Inner width is the card width less 4. Title `Critic`. One wording at every width: each sentence is wrapped by words to the inner width by the widget (a word longer than the row is broken), and every row is drawn with `wrap="truncate-end"`. A finding is a dim number and a space, then its text wrapped to the inner width less 2; at most two rows are drawn, the second indented two spaces, and when text remains the second row is cut to the inner width less 3 and ends in `…`. The whole finding is in the answer of `review` and in what Claude is told.
```
Empty: no review. No note.
│ Critic                               │
│ No review yet. /critic-widget review │
│ has a separate model read the        │
│ uncommitted diff and list only real  │
│ defects.                             │
Working: note `reading`, row dim.
│ Critic                       reading │
│ Reading the diff…                    │
Best moment: findings. Note `<n> found`. Last sentence dim.
│ Critic                       2 found │
│ 1 src/sum.js:4: total starts at      │
│   list[0] and the loop now starts a… │
│ 2 src/cart.js:9: price is read       │
│   before the null check on item      │
│ /critic-widget tell hands these to   │
│ Claude.                              │
After `tell`, the last sentence is `Goes to Claude with your next prompt.`
Clean: note `clean`, sentence green.
│ Critic                         clean │
│ No defects found in the diff.        │
Error: note `no review`, the failure's sentence in red.
│ Critic                     no review │
│ The reviewing model could not be     │
│ reached.                             │
Busiest at 20 columns: findings, after `tell`.
│ Critic   2 found │
│ 1 src/sum.js:4:  │
│   total starts…  │
│ 2 src/cart.js:9: │
│   price is read… │
│ Goes to Claude   │
│ with your next   │
│ prompt.          │
```
When the diff was cut, found and clean gain a dim sentence before the last one: `Only the first part of a long diff was read.`
## Commands
One command, `argumentHint` `[on|off|review|tell|clear]`, not `immediate` (a diff read mid-turn is half an edit). Arguments are trimmed and lower-cased.
- `/critic-widget`, `on`, `off`: the switch, with the template's answers (`Critic on; /widgets places it.`, `Critic off.`). Anything unknown: `Usage: /critic-widget [on|off|review|tell|clear]`, nothing changed.
- `review`: answers what the separate model found in the diff. Already reading: `Still reading.`, no second call. Otherwise raises the ticket, sets `reading` (dropping earlier findings and a pending `tell`), runs git, then the request, and answers when the reply is in: found, the findings whole and numbered, one per line (`1. src/sum.js:4: ...`), then the line `/critic-widget tell hands these to Claude.`; clean, `No defects found.`; a failure, its sentence; a reply dropped by its ticket, `Critic dropped the review.` A cut diff adds the last line `Only the first part of a long diff was read.` to found and clean.
- `tell`: with findings on the card, marks them to go and answers `The findings go to Claude with your next prompt.` (the same on a second `tell`). In any other state: `No findings to hand over.`
- `clear`: sets the review back to empty, keeping the ticket; answers `Critic cleared.`
- While off, `review`, `tell` and `clear` answer `Critic is off.` and do nothing else. No second command and no tool.
## Data
All verified in this build's types (`plugin-authoring/types/claude-code.d.ts`; `plugins/*/.claude-plugin/types/` is absent from this checkout).
- `on('session.start')`: the template's work only: `$.command.register`, `$.store.get('isOn')`.
- `on('command.run', { command: 'critic-widget' })`: reads `e.args`.
- `$.process.run(argv: readonly string[], init?: ProcessRunInit) => Promise<ProcessRunResult>`: once per `review`; reads `exitCode`, `stdout`, `isStdoutTruncated`. Rejects on its 30 second default timeout.
- `$.model.complete(request: ModelCompleteRequest) => Promise<ModelCompleteResult>`: at most once per `review`; reads `isAnswered`, `text`, `reason` (`'api-error' | 'empty-reply' | 'aborted'`). `timeoutMs` resolves `aborted`.
- `on('prompt.submit')`: once per prompt. While on with a `tell` pending and `e.origin.kind` one of `composer`, `bridge`, `sdk`: sets the review back to empty, then returns `next({ ...e, context: [...(e.context ?? []), told] })`. Otherwise `next(e)` unchanged. `told` is one entry: `critic-widget: an independent reviewer that saw only the uncommitted diff, not this conversation, flagged these. Check each against the code. Fix the ones that are real, and say which you reject and why:` then each finding whole on its own line as `- <finding>`.
- The three `on('ui.render')` hooks and `$.widgets.card`: from the template. No timer, no file, no `tool.call`, no `turn.complete`.
## State and storage
- `$.state` `isOn: boolean`.
- `$.state` `review: { status: 'idle' | 'reading' | 'found' | 'clean' | 'failed'; findings: string[]; why: string; isCut: boolean; isTelling: boolean; ticket: number }`. Blank: `idle`, no findings, `why` `''`, both false, ticket 0. `why` is the failure's sentence. Findings are non-empty only when `found`; `isTelling` is true only when `found`.
- `$.store` `isOn`, and nothing else. A review lasts for the session only. No file. No module-level `let`.
## Off
No card; `prompt.submit` returns `next(e)` at once and adds nothing; the verbs answer `Critic is off.` and run neither git nor the model. Switching off sets the review back to empty (keeping the ticket), so a pending `tell` is forgotten and a reply still on its way is dropped when it lands. Nothing is written to the store but `isOn`.
## Demo
Opening lines `review`, then `tell`. The engine's `process.run` already answers `git diff` with the one-line change to `src/sum.js`. Stand-in needed: `SAID['critic-widget'] = '- src/sum.js:4: total starts at list[0] and the loop now starts at 0, so the first item is added twice'` (without it the engine's `model.complete` answers `{ isAnswered: false }` with no `reason`, which the widget must still draw as `The reviewing model could not be reached.`). At rest: note `1 found`, the finding on two rows ending in `…`, and `Goes to Claude with your next prompt.` After the scripted turn, whose prompt carried the finding to Claude: the empty card.
## Live
`bun factory/tools/live.ts factory/floor/plugins/critic-widget --allow "Bash" --say "/critic-widget on" --say "Run this one command and reply with the word done: git init -q; git add -A; git -c user.name=live -c user.email=live@example.com commit -qm base; printf 'export const last = list => list[list.length]\n' >> README.md" --say "/critic-widget review" --say "/critic-widget tell" --say "What did critic-widget just tell you? Quote it in one line." --say "/critic-widget off"`
A good run: `review` prints at least one numbered finding that names `README.md` (the real `git diff HEAD` and a real `sonnet` call) and the `tell` line; `tell` prints `The findings go to Claude with your next prompt.`; the last turn quotes the finding, so the context reached the model. If the reviewer finds nothing, `review` prints `No defects found.` and `tell` prints `No findings to hand over.`: git and the model are still proven, the handover is not, and the run is repeated. The store prints `isOn` false and no other key. The session runs in the factory's scratch project under its own config directory.
## Cost
One model call per `review`: up to 40,000 characters of diff to `sonnet`, a reply of at most 900 tokens. `tell` adds the findings (at most 6 lines of 240 characters) to one prompt. Nothing is spent unless a verb is typed.
## Acceptance
How the tests prove these: `process.run` and `model.complete` are given through `ground()`'s `answers`, each recording its requests and answering in the shape of `ProcessRunResult` and `ModelCompleteResult` (with `usage`); the working state uses a promise the test resolves later; what Claude is told is read from the kit's `contexts`.
- A1: on with no review, the card shows `No review yet.` and the sentence naming `/critic-widget review`, with no note; `session.start` (switch restored from the store or not) and switching on run neither git nor the model.
- A2: `review` with a diff and a reply of two bullet lines runs `['git', 'diff', 'HEAD', '--no-color', '--no-ext-diff']` once and one request with `model: 'sonnet'`, the BRIEF as `system`, the diff as `prompt`, `maxTokens: 900` and `timeoutMs: 60000`; the card has the note `2 found`, both findings numbered and the `tell` sentence; the answer is both findings whole, numbered, then `/critic-widget tell hands these to Claude.`
- A3: while the model has not answered, the card has the note `reading` and the row `Reading the diff…`; a second `review` answers `Still reading.` and makes no second git or model call; when the reply lands the card shows it.
- A4: replies of `NONE`, ` none. ` and `None` each give the note `clean`, the sentence `No defects found in the diff.` and the answer `No defects found.`; a later `review` that finds something replaces the clean card.
- A5: each failure shows the note `no review` and its sentence, on the card and as the answer: git exit code 1; `process.run` rejecting; a diff of only white space (and no model call is made); `api-error`; `model.complete` rejecting; a result of `{ isAnswered: false }` with no reason; `empty-reply`; `aborted`; a reply of prose with no bullet line and not `NONE`. An `api-error` with `status: 529` and `error: 'overloaded'` prints neither.
- A6: a reply mixing prose, `- ` and `* ` bullets, doubled spaces, a 400-character finding and eight bullets yields 6 findings, bullets removed, spaces single, none over 240 characters, the prose lines absent; the note reads `6 found`, and one finding reads `1 found`.
- A7: a diff of 50,000 characters sends exactly its first 40,000 and adds `Only the first part of a long diff was read.` to the card and to the answer, on a found and on a clean review; so does a shorter diff with `isStdoutTruncated: true`; a diff of 40,000 characters adds nothing.
- A8: after a found review, `tell` answers `The findings go to Claude with your next prompt.` and the card's last sentence becomes `Goes to Claude with your next prompt.`; the next `composer` prompt carries exactly one added context entry, after any already there, holding the lead sentence and every finding whole (a 240-character one uncut); the card is then empty and the prompt after carries none. `bridge` and `sdk` prompts hand over the same; a `task-notification` prompt carries nothing and leaves the handover pending.
- A9: `tell` while empty, reading, clean or failed answers `No findings to hand over.` and the next prompt carries nothing; `tell` twice hands the findings over once; a `review` started after `tell` cancels the handover; a prompt with findings on the card but no `tell` carries nothing and leaves the card as it was.
- A10: `clear` answers `Critic cleared.` and empties a found, clean or failed card and a pending `tell`; `clear` during a review empties the card, the late reply changes nothing and its `review` answers `Critic dropped the review.`; a `review` begun after that `clear`, while the first reply is still out, shows its own result and not the first one's.
- A11: while off, `review`, `tell` and `clear` answer `Critic is off.` with no git call, no model call and no store write; a prompt passes with its text and context exactly as given; switching off after `tell` and on again leaves an empty card and the next prompt carries nothing; switching off during a review drops its reply, and the card after switching on is empty.
- A12: `model opus`, `auto`, `review now` and `stop` each answer `Usage: /critic-widget [on|off|review|tell|clear]` and change neither the switch, the card nor the store; `REVIEW` works as `review`; `session.start` registers one command, `critic-widget`, and none named `critic`; after reviews, `tell` and `clear` the store holds no key but `isOn`.
- A13: with six findings of 240 characters, one of them a 60-character path with no space, at 20, 40 and 60 columns: every finding takes exactly two rows, the second ending in `…`; no row of any state (empty, reading, found before and after `tell`, cut, clean, each failure) is longer than the inner width; and the note sits beside the title on one row.
- A14: the found card is the same in the `side`, `above` and `below` placements and absent from the two placements the layout's `site` does not name.
## widget.json
- title: `Critic`
- category: `Project and git`
- shows: `A second pair of eyes: a separate model reads the uncommitted diff and lists only real defects, which you can hand to Claude`
- commands: `/critic-widget [on|off|review|tell|clear]`
- cost: `One model call per review: up to 40,000 characters of diff to sonnet and a reply of at most 900 tokens`
