# Premise

`premise-widget`

## What it shows

The assumptions Claude made in its thinking this turn and did not say in its reply, quoted word for word from the live thinking stream.

- While a turn runs: assumptions appear on the card as Claude thinks them.
- When the turn ends: any assumption the visible reply states is dropped. What is left is what Claude took for granted in silence.
- At rest, three different states that must never be confused:
  - "No unspoken assumptions this turn" (thinking was seen, nothing matched or everything was said aloud).
  - "No thinking was shown this turn" (no `thinking` chunks arrived, so the card knows nothing).
  - Before the first turn: a line saying assumptions appear here while Claude thinks.
- Best moment: a long turn ends with a confident summary and the card holds "assuming the migration has already been run", which it had not.
- `/premise-widget fix <n>` fills the prompt box with `You assumed: "<quote>". That is wrong: ` for the person to finish. Nothing is sent for them.
- `/premise-widget [on|off|show|fix <n>|clear]`.

## Why it is remarkable

No shipped or waiting widget reads what Claude thinks. The closest are:

- `owed-widget`: questions Claude asked aloud. Premise catches what was never said.
- `parking-widget` and `confidence-widget`: need Claude to call a tool. Premise needs no cooperation from the model.
- `footnotes-widget`: checks the reply against the working tree. Premise checks the reply against the thinking.
- `stream-widget`: the only widget on `turn.step`, and it reads only the length of the chunks.

The silent assumption is the commonest cause of a turn that looks right and is wrong, and it is already written down in a stream that scrolls past and is gone. This is the thing a person tells a colleague: "it showed me what Claude assumed and did not tell me".

## Sharpening (examiner)

The idea stands or falls on precision. A card that lists every sentence with "likely" in it is noise and will be turned off in a day.

- Match commitment phrases, not hedges. Keep: "I'll assume", "assuming", "I assume", "presumably", "I'll guess", "without checking", "should be safe to", "probably means", "I'll take it that", "let's assume". Do not match bare "likely", "probably" or "should".
- Show at most three per turn, the most recent kept last; `show` lists the rest.
- One assumption is one sentence, trimmed to the card's width with the full text in `show`.
- Main loop only: skip steps that carry `agentId`.

## API it needs

All checked in the types file (`plugin-authoring/types/claude-code.d.ts`):

- `on('turn.step', async function* ($, e, next) { ... })`: iterate `next(e)`, yield every chunk unchanged, read `TurnStepThinkingChunk` (`kind: 'thinking'`, `index`, `text`) and `TurnStepTextChunk` (`kind: 'text'`, `index`, `text`). `plugins/stream-widget/hooks/register.tsx` is the working precedent for the pass-through generator.
- `TurnStepInput.agentId` (absent on the main loop) and `turnId`, `index`.
- `turn.start` and `turn.complete` to open and settle the list.
- `$.prompt.fill` for `fix`.
- `$.state` for the list, `$.store` for the on/off switch only.
- `$.widgets.card` to draw.
- No `$.model`, no `$.fs`, no `$.process`.

## Cost

- Tokens: none. No model call, nothing added to any prompt.
- Time: a string match per streamed chunk; every chunk is yielded on at once and never held back.
- Attention: one small card, empty on most turns.
- Privacy: quotes of the thinking live in `$.state` for the session only and are never written to the store or to disk.

## Risks the designer must settle

1. Thin or absent thinking. The chunk is "what the person sees of it live": with summarised thinking the text is a paraphrase and with thinking off there is none. The card must tell the three rest states apart, and the design must say plainly in the README row or notes that it sees only the thinking the session shows. Do not start a live session to measure this in the user's repo without asking; design from the types and test with simulated chunks.
2. Sentence assembly. Chunks split mid-word and mid-sentence. Buffer per block `index` per step, cut on sentence ends, flush the remainder when the block or step ends, and reset on a retried step so a retry does not list an assumption twice.
3. "Said in the reply". Decide the rule for dropping an assumption the reply states: it must be simple, testable and err towards keeping (for example, drop when the reply shares the assumption's key content words, not on any single word). Text from every step of the turn counts as the reply, not only the last step.
4. Assumptions Claude then checked. "Assuming X" followed by a tool call that verifies X is not a silent assumption. Either settle a cheap rule (for example, drop when later thinking in the same turn retracts it with "confirmed", "it is", "so it does") or state honestly on the card that these are assumptions made, not assumptions left unverified. Do not add a model call to decide.
5. The stream must never suffer. An exception in the matcher must not break the generator: catch inside the loop and always yield the chunk. Off means `return yield* next(e)` untouched.
6. Two widgets on `turn.step`. Confirm Premise and `stream-widget` chain cleanly when both are on.
7. `fix` quoting. A quote containing double quotes or newlines must fill the prompt box as one clean line.
