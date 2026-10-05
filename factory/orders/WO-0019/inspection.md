# Inspection: WO-0019 Strays (`strays-widget`), third build

Verdict: **pass**. The checker passes, the build follows the third spec, and the director's live run
did for real what two earlier runs could not: a server the session left on a port became a row, one
verb stopped it, and the second stop said nothing of the session's was left.

## What was run
`check.ts --spec`: PASS (15 acceptance tests plus the standard five). `render.ts` at rest,
`--turns 1`, `--turns 3`, and fourteen `--do` lines. `live.txt` (the director's run of 08:41) read;
no second live run made. Ports 47613 and 47614 listed once afterwards: both free.

## Frames
Rest, `--turns 1` and `--turns 3` draw the same frame at 20, 40 and 60: the empty sentence, wrapped
by words inside the border, as the spec draws it.

`render.ts` takes its frame before the first one-second tick and `docs/engine.js` has no stand-ins,
so no row frame can be seen through it (the spec allows the empty sentence there). Row frames were
judged from `lineOf` by hand and from A14, which asserts them character for character:

```
:3000 node (vite)    12m 05s  turn 1      40 columns, 36 inner
:3001 long-running…  12m 05s  turn 1
:3001 long-r…  12m 05s  turn 1            34 columns, the narrowest wide row
:3000 node (vit…                          20 columns, tight
+1 more
```

These agree with the spec's working and busiest drawings; the note reads `6 running`, `1 running`,
`1 from earlier` (tight `1 earlier`).

Verbs through `--do`: `stop 3000`, `stop 65535` and `stop  :8080 ` answer `Still checking ports; try
stop <port> again in a moment.` with the port named without the colon (the first refresh is asked
and no tick has fired, as spec note 4 says); `forget :3000` answers `Nothing of this session's is on
port 3000.`; `clear` answers `No strays on the card; nothing was stopped.`; `off` draws nothing.
Usage, with nothing changed, for `STOP :0`, `stop 3000 4000`, `stop -1`, `clear now`,
`Forget 99999`, `on on`, `stop 3000; rm -rf /` and full-width digits.

## Live run (live.txt)
- `on` answered `Strays on; /widgets places it.`; `off` answered `Strays off.`
- A Bash call with `run_in_background` started `bun` on 47613; two `sleep 15` turns followed.
- First stop: `Stopped bun on :47613 (pid 8928).` The session's own task notice confirms the kill
  (the background task ended, exit 1). So the timer's refresh ran to its end, the real chain tied
  the listener to the session, the label rule held (`bun`, no hint after `-e`), and the command
  hook stayed inside its budget.
- Second stop: `Nothing of this session's is on port 47613.` It arrived after the `off` line was
  sent, because the model spoke first about the task notice; read by sentence, as the spec says.
- Store: `isOn` false and `rows:3420767468` with the session id and an empty list. No hook error.

## Read of register.tsx
- Every hook but `session.start`, `command.run` and `ui.render` reads the switch first; `tool.call`
  returns what `next` gave and awaits no process; a window still open when the switch goes off is
  not written back. The verbs answer `Strays is off.` while off and never switch the widget on.
- One module-level `let`, the timer, started and cancelled in `sync`. A refresh from an older open
  changes nothing and does not clear the newer `isBusy` (the `opened` count inside `watch`).
- `stop` kills only a row whose `born` still matches, never `host`, never a shared row; argv only,
  the port parsed to a number between 1 and 65535 before anything runs. Store: `isOn`, `rows:<hash>`.
- Tests feed captured netstat, lsof, ps and script output, and A5 and A6 hold a listing on a promise
  and count started listings by argv; they prove their lines rather than agree with themselves.

## Findings (none blocking)
1. **State contract, one field more than the spec.** `watch.opened` is not in the spec's State line.
   It is the counter spec note 3 asked for and it is in `types/index.d.ts`; right is for the spec's
   State line to list it at the next revision.
2. **Age stands still between refreshes.** `lineOf` draws `span(at - born)` with `at` from the last
   refresh, so a row's age moves only after a Bash or PowerShell call or a turn end. The spec says
   drawing reads state only, so this is as designed; a quiet card may read a few minutes young.
3. **A port once examined answers `Nothing` at once** even while a refresh that would find a new
   listener on it is asked (the machinist's logged wart, from the spec's order in `stop`). The next
   stop after the tick finds the row. Right, at a later revision: check `isQueued`/`isBusy` before
   `seen` when the `seen` pair's pid has left the card.
4. **The demo shows only the empty sentence (director, third time).** The Demo stand-ins are not in
   `docs/engine.js`, so the page cannot show the best moment, `1 from earlier`. The widget does not
   throw without them.
5. **Unproven for real:** the earlier-session card (needs a second session and a detached server,
   which the spec leaves to the owner's say-so) and the POSIX path. Both are covered by A7 and by
   the POSIX halves of A2, A8 and A13 with real fixtures.

Against the bar: proven live on Windows, nothing else in the catalog watches what a session leaves
behind, and its one destructive verb checks the process is the same one and says what it did.
