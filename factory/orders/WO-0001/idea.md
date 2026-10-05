# Sieve

`sieve-widget`

## What it shows

A compaction that keeps every word you and Claude said and drops only the tool traffic, with a standing preview of what the conversation would shrink to.

- At rest: `142k in context: about 23k conversation, 119k tool traffic. A sieve leaves about 31k.`
- Best moment: `Sieved 142k to 31k. All 18 of your messages kept. No summary written, no tokens spent.`
- When it steps aside: `Sieve would not free enough (118k left): the usual summary ran.`

## Why it is remarkable

Compaction is the moment a long session forgets, and every widget near it only watches (forecast, boss, weather, epitaph), retells chosen facts afterwards (anchor) or trims results on the way in (diet, hogs). Nothing replaces the compactor. Sieve does: the person's prompts and Claude's text answers stand verbatim, each run of tool calls folds into one built line, and no model request is made. Compaction stops being amnesia, and it is free. That is a sentence a person repeats to a colleague.

The closest existing widget is `anchor-widget`. Anchor re-tells facts the person pinned by hand after a summary has already replaced the conversation; Sieve keeps the conversation itself, so there is nothing to pin.

## Sharpened

- Keep the working tail whole. The tool calls of the turn in progress (and the last finished turn) stay with their handles, results included, so an automatic compaction mid-task does not strip what Claude is reading right now. Only older tool traffic is folded.
- A `/compact <instructions>` is a request for a summary on the person's terms: pass it to `next(e)` untouched. Sieve answers `auto`, `plugin` and a bare `/compact`.
- Never make a compaction worse than the engine's. If the sieved result is not comfortably under the window (a threshold the designer sets), call `next(e)` and say so on the card.

## The API it needs

All checked in `plugins/widgets/.claude-plugin/types/claude-code/index.d.ts`.

- `on("session.compact")` (line 4231). Input `SessionCompactInput` (10252): `trigger` (`manual`, `auto`, `plugin`, `precompute`), `agentId`, `instructions`, `messages` each carrying `handle`. Result `SessionCompacted` (10213): `{ messages }`, where "a message with the engine's `handle` stands as the engine has it; one without is built from its `role`, `text` and tool blocks". Or `{ skip }`, or fall through with `next(e)`.
- `SessionMessage` (10591): `role`, `text`, `toolUses` (`ToolUseSummary`, 12510), `toolResults`, `handle`. These supply the digest line with no model call.
- `$.session.messages()` and `$.session.usage({ breakdown })` (2744) for the preview at rest; `session.measure` to refresh it after each turn.
- `$.session.compact()` (trigger `plugin`) behind a `now` verb.
- `$.state`, `$.store`, `$.command.register`, `$.widgets.card` as usual.

No shipped or waiting widget uses `session.compact` as anything but an observer.

## Cost

No model calls: it removes the summarizer request a normal compaction makes. The price is that Claude loses tool output it had read and may read a file again; the digest names every file and command so it knows where to look. The first request after a sieve rewrites the prompt cache, exactly as any compaction does. Attention: one line when a compaction happens.

## Risks the designer must settle

1. Mixed assistant messages. A message holding both text and `tool_use` cannot keep its handle once its results are dropped. It must be rebuilt without a handle from `text` alone. Prove with realistic messages that the rebuilt list is a valid conversation: no `tool_use` without its `tool_result`, no orphan `tool_result`, roles alternate acceptably, no empty messages.
2. Where the digest line lives. It needs a role. Folding it into the rebuilt assistant message as text puts words in Claude's mouth; a built user message may read as the person speaking. Choose, mark the line clearly as written by the widget, and test it.
3. What a handle-less message loses. A person's message with an image or attachment must keep its handle; only messages that are pure tool traffic may be rebuilt or dropped. Thinking blocks on rebuilt assistant messages are lost: confirm the engine accepts that.
4. Token figures are estimates. `SessionMessage` carries no token counts, so the conversation and tool split is derived from text length against the measured total. Every such figure on the card reads "about".
5. `precompute` and `agentId`. Decide whether Sieve answers a precompute (its result is kept for the next compaction) or passes it on; pass subagent and fork transcripts to `next(e)` unless there is a reason not to.
6. Other hooks on the chain. `anchor-widget` and `epitaph-widget` observe compaction through `next(e)`; a hook that answers without calling `next` may hide the event from hooks below it. Check the order and that they still see a sieved compaction.
7. Repeated sieves. The second compaction meets digest lines from the first. They must be kept as text, not folded again or counted as the person's messages.
8. Off means off: with the widget off the hook must fall straight through to `next(e)`.
9. No live run in the person's own session may trigger a real compaction; test in the isolated run.
