# Redact (`redact-widget`)
## Purpose
For anyone who lets Claude run commands and read files in a project that holds credentials. While on, Redact reads the result of every `Bash`, `PowerShell`, `Read` and `Grep` call before Claude does, replaces each API key, token, private key and password it recognises with a `[redacted <kind>]` placeholder, tells Claude that it did, and counts what it kept out on its card. The real values stay on disk untouched. It is a net for known shapes, not a guarantee: a secret of an unknown shape, a password made of letters only, and anything inside a PDF, a notebook, an image or another tool's result pass as they are, and the card says when a read could not be checked.
## What is dropped from the earlier version
The loose assignment rule, which matched any name containing `token`, `secret` or `password` in any letter case and so rewrote ordinary source code (`tokenizer = AutoTokenizer.from_pretrained(...)`, `const API_KEY = process.env.API_KEY`); the answer `{ result, isError: true, text }` for a failed call, which builds a Bash record for any tool; work done before the switch is checked.
## Finding (pure function `scrub(text)`, answers `{ text, kinds }`)
Three passes in this order, each over the output of the one before. Every match is replaced by `[redacted <kind>]` and adds 1 to `kinds[<kind>]`.
1. **Shapes**, in this order: `private key` `-----BEGIN [A-Z ]*PRIVATE KEY-----` through the matching `-----END ... PRIVATE KEY-----`, lines between included; `AWS key` `AKIA` and 16 of `[0-9A-Z]`; `GitHub token` `gh[pousr]_` and 36 or more of `[A-Za-z0-9]`, or `github_pat_` and 22 or more of `[A-Za-z0-9_]`; `API key` `sk-` (with or without `ant-`) and 20 or more of `[A-Za-z0-9_-]`; `Slack token` `xox[abprs]-` and 10 or more of `[A-Za-z0-9-]`; `Stripe key` `sk_live_` or `rk_live_` and 16 or more of `[A-Za-z0-9]`; `Google key` `AIza` and 35 of `[0-9A-Za-z_-]`; `JWT` three runs of 10 or more of `[A-Za-z0-9_-]` joined by dots, the first starting `eyJ`. Each is bounded by `\b`.
2. **URL password**, kind `password`: in `scheme://user:secret@`, the `secret` (3 or more characters, none of whitespace, `@`, `/`) is replaced; scheme, user and host stay.
3. **Assignment**, kind `secret value`: a name of `[A-Z0-9_]` only, case-sensitive, that ends in `SECRET`, `TOKEN`, `PASSWORD`, `PASSWD`, `API_KEY`, `APIKEY`, `ACCESS_KEY` or `PRIVATE_KEY`; an optional closing quote; `=` or `:` with optional spaces; an optional opening quote; then a value of 8 or more characters, none of whitespace, quotes, `(` or `)`, that holds at least one digit and does not start with `$`, `<`, `{` or `[`. Only the value is replaced; the name, the separator and the quotes stay.
A value already replaced starts with `[`, so `API_KEY=sk-...` counts once, as `API key`, and scrubbing scrubbed text finds nothing.
## Rewriting (`tool.call` hook)
- Off: `return next(e)` at once. `e.tool` other than `Bash`, `PowerShell`, `Read`, `Grep`: `return next(e)`. Calls inside a subagent (`e.agentId` set) are treated the same as the main thread's.
- Otherwise `const ran = await next(e)`, with `e` passed as received. `ran.deny !== undefined`: return `ran`, nothing counted. A throw from `next(e)` is not caught.
- **Errored** (`ran.isError === true`): `checked` grows by 1; scrub `ran.text ?? ''`. Nothing found: return `ran`. Found: return `{ deny: <scrubbed text> + '\n\n' + <note> }`, so the model still reads an error and never the value.
- **Answered**, fields scrubbed when they are strings: `Bash` and `PowerShell` `result.stdout` and `result.stderr` (skipped when `result.isImage` is `true`); `Read` `result.file.content` when `result.type` is `text`; `Grep` `result.content`. `checked` grows by 1.
- `Read` with `result.type` `notebook`, `pdf` or `parts`: `unchecked` grows by 1 (not `checked`), return `ran`. `Read` with `type` `image`: return `ran`, nothing counted.
- Nothing found: return `ran` itself, the same object, so core uses its own messages. Found: return `{ result, context }` and no other key (no `ref`, `text` or `isReadOnly`): `result` is a copy of `ran.result` with only the scrubbed strings changed, every other field as it was; `context` is `[...(ran.context ?? []), <note>]`.
- **Note**: `redact-widget replaced 2 secret values in this result with [redacted ...] placeholders before you read it. The real values are unchanged on disk. Never write a placeholder into a file or a command, and do not try to read the values another way.` (`plural(n, 'secret value')`.)
- Found: `total` grows by the number replaced, `kinds` by each kind, and `last` becomes the label of the call: for `Read` the last segment of `e.file_path`; for `Bash` and `PowerShell` `e.command`; for `Grep` `Grep ` and `e.pattern`. The label goes through `scrub` itself, then every run of whitespace becomes one space, trimmed, cut to 80 characters.
- To prove in the live run, not in tests: core accepts the `{ deny }` after `next` as the errored call's result; a `Read` answered with a rewritten record still lets a later `Edit` of that file run.
## Card
Inner width is the card width less 4. Long wording at an inner width of 36 or more, short below; no long line passes 36 characters and no short line 16, except the `last` line, which truncates (`wrap="truncate-end"`). The empty sentence wraps. Title `Redact`. A count over 999 reads `999+` everywhere on the card. A kind row is the kind at the left and `×<count>` at the right; when they do not both fit the kind truncates and the count stays whole. Kinds are ordered by count, largest first, ties in the order first seen; at most 3 rows, then the `more` line.
```
Empty: nothing checked yet. No note.
│ Redact                               │
│ Nothing kept out yet. A key, token   │
│ or password in command output or a   │
│ file read is replaced before Claude  │
│ reads it, and counted here.          │
Working: `checked` over 0, `total` 0. Note `watching`.
│ Redact                      watching │
│ 12 results checked, all clean        │
Best moment: `total` over 0. Note `<total> kept out`.
│ Redact                    5 kept out │
│ GitHub token                      ×2 │
│ AWS key                           ×1 │
│ secret value                      ×1 │
│ and 1 more                           │
│ Last in: .env                        │
│ 14 results checked                   │
Error: a read that could not be checked. Note `unchecked` while `total` is 0.
│ Redact                     unchecked │
│ 12 results checked, all clean        │
│ 2 reads unchecked: PDF, notebook     │
Busiest at 20 columns: the best moment with unchecked reads.
│ Redact     5 out │
│ GitHub token  ×2 │
│ AWS key       ×1 │
│ secret value  ×1 │
│ +1 more          │
│ in: .env         │
│ 14 checked       │
│ 2 unchecked      │
```
Long and short wording (`long` | `short`):
- Note: `5 kept out` | `5 out`; `watching`; `unchecked` (only when `total` is 0 and `unchecked` is over 0).
- `12 results checked, all clean` | `12 checked`, `all clean` (two lines); with `total` over 0 `14 results checked` | `14 checked`. `plural(n, 'result')` in the long form.
- `and 1 more` | `+1 more` (dim); `Last in: <last>` | `in: <last>` (dim).
- `2 reads unchecked: PDF, notebook` | `2 unchecked` (yellow; `plural(n, 'read')`), the last line of any state once `unchecked` is over 0; when nothing else was checked it stands alone under the note `unchecked`.
## Commands
- `/redact-widget`, `on`, `off`: the switch, with the template's answers. Unknown: `Usage: /redact-widget [on|off|clear]`, nothing changed. `argumentHint` `[on|off|clear]`.
- `clear`: sets `tally` to blank and answers `Redact cleared.`; the card returns to empty. Off: `Redact is off.`, nothing changed, nothing written.
- No second command, no tool, no verb that shows a value: a kept-out value is never held anywhere.
## Data
- `on('tool.call')`: reads `e.tool`, `e.file_path`, `e.command`, `e.pattern`, and from `next(e)` (`ToolCallResult`) `deny`, `isError`, `text`, `context`, `result` (`stdout`, `stderr`, `isImage`, `type`, `file.content`, `content`). Once per call of the four tools. Never rewrites `e`.
- `on('session.start')`, `on('command.run', { command: 'redact-widget' })`, the three `on('ui.render')` hooks, `$.command.register`, `$.store.get`, `$.store.set`, `$.widgets.card`: from the template.
- No `$.fs`, no `$.process`, no `$.session` call, no `$.clock`, no toast.
## State and storage
- `$.state` `isOn: boolean`.
- `$.state` `tally: { checked: number; unchecked: number; total: number; kinds: Record<string, number>; last: string }`. Blank: zeros, `{}`, `''`. `kinds` keeps insertion order (first seen). It holds counts and a scrubbed label, never a value.
- `$.store` `isOn`. No files, no timers (no `sync`). The tally is this session's and is not kept across sessions.
## Off
The `tool.call` hook returns `next(e)` at once and reads nothing: results reach Claude as they are, no context is added, nothing is denied. No card. `clear` answers `Redact is off.` Switching off sets `tally` to blank, so switching on again starts from the empty card.
## Demo
The engine's scripted turn holds no secret, so without a stand-in the card only reaches `watching`. Stand-in needed: one more scripted call, `Bash` `cat .env`, whose text is two lines of made-up values, `STRIPE_SECRET=sk_live_` and 24 characters, and `DATABASE_URL=postgres://app:` and a made-up password `@db/app`; the values must be invented and match no real key. The engine already answers `Bash` with `{ stdout, stderr, interrupted }` and `Read` with a `text` record; its errored `Bash` carries `text`, which is all the hook reads. At rest: the empty card. After the scripted turn: the best moment, `2 kept out`, rows `Stripe key ×1` and `password ×1`, `Last in: cat .env`, and the count of results checked. The widget must not ship with a demo that stops at `watching`.
## Cost
None: no model call. One short note is added to a result only when something was replaced in it.
## Acceptance
How the tests prove these: the kit has no bottom `tool.call`, so each test lists a stand-in plugin after the widget (beneath it) that answers as core does, `{ ref, result, text }`, with `isError` or `deny` where the case needs it; "the same object" means the hook's answer still carries the stand-in's `ref`. `tally` is proven through the card. Every sample secret in the tests is invented.
- A1: switched on by the command, and restored from a store holding `isOn` `true` at `session.start`, the card says `Nothing kept out yet.` and what will appear, with no note; calls of `Edit` and `WebFetch` whose results hold a GitHub token return the same object and leave the card empty.
- A2: a clean `Bash` result returns the same object and gives the note `watching` and `1 result checked, all clean`; a clean `Read` after it reads `2 results checked, all clean`; a call the stand-in denies returns that `{ deny }` and counts nothing.
- A3: a `Bash` result with a GitHub token in `stdout` and an AWS key in `stderr` comes back with both replaced by `[redacted GitHub token]` and `[redacted AWS key]`, neither value anywhere in the answer, `interrupted` and `returnCodeInterpretation` as they were, no `ref` and no `text`, and a `context` of the stand-in's own entry followed by the note saying `2 secret values`; the same for `PowerShell`, and for a `Bash` call carrying `agentId`; a result with `isImage` `true` returns the same object.
- A4: a `Read` of `.env` whose `content` holds an assignment, a URL password and a private key block comes back with all three replaced and `type`, `filePath`, `numLines`, `startLine` and `totalLines` unchanged; a `Grep` result has its `content` scrubbed and `filenames` and `numFiles` unchanged, and a `Grep` with no `content` returns the same object; one value replaced gives a note saying `1 secret value`.
- A5: `scrub` replaces one sample of each of the ten kinds with its own placeholder and counts it under that kind; `API_KEY=sk-` and 24 characters counts once, as `API key`, with the name and `=` kept; `"DB_PASSWORD": "hunter2hunter"` keeps its name and quotes; `postgres://app:s3cretpw@db/app` keeps `postgres://app:` and `@db/app`; scrubbing an already scrubbed text returns it unchanged with no kinds.
- A6: each of `const API_KEY = process.env.API_KEY`, `MAX_TOKENS=100000000`, `tokenizer = AutoTokenizer.from_pretrained("gpt2")`, `PASSWORD=${DB_PASSWORD}`, `API_KEY=<your-key-here>`, `password: string`, `api_token = load_token_1234()` and `http://localhost:3000/a@b` passes `scrub` unchanged, and a `Read` whose content is all of them returns the same object.
- A7: an errored `Bash` call (`isError` `true`) whose `text` holds a Slack token answers `{ deny }` and nothing else: the text with the placeholder, a blank line, the note; the value is nowhere in it and the card counts it under `Slack token`; an errored call with a clean `text`, and one with no `text`, return the same object and count as checked.
- A8: a `Read` answering `type` `notebook` and one answering `pdf` return the same object and give the note `unchecked` with `2 reads unchecked: PDF, notebook` as the only line; after a clean `Bash` the card reads `1 result checked, all clean` above that line; after a secret is found the note is `1 kept out` and the line is still last; a `Read` answering `image` changes nothing on the card.
- A9: after results holding two GitHub tokens, one AWS key, one secret value and one JWT the note is `5 kept out`, the rows are `GitHub token ×2`, `AWS key ×1`, `secret value ×1` in that order, then `and 1 more`, `Last in: <label>` and `<n> results checked`; `last` after a `Read` of `/work/project/.env` and of `C:\work\project\.env` is `.env`, after a `Grep` is `Grep ` and its pattern.
- A10: a `Bash` command of several lines that itself holds an API key gives a `last` on one line with single spaces and the placeholder in place of the key; a 300-character command is cut to 80 and drawn on one truncated row; the `e` the stand-in receives is the `e` the hook was given, command and all.
- A11: `clear` after secrets were found answers `Redact cleared.` and the card is the empty one; switching off and on again does the same; while off, `clear` answers `Redact is off.`, leaves the switch off and writes nothing to the store.
- A12: while off, a `Bash` result holding an AWS key, an errored one holding it, and a `Read` holding it each return exactly what the stand-in answered, with its `ref` and no added `context`; nothing is drawn or stored; after switching on the card is empty.
- A13: an unknown verb (`show` included) answers `Usage: /redact-widget [on|off|clear]` and changes neither the switch nor the tally; `session.start` registers one command, `redact-widget`.
- A14: with 1,234 results checked, 1,500 kept out across five kinds and 1,200 reads unchecked, every state (empty, watching, best moment with a `more` line, unchecked alone, unchecked under a clean count) at 20 and at 39 columns uses the short wording with no line but `last` over 16 characters, and at 40 and 60 columns the long wording with no such line over 36; every count over 999 reads `999+`, and each kind row ends in its whole count.
- A15: after a secret is found the card is the same in the `side`, `above` and `below` placements and absent from the two placements the layout's `site` does not name; with the switch restored from the store and no command run, a `Bash` result holding a GitHub token is scrubbed.
## widget.json
- title: `Redact`
- category: `Session`
- shows: `Replaces API keys, tokens, private keys and passwords in command output and file reads before Claude sees them`
- commands: `/redact-widget [on|off|clear]`
- cost: empty
