# Skimmed

`skimmed-widget`

## What it shows

The parts of Claude's replies that were never in your viewport, and the caveats hiding in them.

- At rest: `all shown`, or one small bar of rows shown against rows written this session.
- Best moment: you come back to a 160-line reply, read the last paragraph and start typing. The card says `2 caveats never on screen` and quotes them in full: `"Note: the two integration tests were skipped because..."`. You read the sentence on the card, where you are already looking.
- Pressing a quoted line scrolls the transcript to the message that holds it. `show` lists every unshown caveat of the session; `clear` forgets the coverage.
- Outside the fullscreen layout the engine does not report the viewport. The card then says so in one line and claims nothing.

The card makes one claim only, and it is a fact: these rows were never on screen. It does not claim that anything on screen was read.

## Why it is remarkable

Every widget in the catalog watches Claude. This is the first that watches what the person saw. The sentence "I did not run the migration" is always in the reply; the failure is that nobody scrolled to it. No shipped or waiting widget reads `onScreen` (a search of `plugins/` and the floor finds no use of it).

Closest existing widgets, and what this adds:

- `gist-widget` (waiting) summarises a reply with a model. This uses no model and is about the reader, not the reply: it shows only what you missed, word for word.
- `owed-widget` (waiting) lists questions Claude asked. This lists statements, and only the ones you never saw.
- `premise-widget` quotes gaps from the thinking summary. This reads the reply itself and needs no setting.
- `landmarks-widget` scrolls to moments of the session. This borrows its scroll call and nothing else.

## The API it needs

All checked in the types file (`plugin-authoring/types/claude-code.d.ts`, engine 2.1.289).

- `ui.render` with `{ component: 'AssistantMessage' }`, observing only: the hook returns `next(e)` untouched. It reads `e.props.onScreen` (`first`, `last`, `of`, in rows; `null` while drawn outside the viewport; absent where the surface does not say), `e.props.text` and `e.requestId`. `onScreen` is read-only: a rewrite that changes or drops it is refused.
- `$.clock.now()` to time how long a row span stayed on screen.
- `$.state` for per-message row coverage.
- `$.ui.scroll({ to: { requestId }, block: 'start' })`, as `landmarks-widget` calls it (`plugins/landmarks-widget/hooks/register.tsx` line 138). A transcript row is revealed only while the plugin answers the person's own input, so the scroll must come from a press or a command, and the widget must handle the `deny` answer.
- `turn.complete` to settle a reply's final row count.
- `$.widgets.card` for the card.

## Cost

No tokens, no model call, nothing added to any prompt. One extra render hook on every assistant text block, so it must do constant work per draw and never invalidate the transcript itself. Attention: one quiet line, which speaks only when an unshown passage holds a caveat.

## Risks the designer must settle

1. Prove the signal first. Before any design, confirm in a fullscreen session that `onScreen` arrives for `AssistantMessage` and changes on scroll. If it does not, send the order back; there is no widget without it.
2. Rows to text. `onScreen` counts laid-out rows (row 0 is the blank row above the message), and `text` is markdown that wraps with the viewport width. Decide how a caveat sentence maps to a row range, and err towards calling a passage shown when the mapping is unsure. A false "never on screen" is the one error that kills trust in the card.
3. Streaming. While a reply streams the viewport follows it, so every row passes through the screen. Decide the minimum time on screen for a row to count as shown, and state that threshold on the card or in `show`, so the claim stays a fact ("on screen under 1s") and not a guess about reading.
4. Edge-only reports. On a scroll the terminal reports only the messages at the viewport's edges. A message between two reports keeps its last state; a message jumped over in one scroll never reports and is correctly unshown. Check both cases by hand.
5. Scroll lands on a message, not a passage. `$.ui.scroll` takes a `requestId` or one of the plugin's own keys, never a row. That is why the card quotes the caveat in full: the quote is the feature, the scroll is a convenience. Do not rewrite the message drawing to plant keys.
6. The caveat list. A fixed word list ("did not", "skipped", "failed", "could not", "note that", "not yet", "unable") will match noise. Keep it short, match whole sentences, cap the card at the two or three most recent, and drop a caveat the moment its rows are shown.
7. Screen rows that are shown later. Coverage must update as the person scrolls back, so the card clears itself without a command.
8. Off must be inert: no hook work, no state kept, when switched off.
