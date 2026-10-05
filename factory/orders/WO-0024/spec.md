# Outage (`outage-widget`)
## Purpose
For anyone whose push, fetch or install fails on the network and who then spends twenty minutes on their own config, or watches Claude retry and edit the lockfile, when the fault was an incident at GitHub or npm. At the moment such a command fails, Outage reads the provider's public status page and puts what the provider reports on the card; when the provider reports an open incident on the part that failed, one sentence saying so is added to the failed result, once per incident, so Claude reads it with the error. No model call, and nothing is fetched while things work. Kept from the idea: the check at the moment of failure, the sentence in the result, the minute's re-check while an incident is open, the toast when it clears, the wording that only ever repeats the provider. Cut: the resting row of services seen (it needs a second learning path and says nothing to act on), failed `WebFetch` and MCP calls (no command text to match), Docker Hub (its page has no `incidents/unresolved.json`), GitLab and Bitbucket (see Terms), Anthropic (no command of the session talks to it), and a `check <name>` form.
## Terms
- Providers, each confirmed on 2026-10-05 to answer `GET https://<status host>/api/v2/incidents/unresolved.json` with `{ page, incidents: [{ id, name, impact, started_at, created_at, components: [{ name }] }] }`:

| key | name | status host | hosts in text | program words | its components |
| --- | --- | --- | --- | --- | --- |
| `github` | GitHub | `www.githubstatus.com` | `github.com`, `githubusercontent.com` | `gh` | `Git Operations`, `API Requests` |
| `npm` | npm | `status.npmjs.org` | `npmjs.org`, `npmjs.com` | `npm`, `npx`, `pnpm`, `yarn`, `bun`, `bunx` | `Package installation`, `Package publishing` |
| `pypi` | PyPI | `status.python.org` | `pypi.org`, `pythonhosted.org` | `pip`, `pip3`, `pipx`, `uv`, `poetry`, `twine` | any name beginning `pypi.org`, `PyPI` or `files.pythonhosted.org` |
| `crates` | crates | `status.crates.io` | `crates.io` | `cargo` | `crates.io` |

  The card names `crates` as `crates.io` at 30 inner columns or more. No other provider is in the table; one that cannot be confirmed is left out, never guessed.
- A failed call: a `Bash` or `PowerShell` `tool.call` whose `next(e)` resolved with `isError === true` and a string `text`. A result with `deny`, a call run in the background and one that timed out into the background are not failures (none carries `isError`).
- A network failure: a failed call whose `text` matches the network pattern and not the veto, both without regard to case. Network: `timed out`, `timeout`, `ETIMEDOUT`, `ECONNRESET`, `ECONNREFUSED`, `EAI_AGAIN`, `ENOTFOUND`, `ENETUNREACH`, `socket hang up`, `connection reset`, `connection refused`, `connection closed`, `could not resolve host`, `name resolution`, `network is unreachable`, `remote end hung up`, `unexpected disconnect`, `early EOF`, `could not read from remote repository`, `internal server error`, `bad gateway`, `service unavailable`, or one of `500 502 503 504` as a whole number within 20 characters after `error`, `status`, `HTTP` or `returned`, or as `E50x`. Veto: `permission denied`, `authentication failed`, `non-fast-forward`, `fetch first`, `[rejected]`, `E401`, `E403`, `E404`, or `401`, `403`, `404` as whole numbers. A rejected push, a bad token and a missing package are the person's and cause no fetch.
- Naming, over the whole command and the whole error text, so the failing part of an `&&` chain is found wherever it stands. A word is bounded by the start, the end, white space or one of `; & | ( )`. In order: (1) every provider one of whose hosts occurs in the command or the text; (2) every provider one of whose program words is a word of the command; (3) only when the command has the word `git` and after it a word `push`, `pull`, `fetch`, `clone` or `ls-remote`, and (1) found no provider: the hosts of `git remote -v` (`https://host/`, `ssh://user@host/`, `user@host:`), each known host naming its provider; when none is known, the first host is a stranger. A network failure that names nothing is left alone.
- Checking a provider: `$.http.fetch(url)` raced against `$.clock.sleep(2000)`. The page is read when the fetch won, `ok` is true and the body parses to an object with an `incidents` array; anything else (the sleep won, a rejection, a refusal by policy, a bad body) is `unread` and a late answer is dropped. An incident is related when it has no components or one of them is among the provider's (compared without case). Verdict: `incident` (a related one; the first in the list), `elsewhere` (incidents, none related; the first is kept), `clear` (none), `unread`. Kept of an incident: `id`, `name` with control characters and `"` turned to spaces and cut to 80 characters, `impact` when one of `minor major critical` and otherwise `unknown`, `startedAt` from `started_at`, then `created_at`, then the time of the check, and up to 3 component names of 40 characters.
- Fresh: a report checked under 180 s ago whose verdict is not `unread`. A network failure naming a provider with a fresh report makes no fetch and uses it.
- The sentence, added only for verdict `incident` whose `id` differs from the report's `toldId`, which then becomes that `id`: `[outage-widget] GitHub's status page (https://www.githubstatus.com) reports an open incident: "<name>", impact <impact>, on <components joined by ", ">, open <span>. The words in quotes are the provider's.` (`on ...` is left out with no components.) It states a report and instructs nothing. It is returned as `{ deny: ran.text + '\n\n' + sentences joined by '\n' }`, the form `redact-widget` ships for an errored result. Every other outcome returns the very object `next(e)` gave.
- Reports: at most 4, keyed by provider key or stranger host; a new check replaces the report of its key and the oldest is dropped past 4. Drawn `incident` first, then newest first.
- The poll: while on and any report is `incident`, every 60 s each such provider is checked. Still `incident`: the incident and time are replaced. `clear` or `elsewhere`: the report takes it and `$.ui.toast("GitHub reports the incident resolved.")`. `unread`: the report is left as it was.
## Card
Title `Outage`. Note: `plural(n, 'incident')` for the `n` reports with verdict `incident` (`<n> open` under 30 inner columns), none when `n` is 0. Inner width is the card's width less 4; every row truncates at the right with `…`. One row per report, and a second, dim row under an `incident`. Wide form at 30 inner columns or more, short form under.

| verdict | wide | short | colour |
| --- | --- | --- | --- |
| `incident` | `GitHub: <incident name>` then `<impact>, open <span>, <first component>` | `GitHub: <name>` then `open <span>` | red, second row dim |
| `elsewhere` | `GitHub: other incident (<first component or name>)` | `GitHub: other` | plain |
| `clear` | `GitHub reports no incident` | `GitHub: quiet` | plain |
| `unread` | `Could not check GitHub's status` | `GitHub: unread` | yellow |
| stranger | `No status page known: gitlab.com` | `no page: gitlab.com` | dim |

When reports exist and none is `incident`, a last dim row at 30 inner columns or more: `A status page can lag an outage.` The card never says the fault is the person's.
```
Empty: on, no network failure yet.
│ Outage                               │
│ No network failure yet. When a push  │
│ or install fails on the network, the │
│ provider's status page is checked    │
│ and its answer shows here.           │
Working: a push failed, the page reports nothing.
│ Outage                               │
│ GitHub reports no incident           │
│ A status page can lag an outage.     │
Best moment: the push failed and it is theirs.
│ Outage                    1 incident │
│ GitHub: Incident with Git Operations │
│ major, open 12m 04s, Git Operations  │
│ npm reports no incident              │
Error and the other verdicts.
│ Outage                               │
│ Could not check npm's status         │
│ GitHub: other incident (Actions)     │
│ No status page known: gitlab.com     │
│ A status page can lag an outage.     │
Busiest at 20 columns:
│ Outage    1 open │
│ GitHub: Inciden… │
│ open 12m 04s     │
│ npm: unread      │
│ PyPI: quiet      │
│ crates: other    │
```
The empty sentence at 20 columns: `No network failure yet. A failed push or install is checked against the provider's status page.`, wrapped.
## Commands
`/outage-widget [on|off|check|clear]`, the verb matched without regard to case. Bare, `on`, `off` and the usage as in the template (`Outage on; /widgets places it.`, `Outage off.`). No second command, no tool.
- `check`: checks every provider on the card again now, fresh or not, and answers one line per report in card order: `GitHub: "<name>", <impact>, open <span>.`, `GitHub: an incident on another part, "<name>".`, `GitHub reports no incident.`, `Could not check GitHub's status.`, `No status page known for gitlab.com.` With no report: `Nothing to check yet: no network command has failed.` It adds no sentence and sends no toast.
- `clear`: forgets every report, stops the poll and answers `Outage cleared.`
- While off, `check` and `clear` answer `Outage is off.`, fetch nothing and change nothing.
## Data
Verified in this build's types (`plugin-authoring/types/claude-code.d.ts`, 2.1.289; `plugins/*/.claude-plugin/types/` is absent from this checkout).
- `on('tool.call', async ($, e, next) => ...)`, narrowed by `e.tool === 'Bash' || e.tool === 'PowerShell'` (both inputs carry `command: string`). Off or another tool: `return next(e)`. Otherwise `const ran = await next(e)`; `ToolCallResult`'s errored form is `{ isError: true, result: unknown, text?: string, ref?, context? }` ("present only when the tool reported an error (it threw, was interrupted, or answered an error): `text` is what the model read"), and `{ deny: string }` "Refuses the call: the model receives the text as an error result". The switch is read again after `next`. Work happens once per failed call; a call that succeeds costs one switch read.
- `$.http.fetch(url: string, init?: HttpInit): Promise<HttpResponse>`, `HttpResponse = { status, ok, headers, text }`: "http or https, to whatever the host reaches, unless the organization's web-fetch policy refuses it. `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` refuses a built-in's request, and any plugin's that carries `auth`". No `auth`, no headers, `GET`. `HttpInit` has no time limit, hence the race. One request per named provider per network failure unless fresh, one per open incident per minute, one per report per `check`.
- `$.clock.sleep(ms, { signal })`: "The wait is the hook's own time and its budget runs on through it"; 2 s of `HookBudget.ms` 10 000. Pass `next.signal` in the `tool.call` hook; a sleep that rejects counts as `unread`.
- `$.process.run(['git', 'remote', '-v'], { timeoutMs: 2000 })` resolving `{ exitCode, stdout, stderr }`, only in naming step (3); a rejection or a non-zero exit names nothing.
- `$.clock.every(60_000, fn)` for the poll; `$.clock.now()` for check times and ages; `$.ui.toast(text)`; `update`/`read` on atoms (a write redraws, so the age on the card moves once a minute with the poll and not between); `$.store.get/set` for `isOn`; `$.command.register`; `on('command.run', { command: 'outage-widget' })`; `on('session.start')`; the three `on('ui.render')` hooks; `$.widgets.card`. Drawing reads state only.
- Not used: `$.ui.notice` (core removes its line when the call resolves and refuses a call that is not open), `prompt.submit`, `$.model`, `$.fs`.
## State and storage
- `$.state` `isOn: boolean`.
- `$.state` `reports: OutageReport[]`, default `[]`, at most 4. `OutageReport`: `{ key: string; name: string; verdict: 'incident' | 'elsewhere' | 'clear' | 'unread' | 'stranger'; checkedAt: number; incident: { id: string; name: string; impact: 'minor' | 'major' | 'critical' | 'unknown'; startedAt: number; components: string[] } | null; toldId: string | null }`. `incident` is non-null for `incident` and `elsewhere` alone; `toldId` survives a re-check of the same key.
- `$.store` `isOn` alone. No file. The poll's handle is the only module-level `let`, started and stopped in `sync`, which is called at `session.start`, after every change of the switch and after every change of `reports`.
## Off
No card, no fetch, no `git remote`, no timer, no toast, nothing stored; `tool.call` returns `next(e)` untouched and no result is rewritten. Switching off empties `reports` and stops the poll. A check in flight when the switch goes off writes nothing and returns the result it was given.
## Demo
At rest: the empty sentence. `docs/engine.js` answers every `$.http.fetch` with the text `ok` and its scripted turn has no network failure (the failed `npm test` matches no network pattern), so today the card rests through the turn and must not throw. Stand-ins needed: a scripted `Bash` call `git push origin main` failing with `fatal: unable to access 'https://github.com/demo/demo.git/': The requested URL returned error: 503`, and `http.fetch` answering a URL on `www.githubstatus.com` with one unresolved incident `Incident with Git Operations`, impact `major`, component `Git Operations`, `started_at` 12 minutes before the engine's clock. After the turn: note `1 incident`, the red row `GitHub: Incident with Git Operations`, the dim row `major, open 12m 00s, Git Operations`.
## Live
`bun factory/tools/live.ts factory/floor/plugins/outage-widget --allow "Bash" --say "/outage-widget on" --say "Run exactly this one command with Bash, once, and do not retry it. Then answer ok: curl -sS -m 3 https://github.com:81/" --say "/outage-widget check" --say "/outage-widget off"`
One small turn. The curl times out (`curl: (28) Connection timed out`), which names GitHub by host. A good run: the tool result is the curl error, unchanged unless GitHub has a real incident on Git Operations or API Requests; `check` answers one line for GitHub, `GitHub reports no incident.` on a quiet day; the store prints `isOn` false. `Nothing to check yet` means the hook did not see the failure as an error: log the result's `isError` and `text`. `Could not check GitHub's status.` means the fetch was refused or slow: log which. The sentence in a real result cannot be forced live; the builder logs whether a real incident happened to show it.
## Cost
No model call. Nothing while commands succeed. Per network failure, one small request per named provider (none within three minutes of the last), then one a minute while an incident is open. About 50 tokens added to one tool result per incident, nothing otherwise.
## Acceptance
Tests answer `http.fetch`, `process.run` and `tool.call` through `ground()`'s `answers` and a bottom `tool.call` hook, with bodies shaped like the real `unresolved.json`, and record every fetched URL.
- A1: switched on with no failure, the card shows the empty sentence and no note in all three placements; a `Bash` call that succeeds, one that fails with `AssertionError`, and a failed `Read` cause no fetch and leave the card empty.
- A2: a failed `git push` whose text holds `https://github.com/` and `error: 503` fetches exactly `https://www.githubstatus.com/api/v2/incidents/unresolved.json`; with an open incident on `Git Operations` the card shows the note `1 incident`, the red row and the dim row with impact, age and component, and the call resolves to `{ deny }` holding the whole original error followed by the sentence with the name, impact, component and age.
- A3: with `incidents: []` the card shows `GitHub reports no incident` and the lag row, and the hook returns the very object beneath returned; with an incident on `Actions` alone it shows `GitHub: other incident (Actions)` and likewise returns the object untouched; an incident with no components counts as related.
- A4: a fetch that rejects, answers `ok: false`, answers text that is not JSON or JSON without `incidents`, or has not answered when the clock passes 2000 ms gives the yellow `Could not check GitHub's status`, the untouched result, and no later change when the slow answer arrives.
- A5: the veto holds: a failed push with `[rejected]` and `non-fast-forward`, `npm install` failing with `E404`, and a `403` cause no fetch; each network word of Terms on a command naming a provider causes one.
- A6: naming: `npm ci` with `ETIMEDOUT` checks npm, `pip install` PyPI, `cargo build` crates, `gh pr list` GitHub; `cd app && npm test && git push` failing with a `github.com` timeout checks GitHub and npm; a `PowerShell` call is treated as `Bash` is; `echo npmrc` with a timeout names nothing and fetches nothing.
- A7: a failed `git fetch` whose text names no host runs `git remote -v` once: a `git@github.com:` remote checks GitHub, a `gitlab.com` remote draws `No status page known: gitlab.com` with no fetch, and a rejected or failing `git remote` draws nothing; no other failure runs a process.
- A8: a second failure naming the same provider under 180 s later makes no fetch and adds no sentence for the same incident id; at 180 s or more it fetches again; a different incident id adds the sentence again; an `unread` report is never reused.
- A9: while a report is `incident` the provider is fetched once per 60 s of clock and the age on the card grows; when the page then answers `incidents: []` the row becomes `GitHub reports no incident`, one toast `GitHub reports the incident resolved.` is sent and no further fetch follows; an unread poll leaves the incident on the card.
- A10: an incident name holding a newline, a `"` and 300 characters reaches the card and the sentence as one line of at most 80 characters of name with neither; an `impact` outside the three known reads `unknown`; a missing `started_at` falls back to `created_at`.
- A11: `check` refetches every provider on the card inside the 180 s, answers one line per report in card order in each of the five wordings, adds no sentence and sends no toast; with no report it answers `Nothing to check yet: no network command has failed.` and fetches nothing.
- A12: `clear` empties the card, stops the poll and answers `Outage cleared.`; `what` answers the usage naming all four verbs; five keys checked in turn leave the newest four.
- A13: at 20, 40 and 60 columns no row of any verdict is longer than the inner width; under 30 inner columns the short forms and the note `1 open` are drawn and the lag row is not; `incident` reports are drawn first.
- A14: while off, `check` and `clear` answer `Outage is off.`; a network failure causes no fetch, no process and returns the result untouched; switching off with an incident open empties `reports` and stops the poll, a check in flight then writes nothing, and the store never holds a key but `isOn`.
- A15: with the widget on, a result that arrives as `{ deny }` and a call with `run_in_background: true` that resolves without `isError` cause no fetch and are returned untouched.
## widget.json
- title: `Outage`
- category: `Session`
- shows: `When a push or install fails on the network, checks the provider's status page and says whether GitHub, npm, PyPI or crates.io reports an incident`
- commands: `/outage-widget [on|off|check|clear]`
- cost: `About 50 tokens added to one failed tool result per provider incident; no model calls`
