# Customs

`customs-widget`, command `/customs-widget [on|off|show|trust <name>|clear]`

## What it shows

Every package Claude is about to install, checked against the real registry before the command runs: whether the name exists, when it was first published, its weekly downloads, and how far the version Claude asked for is behind the latest.

- At rest: this session's packages, one line each (name, version asked, latest, age, downloads) with a green, amber or red mark. Empty state: one line saying what it does.
- The gate: when a name is missing from the registry or was first published only days ago, the install is held for a yes even if a rule would have allowed it, and the finding is written under the permission dialog.
- Best moment: Claude runs an install for a name registered four days ago with 30 downloads. A dialog appears where there would have been none, and the line under it says `first published 4 days ago, 30 downloads last week`.

## Why it is remarkable

Claude names packages from memory. Its memory ends at its cutoff, so it pins old versions and now and then invents a plausible name, which is exactly the name a squatter registers. The careful check (open the registry, look at age and downloads) is the one nobody keeps doing by hand. Customs does it every time with no model call.

Closest existing widget: `stakes-widget` (a measured line under a permission dialog, from git). Customs adds what nothing shipped or waiting has: a fact from outside the machine, fetched before the action, and a gate that escalates an allow to an ask. `footprint-widget` (waiting) only lists installs after they ran. `footnotes-widget` checks against the working tree only. No shipped widget calls `$.http.fetch`.

## Sharpening by the examiner

- The gate fires on two findings only: name not found, and name younger than a threshold (suggest 30 days, the designer settles it). A stale version is amber on the card and never a dialog; otherwise the gate becomes noise and is turned off.
- A missing name is never a `deny`: only `ask`. The person decides.
- Manifest edits (package.json and the like) are card only in the first build, and may be cut if they do not fit; the install command is the heart of it.

## API it needs

All checked in the types file (`plugin-authoring/types/claude-code.d.ts`, 2.1.289):

- `on('tool.check', { tool: 'Bash' })`: `await next(e)` for the engine's verdict, return `{ decision: 'ask' }` when a package fails (`ToolCheckDecision = 'allow' | 'ask' | 'deny'`; "return any `{ decision }`"). `plugins/stakes-widget/hooks/register.tsx` already hooks it this way.
- `$.ui.notice(tool_use_id, text)` for the line under the dialog.
- `$.http.fetch(url)` resolving `{ status, ok, headers, text }`: `registry.npmjs.org/<name>`, `api.npmjs.org/downloads/point/last-week/<name>`, `pypi.org/pypi/<name>/json`, `crates.io/api/v1/crates/<name>`.
- `on('tool.call', { tool: 'Edit' | 'Write' })` for manifest additions (card only).
- `$.state` for the session list, `$.store` for a per-package cache (one fetch per name per day), `$.command.register`.
- Hook budget: `HookBudget.ms` is 10 s of the hook's own time and the clock stops while a `$` call is in flight, so a slow registry does not get the hook dropped.

## Cost

- No model calls. Nothing added to the context except the usual permission outcome when an install is held.
- One or two small HTTPS requests per new package name, which tells the public registry that name. The card and the README row must say so.
- Attention: an extra dialog only for missing or very new names; `trust <name>` silences one.

## Risks the designer must settle

1. Privacy of names: a private or in-house package name is sent to the public registry. Decide how scoped names (`@company/x`), a configured private registry (`.npmrc`, `--registry`, `--index-url`), git/path/URL specifiers and workspace packages are recognised and skipped without a lookup.
2. Parsing: which command forms count (`npm i`, `pnpm add`, `yarn add`, `bun add`, `pip install`, `uv add`, `uv pip install`, `cargo add`), and flags, version specifiers, extras, `-r requirements.txt`, chained commands (`&&`, `;`), `npx`/`bunx`/`uvx` runs. Say what is out of scope rather than guess; a bare `npm install` with no names checks nothing.
3. Failure: offline, a timeout, a 429, the organisation's web-fetch policy refusing, or `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`. The command goes through and the line reads unchecked; a lookup failure must never be read as "name missing". Set a fetch time limit so a hung registry does not hold the dialog.
4. Verdict handling: never weaken the engine's verdict. A `deny` stays a deny, an `ask` stays an ask (with the notice added); only an `allow` is raised to `ask`. Confirm in `claude plugin test` that the notice shows on a dialog the hook itself caused, and what happens in modes that settle an ask without a person (the queue, `-p`).
5. crates.io asks for a descriptive User-Agent; check what `HttpInit.headers` lets through.
6. The threshold for "very new" and whether low downloads alone is ever red (suggest no: amber only).
7. Tests must not touch the network: the lookups need a seam the tests and the demo page's stand-in engine can answer.
8. Card fit: five fields per line in 40 columns. Decide what is dropped first.
