# Amendments

`amendments-widget`

## What it shows

What changed in the instructions Claude Code gives Claude since the last release: the system prompt sections and the built-in tools' descriptions that were added, dropped or rewritten, with the before and after one verb away.

- At rest: `14 sections, 31 tools, unchanged for 9 days (since 2.1.287)`.
- First session ever: `Baseline taken at 2.1.289: the next update is compared with this`. It never invents a change on the first run.
- Best moment, the first session after an update that moved something: a short list such as `tone: rewritten, +212 characters`, `new section: <id>`, `Bash description: 3 lines fewer`, each row numbered.
- `show <n>` prints that row's before and after as a line diff in the command output. `show` alone lists the amendments of the latest update; `clear` forgets the snapshots and takes a new baseline.

## Why it is remarkable

Every Claude Code update quietly rewrites what Claude is told, and nobody publishes that changelog. "Claude feels different today" is said in every team and answered with superstition; this card answers it with the text that changed.

Closest existing widgets, and what this adds:

- `witness-widget` shows what the other widgets add to a prompt. It never reads the engine's own system prompt.
- `context-widget` shows sizes by category. It shows no text and no change over time.

No shipped or waiting widget reads the system prompt or a tool description, and none compares one release with another.

## The API it needs

All checked in the types file (`plugin-authoring/types/claude-code.d.ts`, engine 2.1.289).

- `prompt.compose`: `next(e)` resolves `{ sections }`, each `{ id, text, scope }`. The hook returns the answer unchanged. The input carries `model`, `promptModel`, `tools`, `outputStyle` and `traits`.
- `tool.describe`: fires once per tool per session; the input carries `tool`, `description`, `isDeferred`, `provider`. The hook returns `next(e)` unchanged.
- `$.session.version()`: `version`, `base`, `builtAt`, to key a snapshot.
- `$.fs.read` and `$.fs.write` under `$.plugin.root` for the snapshots (too large for `$.store`); `$.store` for the switch only.
- `$.widgets.card` for the card; `command.run` for `show`.

Neither event is hooked by a shipped widget.

## Cost

No model call and nothing added to the context. Both hooks return the engine's own answer, so the prompt cache is not spent. One snapshot per engine version and composition on disk, tens of kilobytes each. Attention: silent until an update changes something.

## Risks the designer must settle

1. **Release change against your change.** Only `shared`-scope sections and tools whose provider is the engine belong in the release diff: the types say `shared` text reads the same for everyone on a build and model. `session` sections (memory, environment) and plugin or MCP tools are either left out or shown apart as "yours", so a CLAUDE.md edit is never reported as an amendment.
2. **The snapshot key.** Section ids and text depend on the composition: `promptModel`, `traits` (`lean`, `bare`), `outputStyle`, and possibly the offered `tools`. Compare only like with like, and decide what the card says when the model or output style changed but the version did not. Establish whether subagent prompts also raise `prompt.compose`, and keep them out of the main prompt's snapshot if they do.
3. **Other plugins in the chain.** `next(e)` returns what the hooks beneath this one answered, so another plugin that rewrites a section or a tool description could be reported as a release change. Settle how to tell the engine's text from a rewritten one, or say so on the card.
4. **Tools not seen yet.** `tool.describe` fires when a tool's schema is first rendered. A tool not described this session is not "dropped"; report a tool as removed only on evidence that holds up, and compare descriptions only for tools seen under both versions.
5. **False changes inside shared text.** Confirm on a real session that no shared section carries a date, a path or another value that varies between sessions of one build; if one does, normalise it or exclude that section.
6. **Which version to compare with.** The previous version this machine ran, not the previous release: say so ("since 2.1.287"), and decide how many versions to keep and what a downgrade shows.
7. **The diff on a card.** The card carries only the list of amended ids with a size; the text goes through `show`. Pick a line diff small enough to write in the module and readable in command output for a long section.
8. **Testing without live sessions.** The whole comparison must be provable in the plugin's tests with two fabricated snapshots; no live session that flips the user's switches.
