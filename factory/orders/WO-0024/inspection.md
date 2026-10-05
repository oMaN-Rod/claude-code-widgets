# Inspection: WO-0024 Outage (`outage-widget`)

Verdict: **pass**.

## What was run

- `bun factory/tools/check.ts factory/floor/plugins/outage-widget --spec factory/floor/orders/WO-0024/spec.md`: PASS (validator, 15 acceptance tests plus the standard five, renders at rest and after a turn).
- `render.ts` at rest, `--turns 1`, `--turns 3`, and with `check`, `clear`, `CHECK`, `what`, `check now`, and `off` followed by `check` and `clear`.
- `hooks/register.tsx` and `tests/widget.test.tsx` read in full against the spec, the standard and the 2.1.289 types file.
- Live: the director's run in `live.txt`, read; no second run made.

## Frames

At rest, 40 and 60 columns (matches the spec's empty drawing word for word):

```
│ Outage                               │
│ No network failure yet. When a push  │
│ or install fails on the network, the │
│ provider's status page is checked    │
│ and its answer shows here.           │
```

At 20 columns the short sentence wraps in seven rows inside the border. After one and three demo turns the card rests unchanged, as the spec's Demo section says it must today (the demo engine's failed `npm test` is no network failure).

The populated states cannot be reached through `render.ts` (the demo engine has no failing push yet), so they were judged from the tests, which assert the exact rows: at 40 `GitHub: Incident with Git Operations` / `major, open 12m 04s, Git Operations` with note `1 incident`; at 20 `GitHub: Inciden…` / `open 12m 04s` / `npm: unread` / `PyPI: quiet` / `crates: other` with note `1 open`. These are the spec's drawings. A13 also measures every row against the inner width at 20, 34, 40 and 60.

Commands: `check` with nothing held answers `Nothing to check yet: no network command has failed.`; `clear` answers `Outage cleared.`; `CHECK` is accepted; `what` and `check now` answer the usage and change nothing; while off, `check` and `clear` answer `Outage is off.` and no card is drawn.

## Live run

`/outage-widget on` answered `Outage on; /widgets places it.` The curl to `github.com:81` failed with `Exit code 28\ncurl: (28) Connection timed out after 3009 milliseconds`, and the result reached the model unchanged. `check` answered `GitHub reports no incident.`, which proves three things about real events: the hook saw `isError` with a string `text`, `e.command` named GitHub by host (the error text holds no host), and `$.http.fetch` reaches `www.githubstatus.com` and the real body parses. `off` answered `Outage off.` and the store holds `isOn: false` alone. No error lines.

## Code reading

- Off is inert: `tool.call` reads the switch first and returns `next(e)`; the switch is re-read after `next` and after the fetch with `update` (the machinist's engine finding), so a check in flight writes nothing. Verbs answer `Outage is off.` and never switch on. Switching off empties `reports`; `sync` cancels the timer; `timer` is the only module-level `let`.
- Nothing is stored but `isOn`; no file, no model call, no prompt text.
- The provider's words are cleaned of control characters and quotes and cut to 80; a remote URL yields the host alone (the test uses a token in the URL and a port); future or unparseable dates give `0s`, never `NaN`.
- Spec notes 1 to 12 are each settled and tested: install-like words (so `npm test` with a test timeout fetches nothing), stranger and long-name fallbacks, the truthful `elsewhere` toast, one `deny` for two providers, no toast after `check`, an unread check never wiping an open incident, the bare `404` veto chosen on purpose, `clear` during a check in flight.
- The tests use bodies shaped like the real `unresolved.json`, real git, npm, pip and cargo error texts, and the clock; they assert whole rows and whole sentences, not fragments of the implementation.

## Findings (none blocks)

1. Not seen live: the sentence appended to a result, and whether the failure-time fetch (the one raced against `sleep(2000, { signal: next.signal })`) read the page or fell to `unread`. `check` re-reads from the command path, which carries no signal, so the run cannot tell the two apart. The types say `next.signal` aborts on interrupt, a hook above settling, or budget, not on `next` resolving, so the path should hold. Right looks like: the first real network failure with the card placed shows `GitHub reports no incident`, not the yellow row. Worth one glance by the director on the next real use.
2. `register.tsx` `named`: a host anywhere in the output names its provider, so a failing test run whose output holds a `github.com` link and the word `timeout` fetches GitHub's status, and on a day GitHub has a Git Operations incident the sentence lands on a test failure. This is the spec's Terms as written and the sentence only reports; a later order could require the host in the command or on the line that carries the network word.
3. `named`: bare `yarn` (which installs) and `npm --prefix app install` (the first non-flag word is the flag's value) name nothing, so such a failure is silently skipped unless the text holds the registry host, which real npm errors usually do. Errs toward silence; acceptable.
4. `drawn`, the `elsewhere` wide row is cut at the right, so at 30 to 35 inner columns the component, the only news, loses its tail (`crates.io: other incident (do…`). The spec asks for exactly this truncation; the short provider name there would read better.
5. `redact-widget` and this widget do not compose (A15, machinist's note 10): whichever sits above sees a `deny` and stays silent. For the director to know, not a fault of the build.
6. The demo page still needs the two stand-ins the spec names (a failing `git push` and a `githubstatus.com` answer in `docs/engine.js`) before the card can show its best moment there; that is the shipper's work.

## Bar

Functional and careful, original (the first widget to read anything from beyond the machine, with no model call and nothing fetched while commands succeed), and it speaks only at the moment it is useful. It passes the bar.
