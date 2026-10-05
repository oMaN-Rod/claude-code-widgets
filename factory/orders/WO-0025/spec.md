# Customs (`customs-widget`)
## Purpose
For anyone who lets Claude install packages. Claude names packages from memory: now and then it invents a plausible name, which is the name a squatter registers, and it pins versions from before its cutoff. Customs looks each name up on the public registry before the install command runs, shows what it found, and holds the install for a yes when the name does not exist or was first published under 30 days ago, even where a rule would have allowed it. No model call. Kept from the idea: the lookup before the command, the two-finding gate, the line on the dialog, the session list, `trust`. Cut: crates.io (it wants a User-Agent this build cannot be shown to send), manifest edits, `npx`/`bunx`/`uvx`, `-r` files, a cache across sessions (installs are rare; each command looks its names up afresh), and low downloads as a finding of its own (shown, never a mark).
## Terms
- Segments: each line of the command is first cut at a comment, the first `#` outside quotes that starts the line or follows whitespace (the rest of the line is not read); then the command is split on `&&`, `||`, `;`, `|` and newlines, each trimmed, then leading `sudo` and `NAME=value` words dropped. A segment holding `$`, a backtick or `(` is not read.
- Install forms, by the segment's first words: npm family `npm install|i|add`, `pnpm add|install|i`, `yarn add`, `bun add|install|i`; Python `pip|pip3 install`, `python|python3|py -m pip install`, `uv add`, `uv pip install`. Nothing else is read (`yarn global add`, `npx`, `cargo`, `npm ci` included).
- Words after the form: split on whitespace outside quotes; a word is quoted when any part of it stood in quotes; surrounding quotes are removed. A word that is exactly `&` ends the segment: it and every word after it are dropped. Redirections: an unquoted word holding `<` or `>` is cut at the first of them, and when the word ends in `<`, `>` or `&` the next word is dropped too; what stood before the cut stays as a word unless it is empty, all digits or `&`. So `2>&1`, `> out.log`, `>out.log`, `2> err.log` and `&>log` leave nothing, unquoted `requests>=2` leaves `requests` (what the shell installs), and quoted `'requests>=2'` is untouched. A word starting with `-` is dropped; after a value flag the next word is dropped too. Value flags: `-r -e -c -t -p -w -C -F -i -f --requirement --editable --constraint --constraints --target --prefix --python --filter --workspace --cwd --dir --group --extra --optional --package --project --directory --script --marker --tag --branch --rev --bounds --python-version --python-platform --platform --implementation --abi --root --src --upgrade-strategy --upgrade-package --reinstall-package --no-binary --only-binary --no-binary-package --no-build-package --config-settings --config-setting --progress-bar --root-user-action --report --log --timeout --retries --proxy --cert --client-cert --trusted-host --exists-action --use-feature --use-deprecated --resolution --prerelease --exclude-newer --index-strategy --keyring-provider --link-mode --override --overrides --loglevel --reporter --cache --cache-dir --cache-folder --store-dir --modules-dir --modules-folder --userconfig --config --config-file --omit --include --otp --scope --before --save-prefix --install-strategy --cpu --os --libc --backend --network-timeout --network-concurrency --mutex --color --registry --index-url --extra-index-url --find-links --index --default-index`. A Python word made only of digits and dots (`3.12`) is not a name and is ignored. A word that starts with `.`, `/` or `~`, holds `:` or `\`, holds `/` without starting with `@`, or ends in `.tgz`, `.whl`, `.gz` or `.zip` is not a registry name and is ignored.
- A name: npm `name` or `name@spec` (split at the last `@` past the first character), the name matching `^(@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$`; Python `name`, `name[extras]` or either followed by a spec starting at the first of `=<>!~`, the name matching `^[A-Za-z0-9][A-Za-z0-9._-]*$` and then lower-cased with runs of `-_.` made `-`. A word that matches neither is ignored. `asked` is the spec's version with leading `^~=<>v` removed when it then starts with a digit (Python: only from `==`), else empty. The key is `npm:<name>` or `pypi:<name>`. At most 8 distinct keys per command are taken; later ones are `unchecked`.
- Skipped without a lookup (privacy): an npm name with a scope (`@x/y`); every name of a segment that carries `--registry`, `--index-url`, `-i`, `--extra-index-url`, `--find-links`, `-f`, `--index` or `--default-index`; every npm-family name when `<session cwd>/.npmrc` has a `registry=` line whose host is not `registry.npmjs.org`. Not seen, and said in the README row: user-level and environment registry settings, `bunfig.toml`, `.yarnrc.yml`, pip and uv config files.
- Lookup: npm `GET https://registry.npmjs.org/<name>`, reading `time.created` and `dist-tags.latest`; when that answers 200, `GET https://api.npmjs.org/downloads/point/last-week/<name>`, reading `downloads`. Python `GET https://pypi.org/pypi/<name>/json`, reading `info.version` and the earliest `upload_time_iso_8601` of any file in `releases`; no downloads. All of a command's lookups start together and share one limit of 4000 ms (`$.clock.sleep`); whatever has not answered by then is `unchecked`.
- Kind, first that fits: `skipped`; `missing` (status 404); `unchecked` (any other status but 200, a rejected fetch, a body that is not JSON or lacks the created date or latest version, the limit, the ninth key); `new` (`floor((now - created) / 86 400 000)` under 30); `behind` (`asked` not empty and its major number under the latest's); `ok`. A failed downloads call drops the downloads from the line and changes nothing else. A failure is never `missing`.
- Mark, fact and line per kind (age: `plural(n, 'day')` under 60 days, `plural(n, 'month')` of 30 days under 24 months, else `plural(n, 'year')` of 365 days; downloads: the number under 1000, whole `k` under a million, else whole `M`; `<registry>` is `npm` or `PyPI`):
  - `missing`: red `✗`, `not found`, `no package named <name> on <registry>`
  - `new`: red `✗`, the age, `first published <age> ago, <n> downloads last week` (Python and failed downloads: `first published <age> ago`)
  - `behind`: yellow `!`, `<asked> → <latest>`, `asked <asked>, latest is <latest>`
  - `ok`: green `✓`, `<latest>`, `on <registry> <age>, <n> downloads last week, latest <latest>` (downloads part omitted as above)
  - `unchecked`: dim `?`, `unchecked`, `unchecked: <registry> did not answer`
  - `skipped`: dim `·`, `skipped`, `not looked up: private scope or registry`
  - `checking`: dim `…`, `checking`, `looking up on <registry>`
- Flagged: an entry of kind `missing` or `new` whose bare name is not trusted. The gate line is `<name>: <line>` of the first flagged entry, with ` (+<n> more)` when others are flagged.
## Card
Title `Customs`. Note: `<n> held` when any listed entry is held, else `plural(n, 'package')`, none when empty. Newest entry first: a row of mark, name and the fact right-aligned (the name cut with `…` so the fact stays whole), then its line wrapped in the mark's colour. Up to 5 earlier entries, one row each. Under 30 columns rows are mark and name only. Inner width is the card's less 4.
```
Empty: on, nothing installed yet.
│ Customs                              │
│ Nothing checked yet. Each package    │
│ Claude installs is looked up on npm  │
│ or PyPI first; a missing or brand    │
│ new name is held for your yes.       │
Working: the lookup is in flight (dim).
│ Customs                    1 package │
│ … sum-utils-fast            checking │
│ looking up on npm                    │
Best moment: an allowed install held, with earlier packages beneath.
│ Customs                       1 held │
│ ✗ sum-utils-fast              4 days │
│ first published 4 days ago, 30       │
│ downloads last week                  │
│ ! lodash            3.10.1 → 4.17.21 │
│ ✓ express                     4.21.2 │
│ · @acme/billing              skipped │
Error: the registry did not answer; the command went through.
│ Customs                    1 package │
│ ? requests                 unchecked │
│ unchecked: PyPI did not answer       │
Busiest at 20 columns:
│ Customs   1 held │
│ ✗ sum-utils-fast │
│ first published  │
│ 4 days ago, 30   │
│ downloads last   │
│ week             │
│ ! lodash         │
│ ✓ express        │
│ · @acme/billing  │
```
## Commands
`/customs-widget [on|off|show|trust <name>|clear]`, the verb matched without regard to case. Bare, `on`, `off` and the usage as in the template (`Customs on; /widgets places it.`, `Customs off.`). No second command, no tool.
- `show`: the list as text, one line per entry, `<name> (<registry>): <line>` with ` [held]` after a held one, then `Trusted: <names>` when there are any; `Nothing checked yet.` when the list is empty and nothing is trusted.
- `trust <name>`: the name, lower-cased with runs of `-_.` made `-`, is never held and gets no notice again, on either registry, in every session; it is still looked up and drawn. Answers `Customs trusts <name>.`; a name already trusted answers the same and adds nothing; no name or a word that is not a name answers the usage. At most 100 names, the oldest dropped.
- `clear`: empties the session list and the trusted names; answers `Customs cleared.`
- While off, `show`, `trust` and `clear` answer `Customs is off.` and change nothing.
## Data
Verified in this build's types (`plugin-authoring/types/claude-code.d.ts`, 2.1.289; `plugins/*/.claude-plugin/types/` is absent from this checkout).
- `on('tool.check', { tool: 'Bash' }, hook)` and the same hook on `{ tool: 'PowerShell' }`; `ToolCheckInput` is `{ tool, input, tool_use_id? }`, `input` is `{ command }`. Once per shell call. Order: off, return `next(e)`. `const verdict = await next(e)`. Return `verdict` itself when `e.tool_use_id` is absent ("absent on a query"), the command is not a string, no name is parsed, or `verdict.decision` is `deny` (nothing is fetched for a call that will not run). Otherwise write the entries as `checking`, look up, write the kinds. Nothing flagged: return `verdict` itself. Flagged and `verdict.decision === 'ask'`: `$.ui.notice(e.tool_use_id, gateLine)` inside `try`/`catch`, return `verdict` itself. Flagged and `allow`: mark the flagged entries held and return `{ decision: 'ask', reason: gateLine }` (`ToolCheckDecision = 'allow' | 'ask' | 'deny'`; `reason`: "from a hook, what the model reads on a deny and the dialog shows on an ask"; "A hook may answer any verdict in either direction"). The widget never returns `allow` or `deny` of its own.
- `$.http.fetch(url: string, init?: HttpInit): Promise<HttpResponse>`, `HttpResponse` `{ status, ok, headers, text }`; no `init` is passed (no `auth`, so `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` does not refuse it; an organisation's web-fetch policy may, and that is `unchecked`). One or two per name per command.
- `$.clock.sleep(ms, { signal: next.signal })` for the 4000 ms limit: a `$.clock` wait is the one `$` call that counts against `HookBudget.ms` (10 000), which leaves 6 s; fetches cost nothing. `$.clock.now()` once per command.
- `$.session.cwd()` and `$.fs.read(path)` ("Rejects when missing", caught as empty) for `.npmrc`, only when a command has an npm-family name.
- `$.ui.notice(tool_use_id: string, text: string | undefined)`: "A call that is not open is refused", hence the catch.
- `$.store.get/set`, `$.command.register`, `on('command.run', { command: 'customs-widget' })`, `on('session.start')`, the three `on('ui.render')` hooks, `$.widgets.card`, `atom`/`read`/`update`. Drawing reads state only. Not used: `tool.call`, `$.process`, `$.model`, timers.
## State and storage
- `$.state` `isOn: boolean`.
- `$.state` `list: CustomsEntry[]`, default `[]`, newest first, at most 8, one per key (a key seen again moves to the front). `CustomsEntry`: `{ key: string; name: string; registry: 'npm' | 'pypi'; kind: 'checking' | 'missing' | 'new' | 'behind' | 'ok' | 'unchecked' | 'skipped'; fact: string; line: string; held: boolean }`.
- `$.state` `trusted: string[]`, default `[]`.
- `$.store` `isOn`, and `trusted: string[]`, read at `session.start`. No file. No module-level `let`.
## Off
No card, no lookup, no file read, no notice; `tool.check` returns `next(e)` untouched. Switching off empties `list`; `trusted` stays in the store. There is no timer to stop.
## Demo
`docs/engine.js` has no install in its scripted turn and its `http.fetch` answers `{ ok: true, status: 200, text: 'ok' }` for everything. Stand-ins needed: one scripted call after the `Edit`, `{ tool: 'Bash', input: { command: 'npm install sum-utils-fast lodash@3.10.1' }, ms: 900, text: 'added 2 packages' }`, and `http.fetch` answering by URL: `registry.npmjs.org/sum-utils-fast` created 4 days before now with latest `0.1.0`, its downloads 30; `registry.npmjs.org/lodash` created in 2012 with latest `4.17.21`, its downloads 38 000 000; any other URL as today. At rest: the empty sentence. After the turn: note `1 held`, `✗ sum-utils-fast  4 days` with its two-row line, then `! lodash  3.10.1 → 4.17.21`. Without the stand-ins the card must not throw: with the install but today's `http.fetch` it shows two `unchecked` rows.
## Live
`bun factory/tools/live.ts factory/floor/plugins/customs-widget --allow "Bash" --say "/customs-widget on" --say "Run exactly these two commands with the Bash tool, one call each, and nothing else: npm install --dry-run is-odd and then npm install customs-live-zz9-no-such-package. If one is refused do not try another way. Then answer ok." --say "/customs-widget show" --say "/customs-widget off"`
One small turn, real registry. Bash is allowed, so any ask is the widget's own. A good run: the dry run goes through and changes nothing; the second call is refused by the headless host with the gate line as its reason, so nothing is installed; `show` answers `is-odd (npm): on npm <n> years, <n> downloads last week, latest <v>` and `customs-live-zz9-no-such-package (npm): no package named customs-live-zz9-no-such-package on npm [held]`; the store prints `isOn` false. The builder logs how the headless host settled the raised ask. `unchecked` on both means the host refused the fetch: log the status.
## Cost
No tokens and no model call; nothing added to a prompt except the gate line as the reason of a held install. Each install command sends the unscoped names it installs to `registry.npmjs.org` and `api.npmjs.org`, or `pypi.org`, and reads the registry's whole record for each (large for an old package). A lookup can delay the command by up to 4 s. With an ask raised, a mode with no person to answer (`-p`, a queue) refuses the install.
## Acceptance
Tests answer `http.fetch` through `ground()`'s `answers` by URL, record every URL asked, and put `tool.check` at the bottom with the engine's verdict; no test touches the network.
- A1: switched on with nothing checked, the card shows the empty sentence and no note in all three placements, and `show` answers `Nothing checked yet.`
- A2: each install form in Terms yields its keys and `asked` values: `npm i a b@1.2.3`, `pnpm add a`, `yarn add a`, `bun add a`, `pip install 'requests>=2' Flask_Login[extra]==0.6.0`, `python -m pip install a`, `uv add a`, `uv pip install a`, a form after `cd app && sudo FOO=1`, and `pip install -t out a` (the word after `-t` dropped). One key and only that key's URLs asked for each of: `pip install requests 2>&1 | tail -5`, `pip install requests > install.log`, `npm install lodash > out.log 2>&1`, `npm i lodash &>log`, `pip install requests>=2`, `npm install lodash@4 # add lodash; npm i evil`, `npm i lodash & echo done`, `uv add --group dev requests`, `pip install --python-version 3.12 requests`, `npm install lodash --loglevel error`.
- A3: nothing is fetched, the card is unchanged and the verdict is the object beneath for `npm install`, `npm test`, `npm ci`, `npx cowsay`, `cargo add serde`, `yarn global add a`, `pip install -r requirements.txt`, `pip install ./pkg`, `npm i git+https://x/y.git`, `npm i user/repo`, `npm i ./a.tgz`, `npm i $(cat names)`, `npm i # lodash`, `npm i > lodash`, `npm i 2>&1`, `pip install 3.12`, `pip install --platform linux --abi cp312`, and an input whose command is not a string.
- A4: a name created years ago under an `allow` returns the same verdict object, draws a green `✓` row with the latest version as its fact, and its line reads `on npm <age>, <n> downloads last week, latest <v>`, with ages of 45 days, 14 months and 11 years and downloads of 30, 12 400 and 38 000 000 written as `45 days`, `14 months`, `11 years`, `30`, `12k`, `38M`.
- A5: a 404 under an `allow` returns `{ decision: 'ask', reason: '<name>: no package named <name> on npm' }`, draws a red `✗ … not found` row, the note `1 held`, and no downloads URL is asked; the same on PyPI names `PyPI`.
- A6: a name created 29 days ago under an `allow` is raised to `ask` with `first published 29 days ago, <n> downloads last week`, and one created 30 days ago is not raised; on PyPI the age comes from the earliest upload over all releases and the line has no downloads.
- A7: with the engine's verdict `ask` and a flagged name, the same verdict object is returned, `$.ui.notice` is called once with the call's id and the gate line, and a notice that throws changes nothing; with the verdict `deny` nothing is fetched and no entry is added.
- A8: `lodash@3.10.1` against latest `4.17.21` draws a yellow `!` row `3.10.1 → 4.17.21` and returns the verdict beneath; `lodash@^4.17.0`, `lodash@latest` and a Python `requests>=2` are `ok`.
- A9: a 500, a 429, a rejected fetch, a 200 with a body that is not JSON, a 200 lacking the created date, and a fetch that never answers once the clock passes 4000 ms each give `unchecked`, never `missing`, and return the verdict beneath; a failed downloads call alone keeps the kind and drops the downloads from the line; the ninth distinct name of one command is `unchecked` and not fetched.
- A10: `@acme/billing`, any name beside `--registry`, `--index-url`, `-i` or `--extra-index-url`, and an npm name when `.npmrc` in the session's folder holds `registry=https://npm.acme.dev/` are listed as `skipped` with no URL asked and the verdict beneath returned; an `.npmrc` naming `registry.npmjs.org`, or none, looks up as usual.
- A11: after `trust Sum_Utils.Fast` a 404 or new `sum-utils-fast` is still fetched and drawn red but returns the verdict beneath with no notice; the name is in the store and holds in a new session; `trust` alone and `trust ../x` answer the usage; the 101st name drops the first.
- A12: `show` lists every entry with `[held]` on held ones and the trusted names; `clear` empties the list and the store's `trusted` and answers `Customs cleared.`; `what` answers the usage naming every verb; while off `show`, `trust x` and `clear` answer `Customs is off.` and the store is unchanged.
- A13: two flagged names in one command give the gate line of the first with ` (+1 more)` and the note `2 held`; a key checked again moves to the front without a second row; a ninth entry drops the oldest; the card draws the newest in full and at most 5 rows beneath.
- A14: at 20, 40 and 60 columns no row of any state is longer than the inner width, a long name is cut with `…` and the fact stays whole, the line wraps instead of being cut, and under 30 columns rows carry mark and name only.
- A15: while a lookup is unanswered the card draws the dim `checking` row for each name, replaced when it answers; a `PowerShell` call is treated as a `Bash` one; a check with no `tool_use_id` fetches nothing; switching off empties the list and a later install fetches nothing, reads no file and returns the verdict beneath.
## widget.json
- title: `Customs`
- category: `Project and git`
- shows: `Looks up every package Claude installs on npm or PyPI before the command runs, and holds the install for a yes when the name is missing or under 30 days old`
- commands: `/customs-widget [on|off|show|trust <name>|clear]`
- cost: `Sends the name of each package Claude installs to registry.npmjs.org or pypi.org; no model calls`
