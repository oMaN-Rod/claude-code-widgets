# Tap (`tap-widget`)
## Purpose
For anyone who has MCP servers connected (an issue tracker, an error log, a calendar) and today pays a model turn to look at them. They name one read tool of one server; the widget calls it itself every ten minutes over the engine's own connection, with no model, and keeps one reading per tap on the card: open pull requests, today's errors, the next meeting. A toast says when a reading changed while Claude was busy with something else. Cut from the idea: the second command `/tap` (every verb is on `/tap-widget`); `every <n>m` (one fixed interval); `pick <dot.path>`; labels; server names with spaces (the underscore spelling the types accept is the only one taken, so nothing needs quoting); a shared file between sessions.
## Terms
- A tap: `{ server, tool, args }`. `server` and `tool` are single words exactly as `list` prints them; `args` is a JSON object, `{}` when none. Its key is `server + ' ' + tool + ' ' + JSON.stringify(args)`. Taps are numbered from 1 by position; at most 4.
- Cleaning: every character with a code under 32, or from 127 to 159, becomes a space (in `raw`, `\n` is kept); runs of spaces become one; trimmed. All text from a server or an error is cleaned before it is stored, answered, toasted or drawn, and is drawn as plain `Text`.
- The value of a result: `structuredContent` when it is not `undefined`; else the `text` of the first block whose `type` is `text`, parsed as JSON when it parses, else that text; else none.
- The reading of a value, a fixed rule, cleaned and cut to 120 characters:
  - none: `a <type> block` for the first block, or `nothing came back` with no block.
  - a string: its first non-empty line. A number or boolean: itself. `null`: `nothing`.
  - an array: `plural(n, 'item')`, then `: <label>` when the first item has a label. A label is the item itself when it is a string or number; for an object, the first of its `title`, `name`, `summary`, `subject`, `message`, `text` that is a non-empty string, else its first non-empty string field, else no label.
  - an object: with an array field, `<n> <key>` for the first one, then `: <label>` as above (`3 events: Standup`); else its first two fields whose value is a number, a boolean or a string of at most 40 characters, as `<key> <value>` joined by `, `; else `plural(n, 'field')`.
- A fault, in words, never a value: a result with `isError` true is `server error: <first non-empty text line>` (or `server error`); a rejected call is `call failed: <first line of the error's message>`. Each is cut to 100 characters. The engine's own words say whether the server is not connected or wants a sign-in; the widget does not guess.
- A call of a tap: sets its `askedAt` to now, then `await $.mcp.call(server, tool, args)`. When it settles, if the widget is off or no tap has that key any more, the answer is thrown away. A good result stores `reading`, `raw` (the value as text, `JSON.stringify(value, null, 1)` unless it is a string, cleaned, first 2000 characters), `readAt`, `fault: ''`, `fails: 0`, and `isChanged`: true when a reading was held before in this session and differs from the new one. A fault stores `fault` and adds 1 to `fails`; `reading` is kept only to compare the next good one against, and is not drawn.
- Due: a tap is due when `now - askedAt >= 600_000 * min(8, 2 ** fails)` or it was never asked in this session. So a failing tap is asked after 20, 40, then every 80 minutes.
- The tick: every 60 s while on. It stores `now`, then calls each due tap in order, one after the other; a timed call whose `isChanged` is true toasts `Tap <n> changed: <reading cut to 60>`. Because `askedAt` is set before the call, a slow server is never asked twice at once.
- Looks read-only: the tool name is split into words at `_`, `-`, `.` and at a lower-to-upper case step, lower-cased. It looks read-only when a word is one of `get list search read find fetch query show count check status describe view lookup` and none is one of `create send delete update post write add remove set put patch edit move merge close cancel reply run execute publish archive draft upload insert drop comment approve`.
## Card
Inner width is the card width less 4. Title `Tap`. Note: none with no taps; else `plural(n, 'tap')` at inner width 36 or more and `n` under it. Each tap is two rows, both `wrap="truncate-end"`: the dim number, a space, the tool name cut with `…` to leave room for the age at the right edge, dim (`span(now - readAt)` after a good call, `span(now - askedAt)` after a fault, `…` while never answered); then the reading, cut to the inner width with `…`, led by two spaces, or by `* ` in yellow when `isChanged`. A fault is drawn in place of the reading, in yellow. A tap not yet answered in this session shows `  not read yet`, dim. Sentences are wrapped by words to the inner width.
```
Empty: on, no taps. Dim.
│ Tap                                  │
│ Name a server and a tool:            │
│ /tap-widget add <server> <tool>      │
│ /tap-widget list shows them.         │
Working: restored at session start, before the first tick.
│ Tap                           2 taps │
│ 1 list_pull_requests               … │
│   not read yet                       │
│ 2 list_errors                      … │
│   not read yet                       │
Best moment: three taps, the second changed.
│ Tap                           3 taps │
│ 1 list_pull_requests          4m 12s │
│   3 items: Fix the login redirect    │
│ 2 list_errors                    12s │
│ * 3 issues: TypeError in checkout.js │
│ 3 list_events                 9m 40s │
│   2 events: Standup                  │
Error: the first tap fails; no old value is shown.
│ Tap                           2 taps │
│ 1 list_pull_requests          1m 05s │
│   call failed: server github is not… │
│ 2 list_errors                 6m 30s │
│   2 issues: TypeError in checkout.js │
Busiest at 20 columns: four taps, one changed, one failing.
│ Tap            4 │
│ 1 list_p… 4m 12s │
│   3 items: Fix … │
│ 2 list_erro… 12s │
│ * 3 issues: Typ… │
│ 3 list_e… 9m 40s │
│   2 events: Sta… │
│ 4 get_bu… 1m 05s │
│   server error:… │
```
The age keeps one space from the name and is never cut; the name gives way.
## Commands
One command, `argumentHint` `[on|off|list [word]|add <server> <tool> [json] [anyway]|run <n>|show <n>|drop <n>|clear]`. The verb is the first word, lower-cased; everything after it keeps its case. No second command and no tool.
- `/tap-widget`, `on`, `off`: the switch, with the template's answers (`Tap on; /widgets places it.`, `Tap off.`). An unknown verb, `add` with fewer than two words, `run`, `show` or `drop` without a whole number, or words after `clear`: `Usage: /tap-widget [on|off|list [word]|add <server> <tool> [json] [anyway]|run <n>|show <n>|drop <n>|clear]`, nothing changed.
- `list [word]`: what can be tapped. Reads `$.tool.list()` once and calls no tool. Of the entries with `mcp` true and a name `mcp__<server>__<tool>` (split at the first `__` after the prefix), those whose name contains `word` without regard to case, one row each, `<server> <tool>`, cleaned; the first 30, then `and <n> more: /tap-widget list <word>`. None: `No MCP tools in this session.`, or `No MCP tool matches <word>.`
- `add <server> <tool> [json] [anyway]`: checked in this order, each refusal calling nothing and saving nothing. A last word `anyway` is taken off first. The rest after the tool, when not empty, must parse as a JSON object: else `The arguments are not a JSON object: <the parser's message>` (no message for an array, number or string). Same key held: `Already tap <n>.` Four held: `Tap holds 4: drop one first.` Not read-only by its looks and no `anyway`: `<tool> does not look read-only. Tap would call it every 10m without asking. To add it all the same, end the line with: anyway`. Then one call, at once. A fault: `Not added: <fault>`, nothing saved. Good: the tap is saved and answered `Tap <n>: <reading>. It will be called every 10m without asking; /tap-widget drop <n> stops it.`
- `run <n>`: calls tap `n` now, whatever is due; answers `Tap <n>: <reading>`, with ` (changed)` after it when `isChanged`, or `Tap <n>: <fault>`. No toast. `show <n>`: answers `raw`, or `Tap <n> has no reading yet.` `drop <n>`: removes the tap and what was read for it, `Dropped <n>.` Each answers `No tap <n>.` for a number not held.
- `clear`: removes every tap and reading, from the state and the store; `Tap cleared.`
- While off, `list`, `add`, `run`, `show`, `drop` and `clear` answer `Tap is off.` and do nothing else.
## Data
Verified in this build's types (`plugin-authoring/types/claude-code.d.ts`; `plugins/*/.claude-plugin/types/` is absent from this checkout).
- `$.mcp.call: (server: string, tool: string, args?: Record<string, unknown>) => Promise<McpToolResult>`; `McpToolResult = { content: McpContentBlock[]; isError: boolean; structuredContent?: unknown }`; `McpContentBlock = { type: string; text?: string; ... }`. "No permission prompt: the plugin's call ... is the grant", and the server name's "tool-name spelling `claude_ai_Gmail` is accepted too". Called once per `add` and `run`, and once per due tap per tick: at most 4 calls in ten minutes at rest. Only a tool the person typed in `add` is ever called.
- `$.tool.list: () => Promise<ToolInfo[]>`, `ToolInfo = { name: string; description: string; mcp: boolean }`: once per `list`, nowhere else.
- `$.clock.every(60_000, fn)` (`TimerCall = (ms: number, fn: () => void) => Timer`, stopped with `cancel()`) and `$.clock.now()`; `$.ui.toast(text)`.
- `on('session.start')`: `$.command.register`, `$.store.get('isOn')`, `$.store.get('taps')`, then `sync`. `on('command.run', { command: 'tap-widget' })` reads `e.args`. The three `on('ui.render')` hooks and `$.widgets.card` from the template. No other hook, no file, no model call.
## State and storage
- `$.state` `isOn: boolean`; `taps: { server: string; tool: string; args: Record<string, unknown> }[]`; `reads: Record<string, { askedAt: number; readAt: number; reading: string; raw: string; fault: string; fails: number; isChanged: boolean }>` keyed by a tap's key; `now: number`.
- `$.store` `isOn`, and `taps` in the same shape, written by `add`, `drop` and `clear` only, read at `session.start`. Readings are never stored: they last for the session. No file.
- The timer handle is the only module-level `let`; `sync` starts it when on and none runs, and cancels it when off.
## Off
No card, no timer, no call to any server, no toast, no store write but `isOn`. Switching off cancels the timer and empties `reads`, so switching on again shows `not read yet` and never an old value; the saved taps stay. A call still in flight at the switch is thrown away when it settles.
## Demo
Opening lines `add github list_pull_requests` and `add sentry list_issues`. Stand-ins the engine lacks: `mcp.call`, answering `{ content: [{ type: 'text', text: '[{"title":"Fix the login redirect"},{"title":"Bump bun"},{"title":"Add dark mode"}]' }], isError: false }` for `list_pull_requests`, and for `list_issues` `{ content: [], isError: false, structuredContent: { issues: [...] } }` with two issues titled `TypeError in checkout.js` and `Timeout in /api/cart` on its first call and a third in front, `Null user in session.js`, on every later one; `tool.list` may stay `[]`. At rest: two taps, `3 items: Fix the login redirect` and `2 issues: TypeError in checkout.js`. Tap does not listen to the turn, so after the scripted turn the card is the same until its own tick, a minute after loading, stores the new age; the change to `* 3 issues: Null user in session.js` and its toast come with the tick ten minutes in, which a visitor rarely sees. That is honest: the card moves on the clock, not on the turn.
## Live
`bun factory/tools/live.ts factory/floor/plugins/tap-widget --say "/tap-widget on" --say "/tap-widget list" --say "/tap-widget add nosuch list_things" --say "/tap-widget add nosuch send_mail" --say "/tap-widget off"`
No prompt is sent, so no model turn runs and nothing is spent. A good run shows `Tap on; /widgets places it.`; the session's real MCP tools as `<server> <tool>` rows, or `No MCP tools in this session.` (the factory config lists no server of its own, and whether the account's claude.ai connectors appear there is what this run finds out); `Not added: call failed: ...` carrying the engine's real words for a server that is not connected, which proves `$.mcp.call` is reached from a command and how it rejects; the read-only refusal for `send_mail` with no call made; `Tap off.`; and the store printing `isOn` false and no `taps`. A call that succeeds cannot be proven by this run unless `list` shows a server. If it does, it is the person's own account: the builder does not tap it; the person makes that one hand check (`add` a list tool, see the reading, `drop 1`). The tick, the toast and the backoff are proven by the tests' clock.
## Cost
No model call and nothing added to the context. One MCP request per tap every ten minutes, against that server's own quota, made without asking and by every open session that has the widget on; a failing tap is asked less often.
## Acceptance
How the tests prove these: `mcp.call` and `tool.list` are given through `ground()`'s `answers`, each recording its calls; the clock is `ground()`'s, moved by hand to fire the tick; toasts are read from the recorded `ui.toast` calls.
- A1: on with no taps, the card shows the three-row sentence and no note; `session.start` with the switch and two taps restored draws both with `not read yet` and `…`, note `2 taps`, and makes no `mcp.call` until the first tick, which calls each once, in order.
- A2: `add github list_pull_requests` calls `mcp.call` once with `('github', 'list_pull_requests', {})`, saves the tap to the store, answers `Tap 1: 3 items: Fix the login redirect. It will be called every 10m without asking; /tap-widget drop 1 stops it.` and draws the reading; `add cal list_events {"calendarId":"primary","max":2}` passes that object as the arguments.
- A3: the reading rule, one result each: `structuredContent` wins over a text block; a text block of JSON is parsed; an array of objects (`title` preferred over an earlier `id`), of strings, and an empty one (`0 items`); an object with an array field (`3 events: Standup`), with scalar fields only (two, `key value, key value`, a 60-character string skipped), with neither (`2 fields`); plain text of several lines (its first non-empty one); a number; an image block alone (`a image block`); no block (`nothing came back`); a 500-character line is held as 120.
- A4: a result whose text carries `\u001b[31m`, a `\u0007`, a tab and a `\u009b` is stored, answered, drawn and shown by `show` with none of those characters; `show 1` answers the whole value as indented JSON with its line breaks, cut to 2000 characters for a longer one, and `Tap 1 has no reading yet.` before the first answer.
- A5: a tap is called again by the tick only once 10 minutes have passed since it was asked: ticks at 1 to 9 minutes make no call, the tick at 10 makes one; with the same reading no toast is made and no `*` drawn; with a new reading the row leads with `* `, one toast `Tap 1 changed: <reading>` is made, and the next call with that same reading removes the `*` and toasts nothing.
- A6: a payload that differs only in a field the reading does not show (a timestamp) is not a change; the first reading after `session.start` or after switching on is not a change.
- A7: a tick's `mcp.call` that rejects with `server github is not connected` draws `call failed: server github is not connected` in place of the earlier reading, which appears nowhere on the card; a result with `isError` true and text `rate limited` draws `server error: rate limited`, and with no text `server error`; the age then counts from when it was asked.
- A8: after one fault the tap is next called 20 minutes after it was asked, after two 40, after three and four 80; a good answer returns it to 10 and, when the reading equals the one held before the faults, makes no toast.
- A9: while a tap's call is unsettled across three ticks, and across a `run` of another tap, it is not called again; two due taps are called one after the other, the second only after the first settles; a call that settles after `drop`, after `clear` or after switching off stores nothing and toasts nothing.
- A10: `add` refusals, each with no `mcp.call` and no store write: `{"a":` and `[1]` and `5` (the JSON sentence), the same server, tool and arguments twice (`Already tap 1.`), a fifth tap (`Tap holds 4: drop one first.`); an `add` whose call rejects or answers `isError` answers `Not added: <fault>` and holds no tap.
- A11: `add mail send_message`, `createDraft`, `events` and `get_and_delete` are refused with the read-only sentence and no call; each with a last word `anyway` (after JSON arguments too) is called and saved; `list_updates_feed` (whose word `updates` is not `update`), `searchIssues` and `get-status` are added without `anyway`.
- A12: `list` answers one `<server> <tool>` row per entry with `mcp` true, split at the first `__` after `mcp__` (`mcp__claude_ai_Gmail__search_threads` gives `claude_ai_Gmail search_threads`), leaves out built-in tools, and calls `tool.list` once and `mcp.call` never; `list GMAIL` filters without regard to case; 45 tools give 30 rows and `and 15 more: /tap-widget list <word>`; none give `No MCP tools in this session.`, no match `No MCP tool matches zzz.`
- A13: `run 2` calls tap 2 at once though not due and answers `Tap 2: <reading>`, with ` (changed)` and the `*` but no toast when it differs, or `Tap 2: <fault>`; `drop 1` of three answers `Dropped 1.`, renumbers the rest, rewrites the store and keeps their readings; `run 9`, `show 9`, `drop 0` answer `No tap <n>.`; `clear` answers `Tap cleared.`, leaves the empty card and a store with no tap.
- A14: while off, `list`, `add a b`, `run 1`, `show 1`, `drop 1` and `clear` answer `Tap is off.` with no `mcp.call`, no `tool.list` and no store write; with two taps saved and the switch off, an hour of clock makes no call; switching off cancels the timer and switching on again shows `not read yet` for both; `add`, `add github`, `run`, `drop x`, `clear all` and `peek 1` answer the usage line and change nothing; `session.start` registers one command.
- A15: at 20, 40 and 60 columns with four taps (a 60-character tool name, a 120-character reading, one changed, one failing): no row is longer than the inner width, every tap is exactly two rows, each age is whole at the right edge, and the note is `4` at 20 columns and `4 taps` at 40 and 60; the card is the same in the `side`, `above` and `below` placements.
## widget.json
- title: `Tap`
- category: `Session`
- shows: `One line per tool of your connected MCP servers, called by the widget on a clock with no model: pull requests, errors, the next meeting`
- commands: `/tap-widget [on|off|list [word]|add <server> <tool> [json] [anyway]|run <n>|show <n>|drop <n>|clear]`
- cost: `Calls the MCP tools you name every 10 minutes without asking, in every open session; no model tokens`
