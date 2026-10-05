# Squiggle

`squiggle-widget`, work order WO-0013.

## What it shows

A spellchecker for file names, working inside the prompt box while the person types.

A word in the draft that is written as a path (it contains a slash, or ends in a file extension the project uses) is checked against the tracked files. One that exists is painted green. One that matches nothing gets a red underline. The card beside the prompt lists each one: what a green word resolves to, and for a red one the nearest real name.

- At rest: `Type a file name in your prompt: it lights up if it exists`.
- At its best: the person types `fix auth-midleware.ts`, the word is underlined in red before Enter, and the card reads `auth-midleware.ts  no such file, nearest: src/auth-middleware.ts`.

Nothing is added to the prompt and nothing is sent to Claude. The widget only paints and reports.

## Why it is remarkable

- Closest existing widget: `footnotes-widget`, which checks the paths in Claude's reply after the turn. Squiggle checks the person's paths before the turn, which is the only moment a misnamed file costs nothing to fix.
- `preflight-widget` (waiting) reads the prompt at submit and prints a checklist. Squiggle is live, is about one thing, and draws in the draft itself.
- No shipped or waiting widget draws inside the prompt box. `prompt.edit` and `PromptDecoration` are used by nothing in the catalog. This is the first widget a person sees without looking away from what they are typing.
- It is the kind of thing a person shows a colleague: "it underlines file names that do not exist, as I type".

The earlier round (WO-0009) kept Squiggle as its strongest runner-up and left two objections. This order answers both by narrowing, not by adding:

1. "Picking out which typed words are meant as file names will misfire." Only path-shaped words are candidates: a slash, or a known extension. Bare words, branch names and symbols are never painted. The word the cursor is still inside is never painted red, so nothing is called wrong while it is half typed.
2. "@-completion already covers the path case." A path taken from @-completion is right by construction and simply shows green. The misses come from paths typed or pasted by hand, from memory, a stack trace or a chat message, which is where the wasted turn comes from.

## API it needs

All checked against `plugin-authoring/types/claude-code.d.ts`.

- `on('prompt.edit')`: the input is the draft before the edit plus the splice (`start`, `end`, `inputText`). `await next(e)` resolves to the box after the edit (`PromptBox`: `text`, `cursor`). The hook returns `{ ...r, decorations: [...(r.decorations ?? []), ...mine] }` (`PromptEditResult`).
- `PromptDecoration`: `start`, `end` in UTF-16 code units into the answer's own `text`, with `color`, `underline` and the other `TextProps` picks.
- `$.prompt.read()` for the first card when switched on with a draft already in the box.
- `$.process.run('git ls-files')` for the index, `$.fs.list` as the fallback outside a repository.
- `on('tool.call')` on Write, Edit and Bash to mark the index stale; `on('prompt.submit')` to clear the card's list.
- `$.session.cwd` / `$.session.repo`, `$.state`, `$.widgets.card`.

## Cost

- Tokens: none. No model call, nothing added to any prompt.
- Processes: one `git ls-files` when switched on and one after a turn that wrote files.
- Per keystroke: a set lookup for each path-shaped word, and a nearest-name search only for a word that missed.
- Attention: colour in the prompt box, which is the point. No toasts.
- Off: the hook returns `next(e)` untouched, runs no process and paints nothing.

## Risks the designer must settle

1. **Typing must never lag.** The hook sits in the path of every edit. The index has to be in memory before the hook needs it; the hook must not run a process or read a file. Decide the cap on the nearest-name search (basenames only, a length window, a hard limit on candidates) and what happens in a repository of 100,000 files.
2. **Offsets.** Decorations index the text `next(e)` returned, not `e.text`. Another plugin's hook may have rewritten the box, so compute from the answer and keep any decorations already on it.
3. **Stale paint.** Decorations stay until the next edit's answer. After Claude creates or deletes a file the draft may show an old verdict until a key is pressed. Say what the card shows meanwhile; do not use `$.prompt.fill` to force a repaint if it would move the cursor.
4. **Switched on mid-draft.** `prompt.edit` cannot paint until the next key. The card can list at once from `$.prompt.read()`; the paint follows on the first edit. State this in the spec so it is not reported as a fault.
5. **What counts as a path.** Settle the exact rule and test it: `src/x.ts`, `x.ts`, `./x.ts`, `x.ts:42`, a Windows `src\x.ts`, a trailing full stop or bracket, a URL (never a path), a version number such as `2.1.0` (never a path), a glob, a path to a file the person is asking Claude to create.
6. **New files.** "Create src/new.ts" is a miss by design. Red must read as "not there yet", not as an error: the card line should say `no such file` and offer the nearest name only when one is close. Consider whether a miss with no near name should be underlined at all.
7. **Untracked and ignored files.** `git ls-files` leaves them out. Decide whether to add `--others --exclude-standard`, and whether a miss falls back to one `$.fs.exists` outside the hook.
8. **Colour alone.** Green against red fails for some people and some themes; the red case already has the underline, so make sure the two differ by more than hue, and use theme colour names.
9. **The demo page.** `docs/engine.js` has no `prompt.edit`. The widget must start and show its resting card there, and the smoke run will say what the stand-in lacks.
10. **A fix verb.** The earlier round imagined correcting a miss in place. That is optional: only add `/squiggle-widget fix` if `$.prompt.fill` can replace the draft without surprising the person, and never rewrite the draft unasked.
