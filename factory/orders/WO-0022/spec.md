# Aim (`aim-widget`)
## Purpose
For anyone answering a permission dialog for `kubectl delete`, `terraform apply` or `psql` who cannot see, without leaving the dialog, which cluster, account, workspace or database the command will reach. The repository is the same on every machine; where the shell points is not. Aim names the target in the dialog's reason and keeps the targets active right now on a quiet card. No model, no tokens. Kept from the idea: the line in the dialog, the resting rows, production words, `changed` only for a change the widget saw, all six verbs. Cut, each because a wrong target is worse than none: migration runners (most read `.env` or a config file, not the environment), `mysql`, `az`, Docker contexts, the AWS account number (it needs a network call), the kube namespace, and the file fallback for an absent tool (a tool that is absent cannot run the command either).
## Terms
- Kinds, their tools and their phrases: `kube` (`kubectl`, `helm`; `kube context`), `aws` (`aws`; `aws profile`, `aws key`, `aws endpoint`), `gcp` (`gcloud`; `gcloud project`), `tf` (`terraform`; `terraform workspace`), `db` (`psql`; `database`). No other command is ever given a line.
- Windows: `$.session.cwd()` matches `/^[a-z]:[\\/]|^\\\\/i`. A probe is `$.process.run(argv, { cwd: dir, timeoutMs: 3000 })`; on Windows the argv is prefixed `['cmd', '/d', '/c']` (`gcloud` is a `.cmd`). A probe that rejects, exits non-zero or prints nothing gives no answer.
- Env: `$.env.get` of the literal names `KUBECONFIG AWS_PROFILE AWS_ACCESS_KEY_ID CLOUDSDK_CORE_PROJECT TF_WORKSPACE DATABASE_URL PGHOST PGDATABASE USERPROFILE HOME`, overlaid with the command's own assignments (below). The types call this "the environment of this process, the one every Bash child ... inherits"; a profile script may still change it for the shell, so a target read from it is labelled `from the environment`.
- Ambient target of a kind in folder `dir`, with its source:
  - `kube`: first line of `kubectl config current-context` (probe).
  - `gcp`: `CLOUDSDK_CORE_PROJECT` (env); else first line of `gcloud config get-value project` unless empty or `(unset)` (probe).
  - `aws`: `AWS_ACCESS_KEY_ID` set gives `key …` plus its last four characters (env); else `AWS_PROFILE` (env); else `default` when `<home>/.aws/config` or `<home>/.aws/credentials` exists (`$.fs.exists`), home being `USERPROFILE`, else `HOME`.
  - `tf`: `TF_WORKSPACE` (env); else the trimmed text of `<dir>/.terraform/environment` (`$.fs.read`); else `default` when `<dir>/.terraform.lock.hcl` exists.
  - `db`: `DATABASE_URL` parsed as a URL gives `<host>/<database>` (env); else `PGHOST`, with `/<PGDATABASE>` when set (env). User, password, port and query are never kept, drawn or stored.
- Segments: the command split at `&&`, `||`, `;`, `|`, a newline, `(`, `)`, `{`, `}`, `$(` and a backtick. Words are split at spaces; one pair of matching quotes around a word is removed. The head is the first word after leading `NAME=value` words and the wrappers `sudo env time command exec nohup xargs` with their `-` flags, its folder part and a final `.exe` dropped. A value is unusable when it still holds a quote, `$` or a backtick.
- Reading a command, segments in order, carrying an overlay (assignments), a folder (starts as `$.session.cwd()`) and switches:
  - `export NAME=value` or a segment of assignments alone sets the overlay for later segments; leading `NAME=value` words set it for their own segment. `cd <path>` moves the folder (relative paths joined with `/`; a path starting `~` or unusable makes `tf` not known afterwards). `kubectl config use-context X`, `terraform workspace select|new X` and `gcloud config set project X` name that kind's target for later segments.
  - A segment headed `source`, `.` or `eval`, or one holding `$env:`, makes every kind in later segments not known: `environment changed in the command`.
  - A segment headed by a tool yields one aim: a target named in the command, else the ambient target under the overlay and folder, else not known.
  - A tool name found as a whole word in a segment it does not head (`bash -c "kubectl ..."`, `grep kubectl x`) yields not known: `not a direct call`.
- Named in the command (value forms `--flag X` and `--flag=X`; an unusable value is not known: `set from a variable`):
  - `kube`: `--context` (`kubectl`), `--kube-context` (`helm`). `--kubeconfig` or `KUBECONFIG` in the overlay: not known, `another kubeconfig given`.
  - `aws`: `--endpoint-url` gives the URL's host as `aws endpoint`; else `--profile`; else overlay `AWS_ACCESS_KEY_ID`, then `AWS_PROFILE`.
  - `gcp`: `--project`; overlay `CLOUDSDK_CORE_PROJECT`. `--configuration` or `--account`: not known, `another configuration given`.
  - `tf`: overlay `TF_WORKSPACE`; `-chdir=D` moves the folder for that segment only.
  - `db`: a word, or the value of `-d`/`--dbname`, starting `postgres://` or `postgresql://` gives `<host>/<database>`; the word `$DATABASE_URL` or `${DATABASE_URL}` stands for that variable's value; else `-h`/`--host`, with `/<db>` from a plain `-d`; a word holding `host=` or `service=`: not known, `connection string given`. With none of these and no `PGHOST`: `localhost`, source `psql default`.
- Line of one aim: `Goes to <target> (<phrase>[, <source>][, changed, seen <span> ago])`, the source one of `named in the command`, `from the environment`, `psql default`, or absent for a probe, a file or `default`. Not known: `<phrase> not known: <why>`, the why one of those above or `<tool> did not answer`. A known aim whose target holds a production word, ignoring case, is written `PRODUCTION: goes to ...`. Equal lines are written once; several are joined with `; `, at most three, then ` (+<n> more)`.
- Refresh: every kind's ambient target in `$.session.cwd()`, the two probes side by side. A kind with no answer has no row. A row whose name differs from the row held before gets `since` set to now; a row seen for the first time this session, or unchanged, keeps `since` (0 when no change was seen).
## Card
Title `Aim`. Note: `prod` when a row or the last command is production; else `not known` when the last command holds a not known aim; else `<n> targets` by `plural()`; none with no rows. A row at 30 columns or more: the kind padded to five, the name cut with `…`, and at the right `changed <span>` when `since` is not 0. Under 30: `<kind> <name>` cut with `…`. A row whose name holds a production word is red. Under the rows, when a command was asked: the command on one row cut with `…`, then its line wrapped by words, red when production, yellow when not known.
```
Looking: on, before the first refresh.
│ Aim                                  │
│ Looking for targets…                 │
Empty: refreshed, none found, nothing asked.
│ Aim                                  │
│ No outside targets found here. A     │
│ kube context, cloud profile, project,│
│ workspace or database host shows     │
│ once one is set on this machine.     │
Working: at rest.
│ Aim                        4 targets │
│ kube  staging-eu                     │
│ aws   dev                            │
│ tf    default                        │
│ db    localhost/app                  │
Best moment: Claude asked to run a delete, six minutes after the context moved.
│ Aim                             prod │
│ kube  prod-eu             changed 6m │
│ aws   dev                            │
│ kubectl delete deploy api            │
│ PRODUCTION: goes to prod-eu (kube    │
│ context, changed, seen 6m ago)       │
Error: the target could not be read.
│ Aim                        not known │
│ aws   dev                            │
│ kubectl delete deploy api            │
│ kube context not known: kubectl did  │
│ not answer                           │
Busiest at 20 columns:
│ Aim         prod │
│ kube prod-eu     │
│ aws dev          │
│ gcp acme-web     │
│ tf default       │
│ db db.internal/… │
│ kubectl delete … │
│ PRODUCTION: goes │
│ to prod-eu (kube │
│ context)         │
```
## Commands
`/aim-widget [on|off|prod <word>|unprod <word>|show|clear]`, the verb matched without regard to case. Bare, `on`, `off` and the usage as in the template. A word is lowercased and must match `/^[a-z0-9._-]{2,32}$/`; anything else, and `prod` or `unprod` with no word, answers the usage. No second command, no tool.
- `prod <word>`: adds the word (at most 8; a ninth answers `Aim holds 8 production words; unprod one first.`), writes the store, answers `Production words: prod, live.` The list starts as `prod`.
- `unprod <word>`: removes it and answers the list, or `No production words.`; a word not held answers `"<word>" is not a production word.`
- `show`: the card as text, for a terminal with no card in view and for the Live run: `Targets: kube staging-eu, aws dev.` (or `No outside targets found here.`), `Production words: prod.`, and when a command was asked `Last: <command>` and its line. It runs no probe.
- `clear`: forgets the last command and every `since`; rows and words stay. `Aim cleared.`
- While off the four verbs answer `Aim is off.` and change nothing.
## Data
Verified in this build's types (`plugin-authoring/types/claude-code.d.ts`, 2.1.289; `plugins/*/.claude-plugin/types/` is absent from this checkout).
- `on('session.start')`: the template's work, restores `words`, sets `isBusy` false (a reload may have cut a refresh short), then `sync`. It runs no probe.
- `on('tool.check', { tool: 'Bash' })` and `on('tool.check', { tool: 'PowerShell' })` (`ToolCheckInput`: `tool`, `input` "`{ command }` for Bash", `tool_use_id?` "absent on a query"). If off, `return next(e)`. Else `const verdict = await next(e)`; unless `verdict.decision === 'ask'`, `e.tool_use_id` is a string and `input.command` is a string, return `verdict` itself. Read the command; with no aim return `verdict` itself, having run nothing. Otherwise resolve the aims (a probe only for a kind that is aimed at and not named; `$` waits cost the hook no budget, `HookBudget.ms` 10 000), store the fresh ambient names as a refresh would, set `last`, and return `{ ...verdict, reason }`, the reason being the line, followed by ` · ` and core's own `reason` when it had one. `ToolCheckResult.reason`: "from a hook, what the model reads on a deny and the dialog shows on an ask". The decision, `rule` and `hook` are never changed; an allow is never turned into an ask; a throw from `next` is not caught. Why `reason` and not `$.ui.notice`: `stakes-widget` writes its line with `$.ui.notice`, which the types describe as "one line under the dialog", with no word on two plugins sharing it. Aim uses the other documented place, so neither can overwrite the other, in either order: Stakes returns the verdict it was given untouched.
- `$.clock.every(ms, fn)` (`TimerCall`, `cancel()`): one timer, `every(1000, tick)`, started and cancelled in `sync`. A tick refreshes when `isBusy` is false and `at` is 0 or 30 s old: it sets `isBusy`, refreshes, sets `at` and clears `isBusy` in a `finally`. Any other tick reads state and runs nothing.
- `$.process.run(argv, init): Promise<ProcessRunResult>` ("Rejects when the command cannot start or is still running then"): at most two per refresh and one per kind per asked command. `$.env.get(name)` ("`name` must be a string literal"), `$.fs.read(path)` ("Rejects when missing"), `$.fs.exists(path)`, `$.session.cwd()`, `$.clock.now()`, `$.store.get/set`, `on('command.run', { command: 'aim-widget' })`, the three `on('ui.render')` hooks, `$.widgets.card`. Drawing reads state only.
## State and storage
- `$.state` `isOn: boolean`; `words: string[]`, default `['prod']`.
- `$.state` `aim: { at: number; isBusy: boolean; rows: AimRow[]; last: AimShot | null }`, blank `{ at: 0, isBusy: false, rows: [], last: null }`.
- `AimRow`: `{ kind: 'kube' | 'aws' | 'gcp' | 'tf' | 'db'; name: string; since: number }`. `AimShot`: `{ command: string; line: string; isProduction: boolean; isKnown: boolean }`; `command` is cut to 80 characters after every `://<anything>@` in it is rewritten `://…@`.
- `$.store` `isOn` and `words` (written only by `prod` and `unprod`). No file. Module level: the timer handle alone.
## Off
No card, no timer, no probe, no env or file read, no store write but `isOn`. `tool.check` passes straight to `next(e)` and returns what it gave. Switching off sets `aim` back to blank; the words are kept.
## Demo
`docs/engine.js` answers `env.get` for `HOME` alone, every non-git `process.run` with exit 0 and no output, and its one asked call is `git checkout`, which Aim ignores. Stand-ins needed: `kubectl config current-context` answering `staging-eu`; `env.get('AWS_PROFILE')` answering `dev`; and one scripted, asked Bash call, `kubectl --context prod-eu rollout restart deploy/api`. At rest, one clock tick after the request: `kube  staging-eu`, `aws   dev`, note `2 targets`. After the scripted turn: the same rows, the command, and in red `PRODUCTION: goes to prod-eu (kube context, named in the command)`, note `prod`. Without the stand-ins the card must draw the empty sentence, not throw.
## Live
`bun factory/tools/live.ts factory/floor/plugins/aim-widget --say "/aim-widget on" --say "/aim-widget prod example" --say 'Use Bash to run exactly this once and nothing else, then answer ok: psql -h db.example.invalid -c "select 1"' --say "/aim-widget show" --say "/aim-widget off"`
One small turn. Bash is not allowed, so core asks, the headless host refuses and nothing leaves the machine; the target is named in the command, so the run needs no tool installed. A good run: `show` answers `Last: psql -h db.example.invalid -c "select 1"` and `PRODUCTION: goes to db.example.invalid (database, named in the command)`, its `Targets:` sentence names whatever this machine has or says none were found, and the store prints `isOn` false and `words` `["prod","example"]`. No `Last:` means the check hook did not see an ask: log the verdict. A headless session opens no dialog, so the director should open one in an interactive session before this ships and see the reason in it, as was asked for Stakes.
## Cost
None: no tokens, no model call, nothing added to a prompt. While on, at most two short local commands every 30 s and at most one per kind before a dialog for a listed tool, each cut off at 3 s.
## Acceptance
Tests give `process.run`, `env.get`, `fs.read`, `fs.exists`, `session.cwd` and the clock through `ground()`'s `answers`, record every argv, and raise checks with a `tool_use_id` over a stand-in plugin that answers `ask`, `allow` or `deny`.
- A1: switched on, the card shows `Looking for targets…` and `session.start` has run no probe; after one tick with nothing found it shows the empty sentence and no note; restored off, `session.start` starts no timer and reads no env.
- A2: after a tick, a kube probe answering `staging-eu`, `AWS_PROFILE=dev`, a `.terraform/environment` holding `blue` and `DATABASE_URL=postgres://u:secret@db.internal:5432/app?sslmode=require` draw four rows, `db    db.internal/app` among them, note `4 targets`; a probe that rejects, exits 1 or prints `(unset)` makes no row; the argv are exactly those of Terms with `timeoutMs` 3000, prefixed `cmd /d /c` for a Windows cwd and bare for a POSIX one.
- A3: exactly one `$.clock.every(1000, ...)` is live however often `on` is said and off cancels it; a second refresh starts only 30 s after the last ended; a tick during a probe that never answers starts no other.
- A4: an asked `kubectl delete deploy api` runs one fresh context probe and returns the verdict's own `decision`, `rule` and `hook` with `reason` `Goes to staging-eu (kube context) · <core's reason>`, and the line alone when core gave none; an `allow`, a `deny`, a check with no `tool_use_id` and an asked `git status` return the very object `next` gave and run no probe; a throw from `next` reaches the caller.
- A5: kube: `--context prod-eu`, `--context=prod-eu`, `helm --kube-context prod-eu` and `kubectl config use-context prod-eu && kubectl get pods` say `named in the command` and run no probe; `--kubeconfig x`, `KUBECONFIG=x kubectl ...` and `--context "$CTX"` say `kube context not known` with their why, never the ambient name.
- A6: aws: `--profile prod`, `AWS_PROFILE=prod aws s3 ls` and `export AWS_PROFILE=prod; aws s3 ls` name `prod`; `--endpoint-url http://localhost:4566` gives `Goes to localhost (aws endpoint, named in the command)`; an ambient `AWS_ACCESS_KEY_ID` gives `key …` and its last four characters `from the environment`; with nothing set and a config file, `Goes to default (aws profile)`.
- A7: gcloud and terraform: `--project web`, `CLOUDSDK_CORE_PROJECT=web gcloud ...`, `gcloud config set project web && gcloud app deploy`, `TF_WORKSPACE=blue terraform apply` and `terraform workspace select blue && terraform apply` name their target; `cd infra && terraform apply` and `terraform -chdir=infra apply` read `<cwd>/infra/.terraform/environment`; `cd ~/x && terraform apply` and `gcloud --configuration x ...` are not known.
- A8: psql: a `postgresql://u:pw@h.example/app` word, `-d` with such a URL, `-h h.example -d app` and `psql "$DATABASE_URL"` with that variable set all give `h.example/app`; `psql` alone with no `PGHOST` gives `Goes to localhost (database, psql default)`; `host=h dbname=app` is not known; no password, user or port is in the reason, the state, the store or the card, and `last.command` reads `psql postgresql://…@h.example/app`.
- A9: `bash -c "kubectl delete ns x"` and `grep kubectl README.md` give `kube context not known: not a direct call`; `source .env && aws s3 ls` and a PowerShell-tool `$env:AWS_PROFILE='prod'; aws s3 ls` give `environment changed in the command`; an ambient probe that rejects gives `kubectl did not answer`, note `not known`, the line yellow; `sudo kubectl`, `/usr/local/bin/kubectl` and `kubectl.exe` are read as `kubectl`.
- A10: `kubectl apply -f a && aws s3 sync . s3://b` gives both lines joined with `; `; two equal lines are written once; a fourth is `(+1 more)`.
- A11: a row first seen has no `changed`; after a refresh that sees `staging-eu` become `prod-eu`, the row shows `changed 6m` six minutes later and an asked command's line ends `changed, seen 6m ago)`; a named target never carries it.
- A12: with the word `prod`, the row `prod-eu` is red, the note is `prod` and the line starts `PRODUCTION: goes to prod-eu`, matched without regard to case; `prod live` and `unprod prod` answer the list, change the colour at once and write `words`; the list is restored at `session.start`; a ninth word, an unknown word, `prod`, `prod a` and `prod two words` answer their sentence or the usage.
- A13: `show` answers the targets, the words and the last command with its line and runs no probe; `clear` empties `last` and every `since`, keeps rows and words and answers `Aim cleared.`; `what` answers the usage naming all six verbs.
- A14: at 20, 40 and 60 columns no row of any state is longer than the inner width, a long name and a long command are cut with `…`, the line is wrapped by words, `changed` is drawn at 40 and not at 20, and the best-moment card is the same in all three placements.
- A15: while off the four verbs answer `Aim is off.`, a `tool.check` returns what `next` gave with no probe and no env read, and no tick runs; switching off blanks `aim` and a refresh that ends afterwards writes nothing; the store never holds a key but `isOn` and `words`.
## widget.json
- title: `Aim`
- category: `Session`
- shows: `Where a command lands outside this folder: the kube context, cloud profile, Terraform workspace or database it is aimed at, named in the permission dialog`
- commands: `/aim-widget [on|off|prod <word>|unprod <word>|show|clear]`
- cost: empty
