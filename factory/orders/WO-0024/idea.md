# Outage

`outage-widget`, command `/outage-widget [on|off|check|clear]`

## What it shows

When a command that talks to an outside service fails, the card checks that service's public status page and says whether the fault is theirs.

- At rest: one quiet row of the services this project talks to, learned from the git remote and from the hosts in the commands this session ran, such as `github  npm  anthropic`. Nothing is fetched. With none known yet: `No outside services seen yet`.
- At its best: a `git push` fails, and within a second the card turns red: `GitHub: Git operations degraded, 12 min`. The same sentence is added to the end of the failed command's result, so the person reads it in the transcript and Claude reads it with the error, and does not start rewriting the config or the lockfile.
- When the status page reports no incident: the card says `GitHub reports no incident` in a plain colour and nothing is added to the result. The widget never says the fault is yours; it only says what the provider reports.
- While an incident is open: its name and age, checked again once a minute, and a toast when it clears.
- When the page cannot be read (policy, no network, bad answer): `Could not check GitHub's status`.

## Why it is remarkable

Everyone has lost twenty minutes debugging a failure that was an incident at GitHub or npm, and Claude does worse: it retries, changes the config and edits the lockfile. Looking at the status page is the step a person has to remember, and this does it at the one moment it matters.

Closest existing widgets: `checks-widget` and `activity-widget` report that a command failed; `pitfalls-widget` and `stuck-widget` (waiting) react to repeated failure. None says why, and none looks beyond the machine. No shipped or waiting widget calls `$.http.fetch`: this is the first card whose news comes from the outside world.

## The API it needs

All checked against this build's types.

- `on('tool.call', { tool: 'Bash' }, ...)`: `await next(e)`, read the result, and act only when it failed. Match the command (and the error text) to a provider by host or by program: `git push/pull/fetch/clone` with the remote's host, `npm`/`bun`/`pnpm`/`yarn` install and publish, `pip`, `cargo`, `docker pull/push`, `gh`, `curl` to a known host. The same for failed `WebFetch` and MCP calls where the host is known.
- `$.http.fetch(url)` returning `{ status, ok, headers, text }`, to the provider's Statuspage JSON (`/api/v2/status.json`, `/api/v2/incidents/unresolved.json`). No `auth` is sent, so `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` does not refuse it; the organisation's web-fetch policy can.
- Returning the result with one sentence appended to its text, as `redact-widget` already rewrites results. This replaces the inventor's two channels (`$.ui.notice` and a `prompt.submit` note): the sentence is under the failed call and in Claude's context in one move, once.
- `$.process.run(['git', 'remote', '-v'])` to learn the remote's host; `$.clock.every` at one minute, only while an incident is open; `$.ui.toast` on recovery; `$.widgets.card` for the card.

Correction to the inventor's claim: `$.ui.notice(tool_use_id, text)` writes under a call's open dialog, and core removes the line when the call resolves and refuses a call that is not open. It cannot put a verdict under a call that has already failed. Do not use it for that.

## Cost

No model call. One small HTTP request per failed network command, answers kept for a few minutes per provider, and one request a minute only while an incident is open. About 30 tokens added to one tool result per incident, and nothing when the provider reports no incident. Nothing is fetched while everything works.

## Risks the designer must settle

1. The provider table. Confirm each provider's status host and that it answers the Statuspage v2 JSON shape before it goes in the table: GitHub, npm, PyPI, crates.io, Docker Hub, Anthropic. A provider that cannot be confirmed is left out, not guessed. Decide whether GitLab, Bitbucket and a self-hosted remote get a row (a self-hosted host has no status page: say `No status page known`).
2. Component matching. GitHub can have an Actions incident while Git operations are fine. Decide how an incident is tied to the kind of command that failed (component names in the incident), and what the card says when an incident is open but on another component.
3. What counts as a failure worth a fetch. A rejected push (non-fast-forward), a 401 or a missing package is the person's, not the provider's. Decide the error patterns that trigger a check (timeouts, 5xx, connection reset, DNS) and those that do not, and how the Bash tool's result marks failure in this build (`isError`, exit code in the text).
4. The wording added to the result. One sentence, stated as the provider's report with its time, never an instruction that could be wrong: Claude must stay free to continue when the incident is unrelated. Added once per incident, not on every failed retry; `witness-widget` should be able to show it.
5. A status page that is green during a real outage. The card must not read as "the fault is yours".
6. The fetch must not delay the tool result noticeably: set a short time limit, and decide whether the sentence is skipped or the result waits when the page is slow.
7. Background and long-running Bash calls, and commands chained with `&&`, where the failing part is not the first word.
8. The demo page's stand-in engine has no `$.http.fetch`: the widget needs a scripted incident there.
