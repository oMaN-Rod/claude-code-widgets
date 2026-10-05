# Queue (`queue-widget`)
## Purpose
For someone about to leave the keyboard with several jobs for Claude. They line the prompts up; each runs as its own turn when the one before has ended. With a gate (a shell command such as `bun test`), a prompt is not finished until the command exits 0: while it fails, Claude is sent its output and asked to fix it, up to 3 times. On return the card and `report` say how each prompt ended and why the queue halted, if it did.
## What is dropped from the earlier version, and what each fault becomes
- Dropped: the commands `/queue` and `/until` (both switched the widget on; now the verbs `add` and `until`); `stop` (off is the stop); `rounds` (3 retries, fixed); the `tool.check` hook that halted on a permission dialog (the turn waits for the person anyway); gating and logging the person's own typed turns (only queued prompts are gated and logged); the log in the store (prompts are not kept across sessions, so neither is their report); the toast; 20 prompts (now 10); the `cmd` fallback that ran a timed-out gate a second time (the shell is now chosen once, from `ComSpec`).
- Fault "acts or writes while off": the earlier version sent prompts, ran the gate and wrote the log while off, and said so. Now every hook but `session.start`, `command.run` and `ui.render` returns `next(e)` first when off, the one timer is cancelled by `sync`, every verb but the switch answers `Queue is off.`, and the only store key is `isOn`.
- Fault "one long test...": one test per acceptance line; A13 and A14 are the off state, A1 the restore, A15 the placements and the narrow card.
## How it runs
Constants: `STEP_MS` 400, `GATE_MS` 600000, `RETRIES` 3, `MAX_PROMPTS` 10, `MAX_LOG` 30. A label is a prompt with each run of whitespace made one space, trimmed, cut to 80 with `…`.
- `sync` (`const sync = async ($) => ...`, the only place a timer starts or stops; `let timer: Timer | undefined` is the only module-level `let`): cancels `timer`; then, when on and work is due, sets `timer = $.clock.after(STEP_MS, () => void step($))`. Work is due when `run?.phase === 'ended'`, or when `run === null`, `halt === ''` and a prompt is waiting. Called at `session.start`, after every switch change, after `add`, `start`, `clear` and `drop`, at the end of `step`, and from the `turn.complete` hook.
- `step`: off: nothing. `run === null`: takes the first waiting prompt, sets `run = { task: label, startedAt: await $.clock.now(), retries: 0, phase: 'sent', turnId: '', ended: '' }`, then `$.prompt.submit({ text: prompt, asUser: true })`. `run.phase === 'ended'`: settles (below). Last, `sync`.
- A submit that rejects, or resolves with a `drop`, closes the run as `stopped`, note `prompt refused: <reason, cut to 60>`, halt `prompt refused`.
- `on('turn.start')`: off: `next(e)`. When `run?.phase === 'sent'`, phase becomes `turn` and `run.turnId = e.turnId`. Returns `next(e)`.
- `on('turn.complete')`: `const ended = await next(e)`, returned unchanged always. Acts only when on, `e.agentId === undefined`, `run?.phase === 'turn'` and `e.turnId === run.turnId`: phase becomes `ended`, `run.ended` is `''` for `e.reason === 'answer'`, `interrupted` when `e.isAborted`, else `e.reason`; then `sync`.
- Settling: `run.ended` not `''`: closed `stopped`; `interrupted` gives note `turn interrupted`, halt `interrupted`; `error` and `refusal` give note `turn ended with <reason>`, halt `turn <reason>`. Otherwise no gate: closed `clean`, note `''`. Otherwise phase becomes `gate` and the gate runs: `$.process.run(argv, { timeoutMs: GATE_MS })`, argv `['cmd', '/c', gate]` when `await $.env.get('ComSpec')` is a non-empty string (a rejection counts as absent), else `['sh', '-c', gate]`. It passes on `exitCode === 0`; a rejection (timeout, no shell) is a failure whose output is `String(error)`. After it resolves the state is read again: off, or `run` no longer this one in phase `gate`, discards the result.
  - Pass: closed `clean`, note `gate passed`, or `gate passed on retry <n>`.
  - Fail with `retries === RETRIES`: closed `failed`, note `gate still failing after 3 retries`, halt `gate failing`.
  - Fail otherwise: `retries + 1`, phase `sent`, and `$.prompt.submit({ text })` without `asUser`: `` `<gate>` is still failing after your last change. Find the cause, fix it, and stop when you believe it passes. Its output: `` then a line break and the last 40 lines of `stdout`, a line break and `stderr`, trimmed, cut to its last 4000 characters, or `(no output)`.
- Closing appends `{ task, outcome, note, retries, ms: now - startedAt }` to `log` (the last `MAX_LOG` kept) and sets `run = null`. A halt stops `step` taking the next prompt until `start`.
- Known limit: a prompt the person types in the instant between the queue's submit and its turn starting is taken for the queued one.
## Card
Inner width is the card width less 4; long wording at 36 or more, short below. Title `Queue`. Note, first that applies: `halted`; `<n> waiting`; `running` (a run, nothing waiting); `all clean` (log not empty, every entry `clean`); none. Rows in order, each one line (`wrap="truncate-end"`), only the empty sentence wraps:
1. Tally, when `log` is not empty: green `<c> clean`, then red ` · <n> not` when `n > 0`; short: `<c> ✓`, ` · <n> ✗`.
2. Finished rows, when there is no run and nothing waiting: the last 3 entries, `<mark> <task>`, mark green `✓` (clean), red `✗` (failed), yellow `■` (stopped).
3. Current: cyan `▶` and `run.task`.
4. Waiting, dim: the first 3 as `<n> <label>`, then `+<k> more`.
5. Gate, when set: dim `until: <gate>`; while `run.retries > 0`, yellow `retry <n>/3: <gate>`.
6. Halt: red `■ <halt>` (every halt is 14 characters or fewer).
```
Empty: on, nothing queued, run or logged. No note.
│ Queue                                │
│ Nothing queued. /queue-widget add    │
│ <prompt> lines up work to run back   │
│ to back; until <command> keeps each  │
│ going until the command passes.      │
Working: one done, one on its second try, two waiting. Note `<n> waiting`.
│ Queue                      2 waiting │
│ 1 clean                              │
│ ▶ fix the flaky date test            │
│ 1 update the changelog               │
│ 2 bump the version                   │
│ retry 1/3: bun test                  │
Best moment: everything ran and passed. Note `all clean`.
│ Queue                      all clean │
│ 3 clean                              │
│ ✓ fix the flaky date test            │
│ ✓ update the changelog               │
│ ✓ bump the version                   │
Error: the gate never passed. Note `halted`.
│ Queue                         halted │
│ 1 clean · 1 not                      │
│ 1 bump the version                   │
│ until: bun test                      │
│ ■ gate failing                       │
Busiest at 20 columns: 2 clean, 1 not, a retry running, 5 waiting.
│ Queue  5 waiting │
│ 2 ✓ · 1 ✗        │
│ ▶ fix the flaky… │
│ 1 update the ch… │
│ 2 bump the vers… │
│ 3 tag the relea… │
│ +2 more          │
│ retry 2/3: bun … │
```
## Commands
One command; `argumentHint` and usage `[on|off|add <prompt>|until <command|off>|start|drop <number>|report|clear]`. The verb is the first word, in any case; the rest keeps its case. Every verb but the switch answers `Queue is off.` while off and changes nothing.
- bare, `on`, `off`: the switch, then `sync`. On: `Queue on; /queue-widget add <prompt> lines one up. /widgets places it.` Off: `Queue off; nothing more is sent.` Switching off with a run closes it `stopped`, note `switched off`, halt `switched off` (the turn itself is not aborted). Unknown input: `Usage: /queue-widget [on|off|add <prompt>|until <command|off>|start|drop <number>|report|clear]`.
- `add <prompt>`: trimmed, cut to 2000, appended. Answers `Queued at <n>.`, and when halted adds ` The queue is halted (<halt>); /queue-widget start resumes.` No text: `Add what? Try /queue-widget add run the tests and fix what fails`. Ten waiting: `The queue is full (10 prompts). /queue-widget drop <number> makes room.`
- `until <command>`: sets the gate (trimmed, cut to 200). Answers `` Gate set: after each queued prompt `<command>` runs; while it fails Claude is sent its output, up to 3 times. `` `until off`: `Gate removed; a prompt is finished when its turn ends.` Nothing after it: `Until what? Try /queue-widget until bun test`.
- `start`: clears the halt. Answers `Queue running: <plural(n, 'prompt')> waiting.`
- `drop <number>`: removes that waiting prompt. Answers `Dropped <n>: <label>`. Missing, not digits or no such prompt: `There is no waiting prompt "<typed, cut to 20>".`
- `report`: first `<c> of <count> finished clean.`, or `Nothing has finished yet.`; one line per entry, `<mark> <task> (<span(ms)>)` or `(<span(ms)>; <note>)`; then, each when it applies, `Running: <task>`, `<plural(n, 'prompt')> waiting.`, `Gate: <gate>`, `Halted: <halt>. /queue-widget start resumes.`
- `clear`: waiting prompts, `log` and `halt` are emptied; a run and the gate stay. Answers `Queue and report cleared.`
## Data
- `on('session.start')`: nothing of `e`. `on('command.run', { command: 'queue-widget' })`: `e.args`.
- `on('turn.start')`: `e.turnId`, once per main-loop turn. `on('turn.complete')`: `e.turnId`, `e.agentId`, `e.isAborted`, `e.reason`, once per turn.
- `$.prompt.submit(PromptSubmitArgs)`: once per queued prompt and once per retry; reads `drop` of the result.
- `$.process.run(argv, { timeoutMs })`: once per ended queued turn while a gate is set; reads `exitCode`, `stdout`, `stderr`. `$.env.get('ComSpec')`: once per gate run.
- `$.clock.after`, `$.clock.now`, `$.store.get`, `$.store.set`, `$.command.register`, `$.widgets.card`, the three `on('ui.render')` hooks, `fit()`, `plural()`, `span()`.
- No `prompt.submit` hook, no `tool.check` hook, no `$.fs`, no `$.ui.toast`, no `$.turn.abort`, no model call.
## State and storage
- `$.state` `isOn: boolean`.
- `$.state` `queue: { tasks: string[]; gate: string; halt: string; run: Run | null; log: Entry[] }`; blank: `[]`, `''`, `''`, `null`, `[]`. `Run = { task: string; startedAt: number; retries: number; phase: 'sent' | 'turn' | 'ended' | 'gate'; turnId: string; ended: string }`. `Entry = { task: string; outcome: 'clean' | 'failed' | 'stopped'; note: string; retries: number; ms: number }`.
- `$.store` `isOn: boolean`, the only key. No files.
## Off
No card. `sync` cancels the timer and starts none. The `turn.start` and `turn.complete` hooks return `next(e)` and touch nothing; `step` and a gate result arriving after the switch do nothing: no prompt is sent, no gate runs, nothing is logged. Verbs answer `Queue is off.` Switching off writes only `isOn`; waiting prompts, the gate and the log stay in `$.state`. Switching on again resumes waiting prompts by itself unless a run was cut short, which leaves the halt `switched off` for `start`.
## Demo
The engine's `$.prompt.submit` enters nothing and its `$.process.run` answers exit 0 for a non-git command, so the page's own scripted turn stands in for the queued prompt's turn; no other stand-in is needed. When the card is switched on the page runs `/queue-widget until npm test`, `/queue-widget add update the changelog` and `/queue-widget add bump the version`. At rest, once `STEP_MS` has passed: note `1 waiting`, `▶ update the changelog`, `1 bump the version`, `until: npm test`. After the scripted turn: `1 clean`, note `running`, `▶ bump the version`, `until: npm test`.
## Live
`bun factory/tools/live.ts factory/floor/plugins/queue-widget --say "/queue-widget on" --say "/queue-widget until git --version" --say "/queue-widget add Reply with the single word one." --say "/queue-widget add Reply with the single word two." --say "/queue-widget report" --hold 30`
A good run shows two assistant turns that no `>>>` line asked for, answering `one` then `two`, in that order. `report` counts what had finished when it was answered; every finished row reads `✓ Reply with the single word ... (<time>; gate passed)` and the `Gate: git --version` line is present. The store prints `isOn` true and no other key.
## Cost
The widget makes no model call of its own. Each queued prompt is an ordinary turn. Each retry is one more turn carrying up to 4000 characters of the gate's output, at most 3 per prompt.
## Acceptance
How the tests prove these: a stand-in plugin's `on('prompt.submit')` records `origin` and `text` of every submission and may answer `{ drop }`; turns are raised with `$.turn.start({ text, turnId })` and `$.turn.complete({ answer, durationMs, isAborted, turnId, reason })`; the timer is run by moving the kit's `clock`; `process.run` and `env.get` are answered through `ground()`'s `answers`, recording each `argv`; writes are read from `writes`.
- A1: on with nothing queued the card shows the `Nothing queued.` sentence with no note; a switch restored at `session.start` gives the same card, sends nothing and writes nothing.
- A2: `add  Fix the   flaky test` answers `Queued at 1.` and keeps the prompt's case; nothing is sent before 400 ms; after it one submission arrives with `origin` `{ kind: 'plugin', name: 'queue-widget', asUser: true }` and the prompt's text, and the card shows `▶ Fix the flaky test` and the note `running`; `add` with no text and an eleventh waiting prompt answer their messages and queue nothing.
- A3: with two prompts and no gate, the second is sent only after the first's turn completes and 400 ms more pass; after both, the note is `all clean`, the tally `2 clean`, two `✓` rows, and `process.run` was never called.
- A4: with `until bun test` and the gate answering exit 0, the ended turn runs `['sh', '-c', 'bun test']` with `timeoutMs` 600000 and the entry's note is `gate passed`; with `ComSpec` answered the argv is `['cmd', '/c', 'bun test']`; `until` alone answers `Until what? ...`, `until off` answers `Gate removed; ...` and the next prompt runs no command.
- A5: a gate that exits 1 with 50 lines of output, then 0: one more submission arrives without `asUser`, naming the gate and carrying the last 40 lines and not the first 10; the card shows `retry 1/3: bun test` in place of `until: bun test`; the entry is `clean` with note `gate passed on retry 1`; empty output is sent as `(no output)`.
- A6: a gate that always fails (one of its runs a rejection) is run 4 times with 3 retry submissions; the entry is `failed`, the card shows the note `halted`, `1 not` and `■ gate failing`, and the waiting prompt is not sent however far the clock moves; `start` answers `Queue running: 1 prompt waiting.` and it is then sent.
- A7: a queued turn ending with `isAborted: true`, with `reason: 'error'` and with `reason: 'refusal'` each log `stopped` with the notes `turn interrupted`, `turn ended with error`, `turn ended with refusal`, halt with `interrupted`, `turn error`, `turn refusal`, and run no gate.
- A8: while a queued turn runs, a `turn.complete` with an `agentId` and one with another `turnId` change nothing; a turn that starts and completes while nothing is in phase `sent` is not logged; in every case `turn.complete` resolved to what `next(e)` returned.
- A9: a submission answered `{ drop: 'blocked by policy' }`, and one whose stand-in throws, each log `stopped` with a note starting `prompt refused:`, show `■ prompt refused`, and send nothing more until `start`.
- A10: `drop 2` of three waiting answers `Dropped 2: <label>` and the card renumbers; `drop`, `drop x`, `drop 0` and `drop 9` answer `There is no waiting prompt "<typed>".` and change nothing.
- A11: `report` with nothing answers `Nothing has finished yet.`; after one clean gated prompt of 65 seconds, one failed, a run in progress and one waiting it answers `1 of 2 finished clean.`, `✓ <task> (1m 05s; gate passed)`, `✗ <task> (...; gate still failing after 3 retries)`, `Running: ...`, `1 prompt waiting.`, `Gate: bun test`, and when halted the `Halted:` line.
- A12: `clear` answers `Queue and report cleared.`, empties the waiting prompts, the log and the halt, keeps the gate and a run in progress, and with no run the card returns to the empty state; an `add` to a halted queue answers `Queued at 1. The queue is halted (gate failing); /queue-widget start resumes.`
- A13: while off and never switched on, `add x`, `until bun test`, `start`, `drop 1`, `report` and `clear` each answer `Queue is off.` and leave the switch off; turns start and complete, the clock moves an hour, and nothing is submitted, no process runs, nothing is written and no card is drawn.
- A14: switching off during a queued turn writes only `isOn`, logs the run `stopped` with note `switched off`, and then that turn's completion and the clock moving send nothing and run no gate; switching off while a gate runs discards its result; on again shows `■ switched off` and sends nothing until `start`; switching off with prompts waiting and no run, then on, sends the first after 400 ms without `start`.
- A15: with 2 clean, 1 failed, a run on retry 2, 5 waiting prompts of 80 characters and a 200-character gate, every row is one line; at 20 and 39 columns the tally is `2 ✓ · 1 ✗`, at 40 and 60 `2 clean · 1 not`; the card is the same in the `side`, `above` and `below` placements and absent from the two the layout's `site` does not name; an unknown verb (`stop` included) answers the usage and changes nothing.
## widget.json
- title: `Queue`
- category: `Session`
- shows: `A queue of prompts that run back to back while you are away, a gate command each must pass before the next starts, and a report of how each one ended`
- commands: `/queue-widget [on|off|add <prompt>|until <command|off>|start|drop <number>|report|clear]`
- cost: `Each queued prompt is a turn, and each failed gate adds a turn carrying up to 4000 characters of its output, at most 3 per prompt`
