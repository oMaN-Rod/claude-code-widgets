# Inspection: WO-0021 Premise (`premise-widget`), third inspection

Verdict: **pass**, with two things the director must do before it ships (findings 1 and 2). The build matches the spec, the checker passes, and the director's live run produced what the last two inspections asked for: one numbered quote, true against its reply.

## What was checked

- Checker: `PASS premise-widget meets the standard.`
- `render.ts` at rest, `--turns 1`, `--turns 3` and with `show`, `SHOW`, `fix`, `fix 0`, `fix 1`, `fix 1 2`, `fix 1.5`, `clear`, `what`, `on show`, at 20, 40 and 60. Every answer is as specified (usage for the malformed ones, `No assumption <n>...` for the absent ones). Only two states draw on the bench, because `docs/engine.js` raises no `turn.step` (finding 1):

```
at rest, 40                                   after any turn, 20
│ Premise                              │      │ Premise          │
│ What Claude takes for granted in its │      │ No thinking text │
│ thinking and does not say appears    │      │ reached this     │
│ here while it thinks.                │      │ card.            │
                                              │ /premise-widget  │
                                              │ show says why.   │
```

- Item frames, from the widget's own `premise`, `stated`, `itemRows`, `drawn` and `wrapped` in a scratch copy, with the live run's quote and hostile values (a Windows path, a 300-letter word, 5 items, the red row taking 1 and 3 rows):

```
inner 36, the live quote                       inner 16, 5 items
│ Premise                   1 unspoken │      │ Premise        5 │
│ 1 I'll go with nginx on systemd for  │      │ 3 I'll default   │
│   the command                        │      │   to pg_dump     │
                                              │ 4 I'll use       │
                                              │   C:\Users\O\ve… │
                                              │ 5 I'll           │
                                              │   xxxxxxxxxxxxx… │
                                              │ +2 earlier       │
```

  No row is over the inner width; long values cut with `…`; with the red row the oldest drawn item gives way and the total stays at 7.
- `hooks/register.tsx`: `turn.start`, `turn.step` and `turn.complete` read the switch before any work; verbs answer `Premise is off.` and never switch on; no timer, no module-level `let`; the store gets `isOn` only; each chunk is yielded before the next is read and `stream.result` is returned; `amend` and now `opening` re-read the switch; the step's end work is in `finally` under its own guard. The notes of the last inspection are taken up: `e.g.`, `i.e.`, `etc.`, `vs.` no longer end a sentence, `best guess` is matched as a phrase, `didn't` is dropped whole from content words, both JSON files carry the 198-character sentence.
- Tests: 15, one per acceptance line, chunk shapes as the types give them, pass-through hooks above and below, a rejected state write, a throwing bottom. They prove their lines.

## What the live run showed (`live.txt`, made by the director)

```
>>> ...only a cron line that backs up my database every night...
0 2 * * * pg_dump -U postgres mydb | gzip > /var/backups/mydb_$(date +\%F).sql.gz
>>> /premise-widget show
The thinking shown words nothing as an assumption.
Premise reads only the summary of the thinking, ... Claude may have assumed more than that.
>>> /premise-widget fix 1
No assumption 1. /premise-widget show lists them.
>>> ...only the command that restarts my web server...
sudo systemctl restart nginx
>>> /premise-widget show
Premise: 1 assumption in the thinking shown that the reply does not flag. Claude may have checked them since.
1. "The web server isn't specified, but since cron was mentioned earlier, this is likely a Linux server, so I'll go with nginx on systemd for the command."
--- store: { "isOn": false }
```

- The quote is true: the prompt named no web server, the reply is a bare `systemctl restart nginx` that mentions neither nginx-as-a-guess nor systemd. This is the widget doing its job on a real event.
- The cron turn is a miss, for the second run in a row on the prompt the spec opens with. The answer to it is now honest: it claims only what was read and says Claude may have assumed more. A miss, not a lie.
- Commands answer as specified, both replies arrive whole, no `show` is the WHY sentence or `Could not read`, the store holds `isOn` only.
- `fix 1` came after the rest sentence, so `prompt.fill` after a real list was not exercised live (finding 2).

## Findings

1. **For the director, before shipping (spec, Demo).** The stand-in `turn.step` is still absent from `docs/engine.js` (only `turn.start` at line 484 and `turn.complete` at 512). The spec says the order does not ship without it. Until it is in, the demo page and `render.ts --turns 1` show `No thinking text reached this card.` to every visitor. Right: after the scripted turn, note `1 unspoken` and `1 I'll default to node --test`.

2. **For the director (spec, Live).** The Live command puts `fix 1` after the first `show`. When the first turn misses, `fix` is never run against a list, and that is what happened. `fix` is proved by A12 only. Right: move `fix 1` to after the second `show` (or say it after each), so a run with one hit still exercises it; expected headless answer `Could not fill the prompt box. Assumption 1: "..."`.

3. **Note, spec (Trigger).** A gap and any `I'll` or `I will` in one sentence is a quote, whatever the choice is. In the scratch copy `I don't know if I'll need this.` lists `I'll need this`, and `The user didn't specify a path but I will not guess.` lists `I will not guess`: a refusal to assume, shown as an assumption. None of the 21 real summaries is worded so; if one turns up, exclude `I will not`, `I won't` and `if I'll`.

4. **Note, spec (Said).** Both directions of the loose rule exist. `Replace mydb with your database name.` drops `Since the database type isn't specified, I'll default to pg_dump.` (shared word `database`), and `This assumes PostgreSQL.` does not drop it (no shared word), so a plainly flagged choice can stay listed under a header that says the reply does not flag it. Neither happened in the live run. The header's `Claude may have checked them since` softens the second; the first is invisible. Watch both once the widget is used.

5. **Note, value.** The card does nothing on a default install: it needs `showThinkingSummaries`, and says so. With the setting it hit on 1 of 2 prompts built to leave a gap, and on ordinary tool turns it will mostly rest. It passes because the hit is the real thing, costs nothing, claims nothing it did not read, and nothing else in the catalog reads the thinking. `live.ts` printing thinking parts would let the next reader see what the cron miss missed.

6. **Note, build (`etc.`).** `I'll use nginx, apache, etc. Then I'll stop.` stays one sentence, as the spec's rule gives. Harmless: a longer quote at worst.
