# Earshot

`earshot-widget`

## What it shows

For every message typed while Claude is working: whether Claude has it yet, how long it waited, and the tool calls Claude made between your Enter and the request that first carried your words.

- At rest: one dim line, "nothing waiting to be heard".
- Waiting: `'no, use pnpm' - waiting 41s behind Bash: bun test`.
- Heard: `heard at step 7, 48s late. Before it heard you: Edit package.json, Bash npm install, Bash git commit`.
- Two cases nobody knows exist: a long command the engine pushed to the background so the message could get through, and a message that never made it into the turn and ran as its own turn afterwards.

Sharpening (same idea, tighter): in the "before it heard you" list, calls that change something (Edit, Write, NotebookEdit, Bash) come first and are marked; reads and searches collapse to a count. The list exists to answer "is there something to undo", so the card should answer that at a glance. It states only when Claude was told, never whether it obeyed.

## Why it is remarkable

Typing "stop, don't commit" over a running turn is the most anxious moment in the product: the message is queued, the transcript keeps moving, and nothing says whether Claude heard you before or after it did the thing. People reconstruct this by scrolling. The card settles it on the spot, from measurements only.

Closest existing widgets and what this adds:

- `queue-widget`: prompts the person lines up to run back to back while away. Earshot is about the engine's own mid-turn queue and the moment of delivery, which queue-widget never observes.
- `earpiece-widget`: notes sent to subagents. Different direction and no delivery timing.
- `landmarks-widget`, `activity-widget`, `timeline-widget`: list what happened, but none relates tool calls to the moment a typed message reached the model.

No shipped or waiting widget hooks `prompt.attachment`.

## API it needs

Checked in `types/claude-code.d.ts` (2.1.289):

- `prompt.submit`: `e.turnId` is present when the prompt was typed over a running turn; `e.wait`; `e.origin` (composer, bridge). Marks the Enter.
- `prompt.attachment`: fires once per injected message "as a request carries it"; a prompt delivered into a running turn is one of these (origin kind `engine`). `queued_command` is named in the types as an attachment type but is not in `PromptAttachmentDetailOf`, so it arrives as an undeclared input: `type` string, `text`, `origin`, `agentId?`, no `detail`. That is the moment of hearing.
- `turn.step`: `e.turnId`, `e.index` for the step number.
- `tool.call`: the calls between the two timestamps; the Bash result's `backgroundedToDeliverMessage?: boolean`.
- `turn.start`, `turn.complete`: a message that outlived its turn.
- `$.clock.every`, `$.ui.invalidate('ui.render')`, `$.state`.

Every hook observes and returns `next(e)` unchanged.

## Cost

No tokens, no model call, nothing added to any prompt. One card line per mid-turn message this session; a one-second redraw only while a message is still waiting.

## Risks the designer must settle

1. Does `prompt.attachment` fire with type `queued_command` for a typed mid-turn prompt on this build, and what does `e.text` look like (raw text, or the engine's framing around it)? The whole widget rests on this. Confirm it first, with `claude plugin test` or by reading the bundled docs; a live session in the user's repository needs the user's yes first. If the hook does not fire, fall back to the `turn.step` request's messages, or send the order back.
2. Matching a submit to its attachment: identical messages sent twice, pastes expanded, messages with images, several messages delivered in one request. Match in order, not by text alone.
3. `prompt.attachment` answers are cached per attachment and asked again on resume or invalidation. Count each delivery once, and never invalidate `prompt.attachment`.
4. Subagents: ignore attachments with `e.agentId`; main loop only.
5. Origins: count the person's own Enter (composer, bridge). Decide about notifications and peer messages; a plugin's `$.prompt.submit` has no `turnId` and is out.
6. Endings: the turn is interrupted or aborted while a message waits; a slash command typed mid-turn; a message that becomes its own turn. Each needs a plain, true line rather than a stuck "waiting".
7. Wording: "heard" means "a request carried it", nothing more. No claim about obedience.
8. The card quotes the person's message: truncate it, keep it in `$.state` only, and cap the list.
9. The name sits close to `earpiece-widget`; the README row must make the difference plain in its first words.
