# Inspection: WO-0004 Witness (`witness-widget`)

Verdict: **pass**.

## Checker

`bun factory/tools/check.ts factory/floor/plugins/witness-widget --spec factory/floor/orders/WO-0004/spec.md` answers `PASS  witness-widget meets the standard.` The 14 acceptance tests and the five standard tests run inside it.

## Frames

`render.ts` loads the widget alone, so nothing attaches context and `--turns 1` and `--turns 3` both stay on the empty card. That is correct for the widget, and the empty card matches the spec at 20, 40 and 60 columns (the sentence wraps to 6 lines at 20, no cut).

To see the other states I rendered a copy in the scratchpad with a stand-in hook beneath it attaching blocks (2, then none, then 5, one of them a 100-character word with no spaces and one holding tabs and line breaks). The floor copy was not touched.

```
╭──────────────────╮   ╭──────────────────────────────────────╮
│ Witness       +5 │   │ Witness                           +5 │
│ collision-widge… │   │ collision-widget: src/sum.js is als… │
│ ledger-widget: … │   │ ledger-widget: 3 decisions stand: 1… │
│ parking-widget:… │   │ parking-widget: 2 ideas are parked … │
│ +2 more          │   │ and 2 more                           │
│ now ~92 tok      │   │ Last prompt: about 92 tokens         │
│ 7 added          │   │ 7 additions over 3 prompts           │
│ all ~136 tok     │   │ about 136 tokens in all              │
│ show: in full    │   │ /witness-widget show: all in full    │
╰──────────────────╯   ╰──────────────────────────────────────╯
╭──────────────────╮   ╭──────────────────────────────────────╮
│ Witness    quiet │   │ Witness                        quiet │
│ nothing added    │   │ Last prompt: nothing added           │
│ 2 added          │   │ 2 additions over 2 prompts           │
│ all ~45 tok      │   │ about 45 tokens in all               │
╰──────────────────╯   ╰──────────────────────────────────────╯
```

Each frame matches the spec's drawing line for line. No line wraps or breaks the border, the multi-line block is one row with single spaces, plurals are right (`1 addition over 1 prompt` in A13), and the 60-column card stays at 40 as the standard asks.

## Code and tests

- `prompt.submit` returns `next(e)` at once while off or for a non-person origin, passes `e` on as received, returns the same object, catches nothing, and checks the switch again after `next` resolves, so switching off mid-prompt records nothing.
- Spec notes 2 to 7 are all settled: an absent origin counts as the person's prompt and A6 covers it; whitespace-only blocks are not counted (A9); the `more` line counts from `lastCount` (A9, 24 blocks); `+12,345` fits beside the title (A13); entry headings use the true length (A8); a dropped prompt takes no number (A5). Note 1: the build follows the rule, 23 tokens.
- `show` and `clear` answer `Witness is off.` while off and never switch on. No timer, no file, the store holds only `isOn`. No module-level `let`.
- The tests use realistic blocks, stand-ins above and beneath as the spec lays out, and assert whole cards and whole `show` answers rather than fragments. A13 really drives 12,345 additions over 6,789 prompts.

## Trying to break it

`show all`, `COPY`, `reset` answer the usage and change nothing; `  SHOW  ` is read as `show`; `off` removes the card and wipes the log; a 100-character unbroken word truncates on its row.

## Live run

`bun factory/tools/live.ts factory/floor/plugins/witness-widget --say "/witness-widget on" --say "Reply with the single word: ok" --say "/witness-widget show" --say "/witness-widget copy" --say "/witness-widget off" --say "/witness-widget show"`

- `on`: `Witness on; /widgets places it.` The real prompt went through the hook and the turn answered `ok`, no error.
- `show`: `No hidden context has entered with a prompt since Witness was switched on.` `copy`: the usage line. `off`: `Witness off.` `show` while off: `Witness is off.`
- Store after the run: `{ "isOn": false }` and nothing else.

What the live run could not show: a real block reaching the card. `live.ts` loads only the layout and this widget, and neither attaches context, so the recorded path is proven by the tests and by the types file (`PromptSubmitResult.context`: "from core, the context that arrived"), not by a real session. See finding 1.

## Findings

None blocks the pass.

1. Live proof of the main path (for the director, not the machinist). The widget's whole job is reading context another plugin attached, and the live tool cannot load a second plugin. Right looks like: one live run with a context-adding widget beside it (collision or ledger) before or soon after shipping, checking that the card reads `+1` and `show` prints the block. This needs a change to `live.ts` or a director's run; I did not work around the tool.
2. `hooks/register.tsx` `draw`, rows of the last prompt: when one prompt carries more than 20 additions, only the last 20 are kept, so the three rows are additions 5 to 7 of 24, not 1 to 3, while the line under them reads `and 21 more`. A9 asserts this as it is. Right would be the first three, or the last three; it takes more than 20 blocks on one prompt to see it.
3. Token figures per prompt do not sum to the total (45 and 92 on the card above, `136` in all) because each is rounded up on its own. The wording says `about`, and the spec defines both by `ceil(chars / 4)`, so this is to the spec; mentioned so nobody files it as a bug.
4. `tests/widget.test.tsx` A4: the throw is made by breaking the kit's `contexts.push`, and the assertion matches the engine's message `no implementation for prompt.submit`. It does prove the throw reaches the caller and the card is unchanged, but it leans on a kit detail and would be clearer with a stand-in beneath that throws its own error.

## The bar

Functional: yes. Original: no shipped widget shows what the others whisper to the model, and it gains value with every context-adding widget that ships. Enjoyable: the card is quiet until something happens, then says exactly what and how much, and `show` gives the full text. It drops the earlier version's guessed sources and second command, and its tests cover off, restore, placements and narrow widths, which was the brief.
