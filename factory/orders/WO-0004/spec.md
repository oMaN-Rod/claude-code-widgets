# Witness (`witness-widget`)
## Purpose
For anyone who runs widgets that speak to Claude behind their back. A `prompt.submit` hook may attach `context`: text the model reads beside the prompt and the person never sees. While on, Witness records what entered with each prompt, shows the latest additions word for word on its card, keeps a running size, and prints every one in full on request. It adds nothing itself and changes no prompt.
## What is dropped from the earlier version
The second command `/witness` and its `copy` verb (one command, verb `show`); the per-source tally, which guessed a plugin's name from a text prefix the engine does not attest; the clock time of each entry; watching while switched off.
## Reading (`prompt.submit` hook)
- Off: `return next(e)` at once. `e.origin.kind` other than `composer`, `bridge` or `sdk`: `return next(e)`, nothing recorded.
- Otherwise `const entered = await next(e)`, with `e` passed as received, and the hook returns `entered` itself, the same object. A throw from `next(e)` is not caught and records nothing.
- `entered.drop !== undefined`: `last` becomes `dropped`; no count changes.
- Else `added = entered.context ?? e.context ?? []`, keeping string entries that are not empty. `PromptSubmitResult.context` is, from core, every block that arrived at the bottom, so hooks above and beneath Witness are both seen, whatever the plugin order; the fall to `e.context` covers a bottom that answers no `context`.
- `prompts` grows by 1, `additions` by `added.length`, `chars` by the summed lengths. `last` becomes `added` or `none`, `lastCount` and `lastChars` describe this prompt. Each addition is appended to `entries` as `{ prompt: prompts, text, chars }`, where `text` is the first 2,000 characters and `chars` the true length; only the last 20 entries are kept.
- Tokens are an estimate: `ceil(chars / 4)`. `tok(n)`: under 10,000 the number with `en-US` separators (`310`, `9,999`), else `floor(n / 1000)` and `k` (`12k`, `1,234k`).
## Card
Inner width is the card width less 4. Long wording at an inner width of 36 or more, short below; no long line passes 36 characters and no short line 16, except the verbatim rows, which truncate (`wrap="truncate-end"`). The empty sentence wraps. Title `Witness`. A verbatim row is one kept entry of the last prompt with every run of whitespace collapsed to one space, trimmed: at most 3 rows, then the `more` line. The two totals lines show whenever `additions > 0`.
```
Empty: `additions` is 0 and `last` is not `dropped`. No note.
│ Witness                              │
│ Nothing hidden yet.                  │
│ When a widget adds context to a      │
│ prompt, its words show here.         │
Working: `last` `none`, `additions > 0`. Note `quiet`.
│ Witness                        quiet │
│ Last prompt: nothing added           │
│ 3 additions over 5 prompts           │
│ about 310 tokens in all              │
Best moment: `last` `added`. Note `+<lastCount>`.
│ Witness                           +2 │
│ collision-widget: src/sum.js is ope… │
│ ledger-widget: 3 decisions stand: u… │
│ Last prompt: about 45 tokens         │
│ 3 additions over 5 prompts           │
│ about 310 tokens in all              │
│ /witness-widget show: all in full    │
Error: `last` `dropped`. Note `dropped`. Totals lines follow when `additions > 0`.
│ Witness                      dropped │
│ Last prompt was dropped              │
│ Nothing reached Claude               │
Busiest at 20 columns: the best moment.
│ Witness       +2 │
│ collision-widge… │
│ ledger-widget: … │
│ now ~45 tok      │
│ 3 added          │
│ all ~310 tok     │
│ show: in full    │
```
Long and short wording (`long` | `short`):
- `Last prompt: nothing added` | `nothing added`; `Last prompt: about 45 tokens` | `now ~45 tok`.
- `3 additions over 5 prompts` (`plural()` on both words) | `3 added`; `about 310 tokens in all` | `all ~310 tok`.
- More than 3 additions on the last prompt, a dim line after the rows: `and 4 more` | `+4 more`.
- `/witness-widget show: all in full` | `show: in full` (dim, best moment only).
- `Last prompt was dropped` | `prompt dropped`; `Nothing reached Claude` | `nothing sent`.
- Empty at short width: the same sentence, wrapped.
## Commands
- `/witness-widget`, `on`, `off`: the switch, with the template's answers. Unknown: `Usage: /witness-widget [on|off|show|clear]`, nothing changed. `argumentHint` `[on|off|show|clear]`.
- `show`: answers what Claude was told. With `additions` 0: `No hidden context has entered with a prompt since Witness was switched on.` Otherwise a first line `3 additions over 5 prompts, about 310 tokens in all (4 characters a token).`, then for each kept entry, oldest first, a blank line, `[prompt 5] about 30 tokens` and the entry's `text` unchanged, line breaks and all. An entry whose `chars` is over 2,000 is followed by `[cut: the first 2,000 of 12,345 characters]`. When `additions` is more than the entries kept, a last line `Only the last 20 are kept.` Off: `Witness is off.`
- `clear`: sets `log` to blank, answers `Witness cleared.`; the card returns to empty. Off: `Witness is off.`, nothing changed.
- No second command and no tool.
## Data
- `on('prompt.submit')`: reads `e.origin.kind`, `e.context`, and from `next(e)` (`PromptSubmitResult`) `drop` and `context`. Once per submitted prompt. Never rewrites `text`, `context` or `origin`.
- `on('session.start')`, `on('command.run', { command: 'witness-widget' })`, the three `on('ui.render')` hooks, `$.command.register`, `$.store.get`, `$.store.set`, `$.widgets.card`: from the template.
- No `$.clock`, no `$.ui.copy`, no `$.session` call, no file read.
## State and storage
- `$.state` `isOn: boolean`.
- `$.state` `log: { prompts: number; additions: number; chars: number; last: 'none' | 'added' | 'dropped'; lastCount: number; lastChars: number; entries: { prompt: number; text: string; chars: number }[] }`. Blank: zeros, `last` `none`, no entries.
- `$.store` `isOn`. No files, no timers (no `sync`). Nothing collected is kept across sessions: it is a record of this session's prompts.
## Off
The `prompt.submit` hook returns `next(e)` at once and reads nothing; no card; `show` and `clear` answer `Witness is off.` Switching off sets `log` to blank, so switching on again starts from the empty card.
## Demo
The engine's `prompt.submit` bottom answers `{ text }` only, and Witness shows nothing unless some other mod attaches context. Stand-ins needed: the bottom answers `{ text: e.text, context: e.context }`; and, when no context-adding widget is switched on in the page, a stand-in hook beneath Witness that attaches one block on each scripted prompt, `collision-widget: src/sum.js is also open in another session; read it again before you edit.` At rest: the empty card. After the scripted turn: the best moment, note `+1`, that line as the verbatim row, `Last prompt: about 21 tokens`, `1 addition over 1 prompt`.
## Cost
None: no model call, nothing added to a prompt, nothing written but the switch.
## Acceptance
How the tests prove these: the kit's bottom `prompt.submit` answers `{ text }` with no `context`. A stand-in plugin listed before the widget (above it) attaches with `next({ ...e, context: [...(e.context ?? []), block] })`; one listed after it (beneath) attaches the same way and answers `{ ...(await next(...)), context }` as core does, or answers `{ drop }`. `log` is proven through the card and the answer of `show`.
- A1: on with no prompt yet, and on after prompts that carried no context, the card says `Nothing hidden yet.` and what will appear, with no note; a restored switch at `session.start` gives the same card.
- A2: a prompt to which a stand-in above attaches one block and a stand-in beneath attaches another gives the note `+2`, both blocks as verbatim rows in the order they entered, `Last prompt: about <t> tokens`, `2 additions over 1 prompt` and `about <t> tokens in all`, with `<t>` equal to `ceil(chars / 4)` of the two blocks together; with only the stand-in above and the kit's bottom (no `context` in the answer) the block is still recorded, once.
- A3: after A2's prompt, a prompt with no context gives the note `quiet`, `Last prompt: nothing added` and the totals `2 additions over 2 prompts`, with no verbatim row; a third prompt with one block reads `+1`, shows only that block as a row, and the totals read `3 additions over 3 prompts`.
- A4: the hook calls `next` with the `e` it received (the kit's `contexts` holds exactly what the stand-ins attached, nothing of the widget's) and returns the very object `next(e)` resolved to; a throw from `next(e)` reaches the caller and the card does not change.
- A5: when a stand-in beneath answers `{ drop: 'blocked' }`, the hook returns that answer, the card shows the note `dropped`, `Last prompt was dropped` and `Nothing reached Claude`, the totals are as they were before, and the next prompt that enters replaces the dropped card.
- A6: prompts with `origin.kind` `composer`, `bridge` and `sdk` are each recorded; prompts with kind `task-notification`, `scheduled-trigger`, `peer` and `plugin` reach `next(e)` unchanged and leave the card and the totals as they were.
- A7: `show` with nothing recorded answers `No hidden context has entered with a prompt since Witness was switched on.`; after three additions over two prompts it answers the summary line, then each entry oldest first under `[prompt <n>] about <t> tokens`, with a block of several lines and a tab returned character for character.
- A8: a block of 12,345 characters is counted as 12,345 in the totals, held as its first 2,000, and `show` prints those 2,000 followed by `[cut: the first 2,000 of 12,345 characters]`; after 25 additions `show` lists 20 entries, the oldest five absent, the summary line still says `25 additions`, and the last line is `Only the last 20 are kept.`
- A9: a prompt with five blocks shows three rows and `and 2 more` (short: `+2 more`) under the note `+5`; a block holding line breaks and runs of spaces is one row with single spaces; a 300-character block is one row, truncated, on a card whose every other line stays within the inner width.
- A10: `clear` after additions answers `Witness cleared.` and the card and `show` read as with nothing recorded; switching off and on again does the same; while off, `show` and `clear` each answer `Witness is off.`, leave the switch off and write nothing.
- A11: while off, a prompt with attached context returns exactly what `next(e)` returns, and after switching on the card is empty: nothing from the off period was recorded.
- A12: an unknown verb (`copy` included) answers `Usage: /witness-widget [on|off|show|clear]` and changes neither the switch nor the log; `session.start` registers one command, `witness-widget`, and no command named `witness`.
- A13: with totals of 12,345 additions, 6,789 prompts and 4,938,270 characters (`about 1,234k tokens in all`, short `all ~1,234k tok`), every state (empty, working, best moment with a `more` line, dropped with totals) at 20 and at 39 columns uses the short wording with no line but a verbatim row over 16 characters, and at 40 and 60 columns the long wording with no such line over 36; `tok` reads 310 as `310`, 9,999 as `9,999`, 10,000 as `10k` and 1,234,567 as `1,234k`; one addition over one prompt reads `1 addition over 1 prompt`.
- A14: the card is the same in the `side`, `above` and `below` placements after an addition, and is absent from the two placements the layout's `site` does not name.
## widget.json
- title: `Witness`
- category: `Session`
- shows: `Every line of hidden context the other widgets add to your prompts, word for word, with a running size`
- commands: `/witness-widget [on|off|show|clear]`
- cost: empty
