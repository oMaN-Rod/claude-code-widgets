# Inspection: WO-0006 Redact (second inspection)

**Verdict: pass.** Both faults of the first inspection are fixed and proven, the card matches the spec's drawings at 20, 40 and 60 columns, and a fresh live run shows real results rewritten before the model reads them. One slow path remains on text no real result is likely to hold; it is recorded as finding 1 and is not grounds for another send-back.

## What was run

- Checker: `PASS  redact-widget meets the standard.`
- Render at rest, `--turns 1`, `--turns 3`, and `--do` with `clear`, `CLEAR`, `show`, `on on`, `off`.
- A probe of a verbatim copy of `scrub`: 28 odd inputs, 27 timing inputs, and three real files from `docs/`.
- One live run through `live.ts` (below).

## The two earlier faults

1. Empty user: `redis://:s3cretpw@localhost:6379/0`, `amqp://:guest1@mq` and `CELERY_BROKER_URL=redis://:Zx9kLmQp@10.0.0.5:6379` now come back with `[redacted password]`, kind `password`. `http://localhost:3000/a@b`, `https://example.com:8443/path@x`, `http://[::1]:8080/a@b`, `git@github.com:owner/repo.git`, `docker://registry:5000/img@sha256:...` and `ftp://:@host` pass unchanged. A5 holds the three samples.
2. Time: 500,000 characters of `a-`, `a.` and `a+` scrub in 36 to 37 ms each (was 63 s). `://`, `a://b:`, `a://:` and `a://u:u:` repeated to 500,000 characters take 25 to 42 ms. A5 scrubs each joined run inside a 1 s limit and still finds a Redis URL at its end.

## Frames

```
│ Redact           │      │ Redact                               │
│ Nothing kept out │      │ Nothing kept out yet. A key, token   │
│ yet. A key or    │      │ or password in command output or a   │
│ password in a    │      │ file read is replaced before Claude  │
│ result is hidden │      │ reads it, and counted here.          │
│ from Claude and  │
│ counted here.    │

│ Redact  watching │      │ Redact                      watching │
│ 12 checked       │      │ 12 results checked, all clean        │
│ all clean        │
```

No line is cut or wrapped out of place; the note fits at 20. `clear` answers `Redact cleared.`, `show` and `on on` answer the usage and change nothing, `off` draws nothing. The scripted turn stops at `watching`; the stand-in `cat .env` call belongs to the demo engine and is the clerk's to add at shipping.

## Live run

`/redact-widget on`; a Bash `printf ... > live.env && cat live.env` holding an invented `REDIS_URL=redis://:Zx9kLmQp@10.0.0.5:6379`; a Read of the file; an Edit of its other line; a Bash `echo 'amqp://:guest1@mq' >&2; exit 3`; `rm`; then `clear` and `off`.

- Bash result reached the model as `REDIS_URL=redis://:[redacted password]@10.0.0.5:6379\nPORT=3000`.
- Read reached it as `1\tREDIS_URL=redis://:[redacted password]@10.0.0.5:6379`, and the Edit that followed ran: a rewritten Read record still counts as a read.
- The errored call reached it as `<tool_use_error>Exit code 3\namqp://:[redacted password]@mq\n\n<note>`: core accepts `{ deny }` after `next`, and the model still reads an error.
- The model named the placeholders and made no other attempt at the values.
- `on`, `clear` and `off` answered as the spec says. No errors. Store after the run: `{ "isOn": false }` only.

## Code and tests

`hooks/register.tsx`: the `tool.call` hook returns `next(e)` at once while off and checks the switch again after the call; `e` is passed on as received; a denied call and a thrown one are left alone; label scrubbing does not add to the counts; no timers, files, `$.fs`, `$.process`, `$.session` or `$.clock`; `clear` and unknown verbs never switch it on; the store holds `isOn` only. The 15 tests feed core-shaped records with invented values and each proves its line.

## Findings (none blocks shipping)

1. **`ASSIGNMENT` is still quadratic on one contrived kind of text.** `hooks/register.tsx` line 39: the lookahead `(?=[^\s"'`()]*\d)` runs to the end of a run at every matching name. It only bites when thousands of upper-case names ending in a suffix, each followed by `=` or `:`, sit in one run with no whitespace, quote, bracket or digit: `PASSWORD=abc&API_KEY=def&` 4,000 times (100,000 characters) takes 4.5 s, `TOKEN=` 80,000 times takes 200 s. Ordinary text does not do this: `docs/widgets.js` (456,338 characters) scrubs in 39 ms, `TOKEN=\nSECRET=\n` 40,000 times in 57 ms, one `TOKEN=` before 500,000 letters in 12 ms. Right, when the widget is next touched: match the value without the lookahead and test for a digit in the replace function, so each run is read once.
2. A file of key headers with no `END` line is slow in the same way but far milder: 20,000 `BEGIN` lines 3.2 s, 2,000 spread through 558,000 characters 0.26 s.
3. A key block with no `END` line (`head -20 id_rsa`, a `Read` with a limit) is not replaced. Follows the spec.
4. The `sk-` and `xox?-` shapes take any hyphenated word of the length; `SECRET_KEY=...` (Django), `password=...` in lower case and `Authorization: Bearer <opaque>` pass. Follows the spec, and the spec's purpose says it is a net for known shapes.
5. A scheme of 32 or more letters and digits is not matched by the URL rule. No real scheme is that long.
6. A password holding `@` is replaced up to the first `@` only.
