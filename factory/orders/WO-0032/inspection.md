# Inspection, WO-0032 Rehearsal (`rehearsal-widget`)

Verdict: **pass**. Checker passes (standard + 15 acceptance tests). The card, the verbs and the live run match the spec; the findings below are small and none makes the card say something false in ordinary use.

## Frames that matter

Empty, 20 and 40 columns (render.ts, at rest): says what will appear and why.
```
│ Rehearsal        │   │ Rehearsal                            │
│ No calls yet.    │   │ No calls seen in this project yet.   │
│ Each kind Claude │   │ Each kind Claude makes is kept and   │
│ makes is checked │   │ put to the permission check, unrun.  │
│ here, unrun.     │
```
After one turn (`--turns 1`), then after the next tick (`--wait 7000`): the card moves by itself.
```
│ Rehearsal                     1 of 7 │   │ Rehearsal                  all clear │
│ Would stop and ask: 1 of 7           │   │ All 7 calls seen here would run.     │
│ ? git checkout -- src/sum.js         │   │ By the rules now. Hooks are not      │
│ 6 would run by the rules.            │   │ asked; a new kind of call may ask.   │
```
20 columns, busiest (probe on a scratch copy, 40 stored calls): `4/40`, `1 of 40 refused`, `✗ rm -rf build`, `3 of 40 ask`, `? bun install`, `? git push orig…`, `? Write ../shar…`, `36 would run`. No cut note (`clear`, `none`, `noask`, `bypass` under 30 columns), no line over the border at 20, 40 or 60. Non-dialog modes read `Not settled by rules` / `dontAsk decides these, no dialog.` and never say "stop". Singulars are right (`All 1 call`, `1 call could not be checked`).

Verbs: `show`, `forget <n>`, `clear` answer as specified; `SHOW` accepted; `show all`, `forget`, `forget x`, `forget -1`, `forget 1.5`, `forget 1 2`, `rehearse` answer the usage; `forget 0` and a forgotten or missing row answer `No row`; all three verbs answer `Rehearsal is off.` while off and none switches it on.

## Live run (director's, `live.txt`)

Exactly the good run of the spec. `show`: `Rehearsal in scratch-project, default mode: 1 would stop, 0 refused, 1 would run, of 2 seen here.`, `1. ask Write rehearsal.txt (...)`, `2. run Read README.md (Read)`. So real `tool.check` events carry `tool_use_id` and are collected, a classic event delivered `permission_mode`, and the query accepted a Write whose `content` was blanked (no `unchecked` row). `clear`: `2 calls forgotten for scratch-project.` No error; the store ends as `{ "isOn": false }` only.

## Code and tests

- Every hook but `session.start`, `command.run` and `ui.render` reads the switch before any work; a real check always returns `next`'s own verdict, and collection is wrapped so it cannot throw into a call.
- One timer, started and stopped in `sync`; off resets `book`, `verdicts`, `run`; a rehearsal in flight at switch-off writes nothing back (probed with slow queries: no query and no state after off).
- Store: `isOn` and `calls:<folder(root)>` only; session-only calls never written (probed: a Bearer header stays out of the list after `forget` and after the turn).
- All 12 spec notes are settled (cap 40, narrow notes, `../` labels for near outside paths, `..` paths class `out`, non-object input, unparsable url, stale `forget` rows).
- Tests use stored lists of 40 realistic calls and a rules plugin beneath the widget; they prove their lines rather than restate the code.

## Findings (none blocking)

1. `hooks/register.tsx`, `drawn`, the `more` row. `and <k> more` is put after the last drawn call row, inside that row's group, and the later groups' headings follow with no rows. With 5 refused, 3 ask, 1 unchecked the card reads `Would be refused: 5 of 10`, four `✗` rows, `and 5 more`, `Would stop and ask: 3 of 10`, `1 call could not be checked`: it looks like nine refused. Needs four or more rows used up before a later group, so it is rare. Right: draw `and <k> more` once, after the last heading and before the would-run row.
2. Spec, shape rule. A command whose first word holds `/ . = "` has an empty head, so `./deploy.sh`, `FOO=1 bun test` and `/usr/bin/python x.py` all share the key `Bash:` and replace one another. Right: take the first word as the head when the head would be empty (after dropping leading `NAME=value` words).
3. Spec, secrets. `curl -u bob:hunter2 https://x.test` matches none of the three patterns and is stored in plain text (the password is in the key too); a short heredoc (`cat <<EOF > a.txt ... EOF`, under 300 characters) stores its body, though the Cost section says file content is never kept. Right: treat `-u <a>:<b>` and `--user`/`--password` as secret, and keep only the first line of a multi-line command as the label and treat the call as session-only.
4. Live: the engine's reason for an `ask` is a full sentence with the absolute path (`Claude requested permissions to write to C:\...`). From 50 columns it fills the row after ` · ` (dim, cut). Harmless; a rule is the useful why, a reason could be left to `show`.
5. `forget 99999999999999999999999` answers `No row 1e+23`. Right: echo the digits typed.
6. Not a fault: verbs run before `--turns` in render.ts, so `show` after a turn was inspected through the tests and a probe copy, not through render.ts.
