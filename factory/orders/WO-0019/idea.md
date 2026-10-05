# Strays

`strays-widget`, command `/strays-widget [on|off|stop <n>|forget <n>|clear]`

## What it shows

The servers and background processes this session started that are still running: one row each with its port, the process name, its age and the turn that started it. One verb stops one.

- At rest: `Nothing left running`.
- After a turn that left something alive: `1  :3000  node (vite)  2h  turn 4` and `2  :5432  postgres  40m  turn 9`.
- At the start of the next session in the same project: the strays an earlier session left that are still alive, marked `from an earlier session`. This is the best moment: the card already knows who holds port 3000 before the person meets `port 3000 is already in use`.
- `/strays-widget stop 1` stops that one process and the row goes; `forget 1` drops a row the person wants left alone.

## Why it is remarkable

Everyone who uses Claude Code has met this an hour later: a port already in use, or a fan spinning for a dev server Claude started for one check and never stopped. Finding it means a port listing, a pid and a guess about which session started it. The widget remembers for them.

Closest existing widgets, and what Strays adds:

- `footprint-widget` (waiting) lists what the session did outside the project: installs, removals, network calls, outside writes. It records actions; it does not know what is still alive.
- `activity-widget` lists tool calls and how long they took. A call that returned at once and left a server behind looks finished there.
- Claude Code's own background shell list covers only commands run with `run_in_background`, and only while the session lives. Strays also covers what a command detached (`&`, `nohup`, `start`, `docker compose up -d`) and what outlives the session.

Nothing in the catalog, shipped or waiting, tracks what is still running after the turn ends.

## The API it needs

All checked in the plugin-authoring types file (`plugin-authoring/types/claude-code.d.ts`); none is new to the catalog.

- `session.start`: take the baseline list of listeners, and check the strays saved by earlier sessions in this project.
- `tool.call` on `{ tool: 'Bash' }`: note the command, the turn and `run_in_background`, and list listeners after `next(e)` so a new one is tied to the call that started it.
- `turn.complete`: list listeners again and drop rows whose process has gone.
- `$.process.run`: `netstat -ano` and `tasklist` on Windows; `lsof -iTCP -sTCP:LISTEN -P -n` and `ps` elsewhere; `taskkill` or `kill` for `stop`.
- `$.state` for this session's rows; a file under `$.plugin.root` (or `$.store`) for the strays that outlive the session, keyed by project.
- `$.widgets.card`.

Sharpened from the inventor's version: the leaving toast on `session.end` is dropped, because that chain has a short time bound and the screen is going away. The strays are saved and shown by the next session instead.

## Cost

No tokens and no model calls. One port listing per Bash call and one per turn end, tens of milliseconds each. It never stops a process unasked.

## Risks the designer must settle

1. **Honest attribution.** A listener that appears during a turn may be the person's own, started in another terminal. Settle the rule: list before and after each Bash call rather than once per turn, and confirm with the parent process chain where the platform gives one. A row the widget cannot tie to a call must say so (`appeared during turn 4`) and must not be offered for stopping without the person naming it.
2. **What stop may kill.** Only a pid the widget tied to this project's sessions, and only after checking it is the same process (pid plus start time, since pids are reused). Never a shared owner: on Windows a Docker port belongs to `com.docker.backend` or `wslrelay`, and killing that takes Docker down. Decide whether such rows are shown without a stop, or stopped through `docker stop`.
3. **Processes without a port.** A watcher or a build left running opens no listener. Decide whether version one is ports only (say so on the card) or also follows the children of background Bash calls.
4. **Windows first.** This machine is Windows: `netstat -ano` output, `tasklist` names (`node.exe` says little, so find the command line if it can be had cheaply) and `taskkill` on a process tree all need checking here.
5. **Cost per Bash call.** If a listing per call is too slow in a turn with many calls, list only after calls whose command could start a server, and at turn end.
6. **The demo page.** The stand-in engine's `$.process.run` must answer the listing commands with a made-up server so the card has something to show.
