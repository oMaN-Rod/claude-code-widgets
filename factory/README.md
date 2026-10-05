# Widget Factory

The line that makes the widgets in `plugins/`. A crew of agents takes each widget through five stations; nothing ships that the agent who built it approved.

```
ideation ──▸ design ──▸ build ──▸ inspection ──▸ shipping
examiner     inspector   checker   inspector      smoke test
```

| Station | Who | Output | Gate |
| --- | --- | --- | --- |
| Ideation | three inventors, then the examiner | `idea.md` | The examiner rejects any variation on an existing widget |
| Design | designer | `spec.md` with acceptance lines | The inspector rejects only blocking faults; the rest go to the machinist as `spec-notes.md` |
| Build | machinist | the widget, on the floor | `check.ts` passes: rules, validator, tests, render sweep |
| Inspection | inspector | `inspection.md` | Checker, renders, a live run, then pass, send back to build or design, or scrap |
| Shipping | clerk | demo page, README row, one commit | The demo smoke test runs clean |

The director is the session that runs the line: it opens work orders, starts the workflow, and rules on any order sent back more than twice. The foreman is the workflow script, `.claude/workflows/widget-line.js`. The crew's briefs are in `.claude/agents/`.

## Start your own

Clone the repository and you have your own factory: its own floor, its own orders, its own crew. You need [bun](https://bun.sh) and Claude Code with mod (function hook) support.

```
bun run --cwd factory setup     # checks the tools, installs dependencies, prepares the floor
bun run --cwd factory floor     # the factory floor in your browser, also on your network
bun run --cwd factory line      # starts a director session that runs the line
bun run --cwd factory board     # the board in the terminal
```

- **Setup** says what is missing. The one manual step is a separate Claude Code login for live runs: start `claude` once with `CLAUDE_CONFIG_DIR` set to `~/.claude-factory` (or the folder named in `FACTORY_CONFIG_DIR`) and run `/login`. The factory tests widgets there, never in your own setup.
- **The line** opens a Claude Code session with the director's instructions from `factory/DIRECTOR.md`. It refills the floor from `factory/backlog.json`, runs the `widget-line` workflow, makes the live runs and checks what shipped. `bun factory/tools/line.ts --until 5` sets how many orders to finish, `--interactive` opens a session you can watch and steer, and anything after `--` goes to `claude` (a permission mode, for instance).
- **Permissions.** `.claude/settings.json` allows the crew to run the factory's own tools. Everything else follows your Claude Code permission settings, so an unattended line needs a mode that lets agents edit files and run `bun`, `git` and `claude plugin` in this repository.
- **Contributing.** A shipped widget is one commit: the widget, its closed work order, its README row, its marketplace entry and the demo page. Send that commit as a pull request. Changes to the factory itself (the standard, the tools, the crew's briefs) go in their own commits.
- **Moving a factory.** The floor is outside git. `bun factory/tools/move.ts pack` puts it in one archive and `bun factory/tools/move.ts unpack <file>` restores it after cloning on the new machine. Run setup and log in for live runs there too.

## What is where

```
factory/STANDARD.md        what every widget must meet
factory/template/          what the scaffold stamps out
factory/DIRECTOR.md        the loop the director session runs
factory/backlog.json       what the line makes next
factory/tools/             setup, line, order, scaffold, check, render, live, ship, serve, move
factory/control-room/      the factory floor card for Claude Code
factory/orders/            closed work orders, committed with their widget
factory/floor/             open orders and widgets being built (not in git)
```

A work order is a folder: `order.json` (station, holder, stamps), `log.jsonl` (who did what), and the idea, spec and inspection report. Orders change only through `order.ts`. An order stays on the floor until it ships or is scrapped; then it moves to `factory/orders/`.

## Running the line

```
bun install --cwd factory                                    # once
bun factory/tools/order.ts open --kind new --brief "..."      # a widget the line invents
bun factory/tools/order.ts open --kind rebuild --widget moon-widget --title Moon --brief "..."
```

A rebuild is designed from its brief. If `factory/floor/reference/<name>-widget/` holds an earlier version of the widget, the designer reads that too.

To keep the floor stocked, `bun factory/tools/order.ts refill` opens orders from `factory/backlog.json` until three are on the floor (or `--target <n>`). It takes rebuilds in the backlog's order and opens an order for a new invention after every third rebuild. It prints the orders it opened, ready to hand to the workflow.

Then run the `widget-line` workflow with `{ orders: [{ id, kind }] }`. To pick an order up where it stopped, read its station from the board and pass it as `from`: `{ id, kind, from: 'build' }`. To stop an order before a station, pass `until`: `{ id, kind, until: 'inspection' }`.

## Keeping a run small

A run has an agent budget, and the foreman enforces it before it starts anyone.

| Limit | Default | What it bounds |
| --- | --- | --- |
| `agentsPerRun` | 10 | Agents one run may start, across all its orders |
| `agentsPerOrder` | 10 | Agents one order may use in a run |
| `inventors` | 3 | Inventors per ideation round (1 to 3) |
| `ideationRounds` | 1 | Rounds before an order with no surviving idea is scrapped |
| `specPasses` | 2 | Times a spec may be written before the order is held |
| `sendBacks` | 2 | Send-backs before the order is held for the director |
| `directorLive` | off | Stop each order after its build, so the director makes the live run before inspection |

- **Admission.** A rebuild needs about 5 agents with no send-backs, a new widget about 9. Orders are admitted in the order given while their estimates fit `agentsPerRun`; the rest stay on the floor, untouched, for the next run. With the defaults a run takes one new widget or two rebuilds.
- **Running out.** Send-backs spend what the estimates left over. When the budget is gone, the order is held at its station and the result says which `from` resumes it. Nothing is lost: the spec, the widget and the log are on the floor.
- **Raising it.** Pass `limits` with the run, for example `{ orders: [...], limits: { agentsPerRun: 24 } }`. A larger run is the director's decision, made per run and never the default.

The run returns what each order spent, and the board shows the agent shifts each order has used over its whole life.

## Looking in

```
bun factory/tools/order.ts board         # the whole floor
bun factory/tools/order.ts show WO-0003  # one order and its log
```

For the floor as a game-style view, run `bun factory/tools/serve.ts` and open http://localhost:4173. It fills the window with the factory drawn in 3D from the state files, refreshed every three seconds, with everything else in panels over it.

- **The floor:** one closed room with five areas round the walls (ideas loft, drafting studio, workshop, inspection lab, shipping bay), joined in order by one conveyor line. Each work order is a numbered crate. It rides the belt to the next area when it passes a gate, a worker carries it back when it is sent back, the porter takes a scrapped one to the kiln, and shipped crates end on the truck. The sign beside the dock, and the truck's own panel, open the demo page where the shipped widgets run.
- **The panels:** a map (click it to move the camera), the line's totals, a button for each station, the floor log with a tab for everything turned back, and a bar for whatever is selected. "Open details" on that bar opens a window with the order's journey, stamps, log, spec and inspection report, or a station's gate and what it turned back.
- **The camera:** drag to pan, right-drag to turn, scroll to zoom, and after clicking the scene fly with WASD or the arrows (Q and E go down and up).

Start it with `--lan` to reach it from another device on your network; it prints the addresses to use. The Rehearsal button runs made-up orders through the floor, to watch it move when the real line is quiet.

Inside Claude Code, load the floor card with `claude --plugin-dir plugins --plugin-dir factory/control-room` and switch it on with `/factory-widget`. `/factory-widget orders`, `shipped`, `turned` and `log <order>` report in the transcript.

## Tools

```
bun factory/tools/scaffold.ts <order>             # a new widget on the floor
bun factory/tools/check.ts <folder> [--spec ...]  # does it meet the standard
bun factory/tools/check.ts --all                  # which shipped widgets do
bun factory/tools/render.ts <folder> [--turns 1] [--do "/cmd"] [--wide 60]   # the card as text at 20, 40 and 60 columns
bun factory/tools/live.ts <folder> --say "/cmd" --say "a prompt"   # a real headless session, isolated
bun factory/tools/ship.ts prepare|commit <order>  # the shipping station
bun factory/tools/serve.ts [--port 4173] [--lan]  # the floor as a page, and the demo page at /demo/
bun factory/tools/scaffold.ts --restamp <folder>  # after the template changes
```

The factory never uses your own Claude Code setup. The validator, the tests and `live.ts` all run under a separate config directory (`~/.claude-factory`, or `FACTORY_CONFIG_DIR`), and a live run happens in a scratch project inside it, with only the layout plugin and the widget under test loaded. Log in there once: start `claude` with `CLAUDE_CONFIG_DIR` set to that folder and run `/login`.
