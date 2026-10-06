# Aim

`aim-widget`, command `/aim-widget [on|off|prod <word>|unprod <word>|show|clear]`

## What it shows

Where a command would land outside this folder, read before it runs: the Kubernetes context, the cloud account and project, the Docker context, the Terraform workspace and the database host that are active right now.

- At rest: a quiet list of the targets found on this machine, one row each, such as `kube staging-eu`, `aws 4821 dev`, `tf default`, `db localhost`. A tool that is not installed has no row. With none found: `No outside targets found here`.
- At its best: Claude asks to run `kubectl delete`, `terraform apply` or a migration, and the permission dialog carries one extra line: `This goes to prod-eu (kube context, changed 6 minutes ago)`. The row on the card turns red for any target whose name matches a production word the person set with `/aim-widget prod <word>`.
- For a command that reaches no outside target: nothing. No line, no change.

## Why it is remarkable

The repository is the same on every machine. What differs, and what people forget, is where the shell is pointed. The classic disaster is a correct command sent to the wrong cluster, and the person answering a permission dialog has no way to see the target without leaving the dialog to look it up.

Closest existing widget: `stakes-widget`, which writes what a yes would lose under the dialog, measured from git. Aim uses the same place in the dialog and measures something stakes cannot: not what is lost inside the repository but where the command goes outside it. `footprint-widget` (waiting) records outside effects after they happened; `situation-widget` (waiting) tells Claude about git state. No shipped or waiting widget reads a cluster, cloud, Docker, Terraform or database target.

The line a person would say to a colleague: "it told me in the dialog that the migration was going to prod".

## API it needs

All checked in the types file (`plugin-authoring` skill, `types/claude-code.d.ts`).

- `on('tool.check', { tool: 'Bash' })`: take `next(e)`'s verdict and, only when `decision` is `ask`, return it with a `reason` naming the target. `ToolCheckResult.reason` is documented as what the dialog shows on an ask. `stakes-widget` does exactly this (`plugins/stakes-widget/hooks/register.tsx`).
- `$.process.run` for `kubectl config current-context`, `docker context show`, `terraform workspace show`, `gcloud config get-value project`, each skipped when the tool is absent and each under a short timeout.
- `$.env.get` for `AWS_PROFILE`, `KUBECONFIG`, `DATABASE_URL`, `PGHOST` and the like.
- `$.fs.read` for `~/.kube/config` and `~/.aws/config` as the fallback when the tool is absent.
- `$.clock.every` in `sync` for a slow refresh of the resting card.
- `$.store` for the production words; `$.state` for the targets and when each last changed.

## Cost

No tokens and nothing added to any prompt. A handful of short local commands on a slow timer, and again when a matching command reaches a permission check, which adds a fraction of a second before that dialog. Attention: one extra line in the dialog for commands that leave the machine, and silence for everything else.

## Risks the designer must settle

1. **A wrong target is worse than no target.** The command itself can name where it goes: `kubectl --context prod`, `--kubeconfig`, `-n`, `aws --profile`, `AWS_PROFILE=prod aws ...`, `terraform workspace select x && terraform apply`, `psql <url>`, `cd other && terraform apply` (the workspace is per directory). The line must report the target the command names when it names one, the ambient target otherwise, and say `target not known` when it cannot tell. It must never print a reassuring ambient target for a command that overrides it. Decide the parser's reach and test each override.
2. **Whose environment.** `$.env.get` reads the environment the plugin sees; Claude's Bash tool runs a shell initialised from the person's profile, which may set `AWS_PROFILE` or `KUBECONFIG` differently. Measure whether they agree. Where they can differ, read the value by `$.process.run` through the same shell, or label the row as the session's environment.
3. **Which commands count.** A fixed, documented list of commands that leave the machine (`kubectl`, `helm`, `terraform`, `aws`, `gcloud`, `az`, `docker` with a remote context, `psql`, `mysql`, migration runners that read `DATABASE_URL`). Everything else gets no line. Do not guess at arbitrary scripts.
4. **Sharing the dialog with stakes-widget.** Both add a `reason` to an ask. Settle how the two lines combine when both are on, so neither overwrites the other.
5. **Only asks are annotated.** A command the person's rules allow outright shows no dialog and so no line. The card must not imply it guards those. Do not turn an allow into an ask in this version: that is `vows-widget` and `fence-widget` territory.
6. **Secrets.** `DATABASE_URL` holds a password. Show the host and database name only; never store or draw the full value. Show an AWS account by profile name and the last four digits at most.
7. **Speed and absence.** Each probe needs a timeout and must fail to silence; `terraform workspace show` and `gcloud` can be slow. A probe that times out before the dialog must give `target not known`, not hold the dialog.
8. **"Changed 6 minutes ago".** The widget only knows of a change it saw on its timer. Say `changed since <time>` only for a change the widget observed this session; say nothing otherwise.
9. **Windows.** Home is `USERPROFILE`, tools may be `.exe` or `.cmd`; the fallback file paths must resolve on all three platforms.
