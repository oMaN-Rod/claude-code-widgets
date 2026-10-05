# Earpiece

`earpiece-widget`

## What it shows

One row for every subagent running in this session: its number, its task description, the tool it is on, and the last sentence it wrote. `/whisper <number> <text>` puts a note into that one subagent's own conversation, which it reads at its next step. The row marks the whisper as sent, then as heard once the agent's next message arrives.

At rest the card says "no agents running". When an agent finishes, its row stays dimmed with its last line until the turn ends.

## Why it is remarkable

Subagents are a black box: a spinner and a tool count until they report back. The only way to correct one that has misread its brief is to interrupt the whole turn and lose the others' work.

The best moment: three agents are running, agent 2's row reads "now rewriting the tests folder", the person types `/whisper 2 leave tests alone`, and agent 2's next line changes course while the other two and the main turn carry on.

Closest widgets and what this adds:

- `race-widget` counts each subagent's tool calls as strides. It never reads what an agent wrote and cannot reach one.
- `sessions-widget` lists other sessions and `/relay` sends a line to one. It does not see agents inside this session.
- `aquarium-widget` draws a fish per running agent, nothing more.

Earpiece is the first widget to read inside a subagent while it runs and the first to steer one. No shipped widget calls `$.agent.list`, `$.session.append`, or `$.session.messages` with an `agentId`.

## API it needs

All present in the types file (`plugin-authoring/types/claude-code.d.ts`).

- `$.agent.list()` returns `AgentInfo[]`: `id`, `description`, `type`, `status`, `parentId`, `name`. The roster.
- `$.session.messages({ agentId })` returns that agent's `SessionMessage[]` (`role`, `text`, `toolUses`), or `{ deny }` for an agent the session cannot read. The last line and current tool.
- `on('tool.call')` and `on('turn.complete')` carry `agentId` for a subagent's loop: the refresh triggers. A slow `$.clock.every`, started and stopped in `sync`, covers long gaps while any agent runs.
- `$.session.append({ agentId, message: { type: 'user', content: [{ type: 'text', text }] } })`: a user-role row joins the running subagent's conversation. Documented as refused, with a reason, for an id that names no running loop.
- `$.command.register({ name: 'whisper', immediate: true })`: the command runs mid-turn instead of waiting for the turn to end.
- Fallback for the whisper: `$.session.send({ to: { agentId }, text })`, whose own doc example is "stop after this file".

## Cost

No model calls. Reading costs no tokens. A whisper adds its few words to one subagent's context and nothing to the main conversation. The card moves only while subagents run.

## Risks the designer must settle

1. Whether an `immediate` command's hook can call `$.session.append` with an `agentId` while the main turn waits on the Agent tool. The docs warn that an immediate hook must not assume the turn's state. If append is refused there, use `$.session.send`; if both are, the idea does not stand and the order goes back.
2. When the agent reads the whisper. The types say the row joins the conversation; they do not promise it is in the very next request. The card must say "sent" and "heard" from what it observes, never promise timing.
3. Numbering. Agents start and finish while the person types. Numbers must stay fixed for the turn and never be reused, so `/whisper 2` cannot land on a different agent.
4. Agents the session cannot read or reach: a teammate in its own terminal pane returns `{ deny }`, and an idle teammate is not a running loop. Show them as such or leave them out; do not show an empty row.
5. Nested agents (`parentId`): indent them or list them flat, within the card's width.
6. Fitting a card: one line per agent, the sentence cut to the width, and a cap with "+N more" for a large fan-out.
7. How the whisper is framed to the agent, so it reads as a note from the person and not as a tool result or an injected instruction it should distrust. `witness-widget` should be able to show it.
8. Refresh load with many agents: `session.messages` returns up to 4096 entries per agent, so read on events and throttle, not on every tick.
