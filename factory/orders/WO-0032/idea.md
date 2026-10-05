# Rehearsal

`rehearsal-widget`

## What it shows

Which of the commands and edits Claude has needed in this project would stop and ask for permission right now. The widget keeps one real example of each kind of tool call Claude has made in this folder, across sessions, and puts each to the engine's own permission check as a query: no dialog opens and nothing runs.

- At rest, all clear: `Would run: 41 of 41 calls seen here`.
- When something would stop, those lines lead the card: `Would stop and ask: 3 of 41`, then `bun install`, `git push origin`, `Write ..\shared\config.json`, each with the rule or reason the engine gave.
- `show` lists every remembered call with its verdict and rule; `forget <n>` drops one; `clear` empties the project's list.

The answer changes live: switch to accept-edits or plan mode, or add an allow rule, and the lines move.

## Why it is remarkable

The commonest way a long turn is wasted is walking away and finding it stalled forty seconds in on a prompt. guard-widget counts what you were asked after the fact. Nothing shipped or waiting answers the question before the turn. This one does, from the engine's real decision and not from a reading of settings.json, and it names the rule that decided. It is the thing a person checks before going to lunch, and tells a colleague about.

Closest existing widget: guard-widget (allowed, asked and denied this session, after the fact). Rehearsal adds the forecast: the verdict on calls that have not happened yet, per project, rechecked when the mode or rules change.

## The API it needs

All verified in `types/claude-code.d.ts` (plugin-authoring skill, 2.1.289).

- `$.tool.check({ tool, input })` resolves `{ decision, reason?, rule? }`. The doc comment: "nothing runs, no dialog opens, no PreToolUse hook or classifier is asked". No shipped widget calls it.
- `on('tool.call')` to collect calls: tool name plus input. Group by a shape (Bash or PowerShell: the command head, such as `git push`; file tools: inside the project, outside it, or a dotfile) and keep one real example per shape, since a check needs a real input.
- `$.store` for the per-project list, keyed as the other per-folder widgets key theirs.
- `on('classic.ConfigChange')` (source, file_path) to recheck when settings change; `on('classic.PermissionRequest')` to learn what really asked.
- `$.settings.read()` if the card shows the permissions block beside a verdict.
- `$.clock.after` to debounce the recheck.

Other widgets' `tool.check` hooks run on a query, with no `tool_use_id`. guard-widget, stakes-widget and customs-widget all return early when it is absent, so a rehearsal does not inflate guard's counts, write a stakes notice or start a registry lookup. The widget's own frame is skipped.

## Cost

No tokens, no model call, nothing added to the prompt. A capped batch of local permission queries at session start and on a mode or settings change. One small store entry per project. One line at rest.

## Risks the designer must settle

1. **Mode changes.** `classic.ConfigChange` covers settings files, not a Shift+Tab mode switch. Find what signals a mode change, or recheck at `prompt.submit` and when a turn ends. The claim "changes live" depends on this.
2. **What `ask` means per mode.** `ask` "puts it to the mode's decider". In auto mode the classifier decides and is not consulted by a query, so `ask` is not a dialog there; in bypass mode nothing asks. The card must say what it cannot know in those modes and never print "would stop" for a call the classifier would settle. Confirm in a fixture what a query returns in each mode.
3. **Honest wording.** "Would run" means the rules allow it; PreToolUse settings hooks are not asked. The count is of calls seen here, not of what Claude will do next. No "safe to leave" on the card.
4. **Secrets on disk.** A stored example command can hold a token or password. Store the shape and a scrubbed example, or keep full inputs in session state only and persist heads and path classes. Decide and say so in the cost line.
5. **Shape grouping.** `git push` and `git push --force` may get different verdicts; the head must be fine enough to be true and coarse enough to cap (a few dozen shapes, oldest unused dropped).
6. **Compound commands.** A stored `cd x && bun test` checks as a whole; decide whether to store whole commands or heads, and show what was actually checked.
7. **Stale paths.** A remembered Write to a file since deleted should still check or be dropped silently, not error.
8. **Empty state.** A first session in a project has nothing to rehearse: the card says so and fills as the turn runs.
9. **Windows.** Both Bash and PowerShell calls occur here; treat them alike.
