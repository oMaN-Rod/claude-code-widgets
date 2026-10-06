# WO-0034 Earshot: inspection

Verdict: **pass**, with one hand check owed by the user before anyone leans on the timed path (finding 1).

## What was run

- `bun factory/tools/check.ts factory/floor/plugins/earshot-widget --spec ...`: PASS, 26 acceptance tests.
- `render.ts` at rest, `--turns 1`, `--turns 3`, and every verb (`on`, `off`, bare, `last`, `clear`, `LAST`, `ON `, `last 2`, `clear all`). The render engine raises no mid-turn prompt, so it only ever shows the empty state (the spec's Demo section says so; the stand-in is the clerk's). The filled frames below are the exact rows the tests assert, read against the code.
- No live run of mine: `live.txt` holds the director's two runs and was read instead.

## Frames that matter

Empty, 20 and 40 columns (rendered): wraps cleanly, says what appears and what makes it appear.

```
│ Nothing waiting  │      │ Nothing waiting to be heard.         │
│ to be heard.     │      │ Type while Claude works: this shows  │
│ Type while       │      │ when Claude got your message and     │
│ Claude works:    │      │ what it ran first.                   │
```

Best moment at 40 and 20 (A9, asserted rows): matches the spec's drawing.

```
"no, use pnpm"                    "no, use pnpm"
heard 1m 05s after you sent it    heard +1m 05s
Before it heard you:              Before that:
! Edit part-1.ts ... part-4.ts    ! part-1.ts ... part-4.ts
+2 more                           +2 more
and 1 read                        and 1 read
"which file is it" · 0s late      "whi…" · 0s late
```

Narrow sentences now fit 16: `Turn ended.`, `Nothing ran.`, `Backgrounded`, `Own turn +1m 05s` (16 exactly), `waiting · 1m 05s`. Spec note 1 is settled. Untimed card: `heard this turn` / `Wait not timed.`

## Live run (director's, live.txt)

Both runs: `on` and `off` answer as specified; `Also say pineapple.` reached the widget as a real `sdk` prompt with a `turnId`; Claude answered `done` and `pineapple` in the one turn; `last` answered the untimed sentence word for word; no `not heard`, no false span; no error from the streaming `turn.step` hook or the `tool.call` hook, both of which ran on real events; the store holds `isOn: false` and nothing else. This is the good run the spec names.

## Code read

- Every hook but `session.start`, `command.run`, `ui.render` reads the switch before any clock read or state write; `prompt.submit` reads it last in a guard that touches nothing else.
- `last` and `clear` answer `Earshot is off.` while off; no verb switches on. Unknown arguments answer usage and change nothing.
- One module-level `let` (the timer); `sync` runs after every status change, the switch, `clear`, `session.start`. Off empties `messages` and `flight`.
- `flight` is left in a `finally`, by `tool_use_id`. A string `result` is guarded before the `in` test.
- Store: `isOn` only. No file, no prompt text added, no model call.
- A message typed while a step streams is not heard by that step (mark happens only at the hook's start); first signal wins, the second changes nothing; an empty text is never matched by text.
- Tests use result shapes like the real tools (`stdout/stderr/interrupted`, `structuredPatch`, `isReadOnly`, `backgroundedToDeliverMessage`), the engine's attachment framing and a task-notification decoy. They prove their lines rather than agree with themselves. The types confirm `isReadOnly` is set for a Bash `ls`, so read-only shell commands will not be listed as changes.

## Findings

1. **The timed path has never been seen live (not a build fault).** A headless run only sends `sdk` prompts. Waiting, lateness and the list for a `composer` prompt rest on the types' "A prompt typed while a turn ran fires at Enter" and on the tests. If a real terminal raised `prompt.submit` at delivery instead, the card would say `0s late / Nothing ran before it heard you`, a false reassurance. Right looks like: the user turns it on in a terminal, types over a running 30-second command, and sees `not heard yet` count up and then a lateness near the real wait. The director has logged this as owed; it should be done before the widget is advertised.
2. **`(no text)` is cut to `(no t…` in an earlier row at 20 columns** (`quoted`, register.tsx:55). Right: a form that fits, such as `(none)`, or drop to `…`. Cosmetic, images-only messages only.
3. **`own turn` can be claimed by a later, unrelated turn** (`turn.start` hook, register.tsx:391). A `not heard` message stays matchable for the rest of the session, so a short one ("ok") that the person withdrew from the queue becomes `own turn, 12m later` when a later prompt merely contains "ok". Right: only the first `turn.start` after the miss may claim it. Rare.
4. **Two messages recorded in the same millisecond share `at` and `turnId`** (`findLastIndex`, register.tsx:333), so a rewrite or drop from the first's `next` could land on the second. Only reachable with concurrent submits; note only.
5. **A missed message with nothing run reads `Nothing ran meanwhile.`** where the spec's rule names only `Nothing ran before it heard you.` The build's wording is the correct one for a message that was never heard; kept.

None of 2 to 5 blocks: each is an edge the card survives without a wrong main number.

## Bar

Original (nothing shipped measures the engine's delivery of a mid-turn message), costs nothing, honest about what it cannot measure (remote prompts say so in plain words rather than inventing a span), and the best-moment card gives something to act on: the list of what to undo.
