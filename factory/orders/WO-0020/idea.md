# Loupe

`loupe-widget`, command `/loupe-widget [on|off|look|copy]`

## What it shows

Drag the mouse across anything in the transcript and the card says what it is, worked out locally with no model.

- At rest: `Select anything in the transcript`. Outside the fullscreen layout: `Needs the fullscreen layout (/tui fullscreen)`, since the engine reports no selection there.
- A commit hash (7 to 40 hex characters that git resolves): subject, author, how long ago, files changed.
- A path (resolved against the session root, then cwd): exists or missing, size, age, last commit that touched it.
- An identifier: where it is defined (`path:line`), and how many files mention it.
- A 10 or 13 digit number in a plausible range: the date and how long ago.
- A small set of pure decodes: `#rrggbb` as a swatch, a cron line in words, a JWT's claims and expiry, an exit code or HTTP status.
- When the selection lies in one tool call's row, a last line says where it came from: `from Bash, 4m ago`.
- Anything it does not recognise: the length and line count only, never a guess.

Best moment: Claude says the bug is in `fit()`, the person drags across the word, and the card shows `hooks/lib.ts:41`, the signature and `37 call sites`, with a button that copies `path:line`. Or: a hash buried in a wall of test output becomes `a3f9c1e Fix retry backoff, 2 days ago, you` before they have thought to ask.

## Why it is remarkable

It gives the terminal a hover. No widget of the 77 shipped or the 68 waiting knows what the person is looking at: `$.ui.selection` is unused everywhere. The gesture people already make to copy something now answers the question that would otherwise cost a second shell or a turn. It adds nothing to the conversation, spends no tokens and changes only when the person points at something.

Closest existing widgets, and what Loupe adds:

- `footnotes-widget` checks the paths and symbols of Claude's last reply for existence only, and on its own schedule. Loupe answers about whatever the person points at, anywhere in the transcript including tool output, and says what the thing is rather than whether it exists.
- `aside-widget` answers a typed question with a model call. Loupe needs no typing and no model.
- `squiggle-widget` resolves file names in the draft. Loupe reads the transcript, not the prompt box.

## The API it needs

All checked in the types file (`plugin-authoring/types/claude-code.d.ts`, 2.1.289).

- `$.ui.selection(): Promise<UiSelection | undefined>`, `UiSelection = { text, requestId? }`. `undefined` with nothing selected and with fullscreen off, in `-p`, or on a surface that reports none. `requestId` is the tool call's `tool_use_id` when the selection lies inside one row; absent when it spans rows or lies outside the transcript.
- There is no selection event. Poll from `$.clock.every(ms, fn)` inside `sync` while the widget is on; `/loupe-widget look` reads once on demand.
- `$.process.run(argv)` for `git rev-parse --verify`, `git show -s --format`, `git show --stat`, `git log -1 -- <path>`, `git grep -n` / `git grep -c`.
- `$.fs.exists`, `$.fs.stat` for paths.
- `on('tool.call')` to remember `tool_use_id` to tool name and time, for the `from Bash, 4m ago` line.
- `$.ui.copy({ text, surface })` from a Button `onPress` (pass `press.surface`), and from the `copy` verb; show `{ isCopied: false, reason }` on the card.
- `$.session.root` / `$.session.cwd`, `$.state`, `$.store` for the switch, `$.widgets.card`, `$.widgets.picture` for the swatch.

## Cost

No tokens, no model call, nothing added to any prompt. While on: one selection read a few times a second, and at most two or three short git or fs lookups per distinct selection, none while the selection is unchanged or empty. Attention: none unless the person selects something.

## Risks the designer must settle

1. **The selection is untrusted text.** It can be anything on screen, including tool output written by someone else. It must only ever be passed as an argv element to `$.process.run`, never through a shell, and after `--` or validated by pattern first (hex only for a hash, no leading `-` for a path or symbol). Paths that resolve outside the session root get `exists` and nothing more; no file contents are read onto the card.
2. **Polling must stay cheap and quiet.** Fix the interval (suggest 250 to 400 ms), stop the timer when the widget is off, and skip the poll while a lookup is in flight. One lookup per distinct selection, with a timeout on every process; a late answer for a selection that has since changed is dropped.
3. **Selection lingers.** The engine keeps answering the last selection until the next prompt or command has run. Decide when the card returns to rest so it does not show a stale answer as if it were current.
4. **Classifier order and false positives.** `deadbeef` is hex and a word; `1759612800` is an epoch and could be an id; a short identifier may match thousands of lines. Settle the order (verify a hash with git before calling it one), cap `git grep` (fixed-string, word match, bounded output) and say `no definition found` rather than listing mentions as definitions. Defining "where it is defined" without a language server needs a stated rule (declaration patterns for the common languages) and an honest fallback to the mention count.
5. **Scope.** The inventors listed ports, base64 and byte counts as well. Ship the kinds that are right nearly always (hash, path, symbol, epoch, colour, cron, JWT, status code); drop the port owner (`netstat`/`lsof` differ per platform and are slow on Windows) unless it can be made reliable on all three. A JWT's payload is shown as claim names and expiry only, never the signature, and never written to the store.
6. **Fits a card.** At most four or five lines at 40 columns; long subjects and paths are cut in the middle, with the full value on the copy button.
7. **Not a git repository.** Hash and symbol lookups degrade to a plain statement; paths and the pure decodes still work.
8. **Demo page.** `docs/engine.js` has no `ui.selection`; the stand-in needs a way to select text, or the demo needs the `look` verb with a sample, or `site/smoke.ts` will flag it.
9. **Live testing.** Mouse selection can only be verified in a real fullscreen session; per the standing rule, ask the owner before any live session and leave no trace.
