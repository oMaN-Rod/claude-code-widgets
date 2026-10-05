# Footnotes

`footnotes-widget`

## What it shows

Every file path, `path:line` and code symbol Claude named in its last reply, each checked against the working tree: found, no such file, line past the end of the file, or symbol not found anywhere in the repository.

- At rest: "No reply checked yet: file and symbol names in Claude's replies are checked here."
- Typical: "7 named, 7 found" on one line, nothing else.
- Best moment: Claude writes that the handler at `src/routes/login.ts:88` calls `refreshSession()`, and the card reads "refreshSession: not found in this repository" and "login.ts:88: file has 61 lines", before the person has acted on an invented reference. A button on each failed row puts a correction in the prompt box for the person to send or discard.

## Why it is remarkable

Nothing in the catalog checks an explanation. proof-widget, calibration-widget and confidence-widget judge edits and "it is fixed" claims against check runs; critic-widget reads diffs with a model. The closest is calibration-widget, and Footnotes adds what it cannot do: it checks the references in prose, on turns where nothing was edited and no check ran, which is when the person has only Claude's word.

It uses no model, so its verdicts are facts and not a second opinion. "It caught Claude citing a function that does not exist" is something a person tells a colleague.

## API it needs

All checked in `plugins/widgets/.claude-plugin/types/claude-code/index.d.ts`.

- `turn.complete`: `answer` is the assistant's final visible text of the turn (TurnCompleteFields), `agentId` is absent on the main loop, `isAborted` marks an interrupt. This is enough; `$.session.messages` is not needed.
- `$.fs.exists`, `$.fs.stat`, `$.fs.read` for a path and its line count.
- `$.process.run` for `git ls-files` and `git grep`; `$.session.repo()` returns null outside a repository.
- `$.prompt.fill({ text, mode })` from a Button's `onPress`. No shipped widget uses it.
- `$.state` for the last reply's list; nothing needs `$.store` beyond the on/off switch.
- `/footnotes-widget [on|off|clear]`.

## Cost

No tokens, no model calls, nothing added to the context unless the person sends the filled correction. Process runs after each main-thread reply, capped at 20 references a reply. Attention: one quiet line when everything is found, one coloured line per reference that is not.

## Sharpened from the proposal

- Read the reply from `turn.complete`'s `answer`, not from the session messages.
- Check all symbols of a reply in one `git grep` with a `-e` per symbol (`-w -F -o -h`, plus `--untracked`), then see which symbols came back, instead of one process per symbol.
- Three verdicts only, each one a fact: found, missing, line out of range. No "probably".

## Risks the designer must settle

1. False "not found" is the failure that kills the widget: one wrong red line and the person stops trusting it. The extraction rule must be closed. Proposed: a backticked token counts as a path only if it has a slash or a known file extension; as a symbol only if it looks like an identifier with a call, a dot, camelCase or an underscore (`refreshSession()`, `user.id`, `MAX_RETRIES`). Plain words, shell commands, flags, package names and keywords are left out, not guessed.
2. Symbols that live outside the repository (library and built-in functions such as `JSON.parse` or `useState`). `git grep` finds them only if the project calls them. Decide: a symbol is reported missing only when no part of it appears anywhere, and the wording is "not found in this repository", never "does not exist".
3. Paths Claude proposes to create ("I would add `src/retry.ts`"). They do not exist and are not errors. Decide how to tell them apart, or word the row as "not on disk" in a neutral colour unless a line number was cited.
4. Path resolution: a bare `login.ts` or a path relative to a subfolder. Resolve against the session folder, then the repository root, then a unique suffix match in `git ls-files`; an ambiguous name is left out.
5. Ignored and untracked files, and no repository at all: paths still check through `$.fs`; symbols are skipped with a plain note, not marked missing.
6. Code inside fenced blocks is new or quoted code, not a claim about the tree: skip fenced blocks, check inline backticks only.
7. Subagent turns (`agentId` present), aborted turns and empty answers are skipped.
8. Whether the tally also goes beneath the answer through `turn.complete`'s result is optional; verify that behaviour in the types before relying on it.
