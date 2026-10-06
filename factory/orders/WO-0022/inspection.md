# Inspection: WO-0022 Aim (`aim-widget`), fourth inspection

**Verdict: pass.** Judged within the director's ruling of 13:16: (a) every finding of inspections one to
three stays fixed, (b) the live run is good, (c) a plain command, with its flags, quoting, continuation and
substitution, names the right target or says not known. No commonly written one-line shape for kubectl, helm,
aws, gcloud, terraform or psql was found that names the ambient target in place of the one given. Five rarer
shapes are noted below; by the ruling they do not send the order back.

## What was checked

- Checker: `PASS aim-widget meets the standard.`
- Render at rest, `--turns 3`, `--wait 2500` and every verb at 20, 40 and 60: `Looking for targets…`, then the
  empty sentence wrapped by words, no cut or broken line. `PROD Live`, `CLEAR`, `prod a`, `prod two words`,
  `prod`, `show extra`, `on now`, `unprod nope`, a ninth word and the four verbs while off each answer as the
  spec says. `show` before the first refresh now says `Looking for targets…`, as the card does.
- The filled frames (A14, which feeds probes and env the renderer cannot) match the spec's drawings:

  ```
  │ Aim                             prod │      │ Aim         prod │
  │ kube  prod-eu             changed 6m │      │ kube prod-eu     │
  │ aws   dev                            │      │ aws dev          │
  │ kubectl delete deploy api            │      │ kubectl delete … │
  │ PRODUCTION: goes to prod-eu (kube    │      │ PRODUCTION: goes │
  │ context, changed, seen 6m ago)       │      │ to prod-eu (kube │
  ```

- `hooks/register.tsx`: both `tool.check` hooks read `isOn` before anything else; allow, deny and a check with
  no `tool_use_id` return the verdict object itself; `aimed` reads `isOn` again before it writes; one timer,
  started and cancelled in `sync`; off blanks `aim`; `session.start` reads no env and runs no probe; the store
  is written only as `isOn` and `words`. Credentials are cut from `last.command` (URL user and password,
  `NAME=secret`, `--token x`, `--password x`).
- About 230 command lines replayed through the widget's own `shotsOf` (a scratch copy outside the repo), Bash
  and PowerShell:
  - Inspection one (psql `-hHOST`, `PGSERVICE`, `pushd`/`Set-Location`, subshell scope, `unset`/`env -u`,
    `--cluster`/`--server`, a setter under `-chdir`, heredoc bodies, comments): all still right.
  - Inspection two (Bash `\` and PowerShell backtick continuation over two and three lines, a leading
    assignment continued, `aws eks update-kubeconfig`, `get-credentials`, `kubectx`, `configurations
    activate`): all still right.
  - Inspection three (`$( )`, backticks and `<( )` mid-command, `jsonpath={.x}`, `xargs -I{}`, `pod/{a,b}`,
    `--set a={x,y}`, `--query R[].{id:Id}`, `\"` and `\;`, setters inside a subshell): all now name the given
    target or `another kubeconfig given`.
  - Plain commands: flags before and after the verb, `=` and space forms, single and double quotes, JSON
    payloads, `jq` filters, pipes, redirections, `2>&1`, `for`/`if` lines, `time`, `sudo`, `env`, `exec --`,
    psql URL, `-h`/`-d`, positional database, `-Atc`, `$DATABASE_URL`, an unknown variable. Each gives the
    named target, the ambient one where nothing is named, or not known. `watch`, `timeout`, `ssh`, `docker
    exec`, `aws-vault exec`, `doppler run` give `not a direct call`; `git commit -m "... kubectl ..."`,
    `cat helm/values.yaml` and `cd terraform && ls` give no line.
- Live run (`live.txt`, made by the director at 13:16 on this build): good. Core asked, the reason read
  `PRODUCTION: goes to db.example.invalid (database, named in the command) · This command requires approval`,
  `show` printed `Last:` and the line, nothing errored, and the store holds `isOn: false` and
  `words: ["prod","example"]` only.

## Findings

None that sends the order back.

## Notes (rarer shapes, for the next time this widget is on the bench)

1. **`-chdir` on both sides of a workspace change** (`stepOf`, `isAside`, line 389).
   `terraform -chdir=infra workspace select prod && terraform -chdir=infra apply` reads
   `infra/.terraform/environment` for the apply and so names the workspace held before the select. Right:
   remember the chosen workspace by folder, so the same `-chdir` folder names `prod`. The `cd infra && ...`
   form already reads right. This is the note most worth fixing: it can miss a PRODUCTION mark.
2. **`kubectl ctx prod && kubectl get po`** (`mootOf`, line 305): the krew form of `kubectx` is not seen as
   repointing, so the second call names the old context. Right: `context changed in the command`.
3. **`psql "${DATABASE_URL}?sslmode=require"`** (`direct`, line 351): a word with `=` is not taken as the
   database, so the line says `localhost (database, psql default)`. Right: a positional word holding `$` is
   `set from a variable`, as `psql "$DB_URL"` already is.
4. **`gcloud compute ssh vm -- cmd --project x`**: a `--project` after `--` belongs to the remote command but
   is read as gcloud's. kubectl and helm already stop at `--`; gcloud should too.
5. **A needless second line.** `aws ecr get-login-password --profile prod | docker login --username AWS ...`
   gives the right `prod` and then `aws profile not known: not a direct call`, because the mention match
   ignores case; the card turns yellow for the usual ECR login. `command -v aws && aws s3 ls --profile prod`
   adds an ambient line for the `command -v`. Right: match a mentioned tool with its case, and give no aim to
   `command -v` or `which`.
6. Still open from the spec: nobody has seen the reason inside a real permission dialog. A headless run
   cannot show it; one look in an interactive session before or just after shipping.
