# Provenance (`provenance-widget`)

## What it shows

For the lines Claude is reading or about to edit, or a `path:line` the person selects: the conversation that wrote them. One entry is the date, the person's prompt quoted word for word, and the command that resumes that session.

- At rest: how many of this repository's commits lead back to a saved conversation (for example "41 of 230 commits trace to a conversation").
- Best moment: Claude is about to rewrite a function and the card reads: these lines were written three weeks ago after you said "never retry on a 401, it locks accounts".

## Why it is remarkable

Git blame stops at a commit message. This goes one step further, to what the person asked for. Nothing shipped or waiting joins code to the conversation that produced it.

Closest existing widgets and what this adds:

- `commits-widget` lists this session's commits. It has no link to prompts and no history.
- `ledger-widget` reads saved sessions, but only for cost.
- `resume-widget` (waiting) shows the last session in the folder, not the session behind a given line.
- `loupe-widget` says what a selected hash or path is, not who asked for it.

## Sharpened by the examiner

1. Backfill from saved sessions, so it works in the first minute. A saved transcript already holds each `git commit` Bash call and its output (`[branch abc1234] message`). A `scan` verb reads the project's saved sessions, as `ledger-widget` does, and builds the commit -> session map from history. Live recording only keeps the map current.
2. Quote the prompt that caused the edit, not the prompt that caused the commit. The prompt before a commit is often "commit this". Walk back in the transcript from the commit to the Edit or Write of that file, then to the user prompt before that edit.
3. The `attribution.text` trailer (`Claude-Session: <id>` in every commit) is out of the first build. It writes into history teammates read, and the map does not need it. The designer may propose it as a later verb, off by default.

## API it needs (all present in `claude-code.d.ts`)

- `tool.call` on Bash to see a `git commit` and record commit -> session; `$.session.id()`.
- `tool.call` on Read and Edit for the file and lines in play; `$.ui.selection()` for a selected `path:line`.
- `$.process.run(['git','blame','--porcelain','-L', ...])` and `git rev-parse` / `git rev-list --count`, by argv, with a short timeout.
- `$.fs.list` and `$.fs.read` on the saved sessions under `CLAUDE_CONFIG_DIR/projects` or `~/.claude/projects` (the path logic in `plugins/ledger-widget/hooks/register.tsx:189-226`), `$.env.get`.
- `$.fs.write` under `$.plugin.root` for the map; `$.ui.copy` for `claude --resume <id>`.
- `command.run`, `ui.render`, `$.state`, `$.store`.

Nothing here was run live.

## Cost

No model call and nothing added to the context. One `git blame` per lookup, only while on. One scan of saved sessions on request, which reads large files and must be bounded.

## Risks the designer must settle

- Saved-session format is not a typed contract. Parse defensively; a session that cannot be read yields date and session id only, and the card says so.
- Commits that moved: rebase, amend and squash change hashes. Decide the fallback (match on author date plus subject, or report "no conversation found") and never guess a prompt.
- Lines not written by Claude, or written in a session since deleted (sessions are cleaned up after a retention period): the card must say "no conversation on record", not stay silent in a way that reads as broken.
- Which prompt to quote when an edit followed several prompts, and how to cut a long prompt to card size without changing its meaning.
- Lookup timing: blame on every Read is too much. Settle the trigger (Edit only, plus selection, plus a `look <path:line>` verb) and a debounce.
- Scan size: cap files and bytes per scan, cache per session file by size and mtime.
- Privacy: quoted prompts may come from another worktree of the same project. Keep lookups to this repository's sessions, and keep the map out of the repository.
- Windows paths: blame paths and transcript paths differ in slashes and drive-letter case.
- Live tests leave no trace: do not run a live session in the person's repository without asking.
