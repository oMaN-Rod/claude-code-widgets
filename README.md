# Claude Code Widgets

Small cards that sit under the Claude Code prompt, or docked beside the transcript in fullscreen. Each widget is its own mod, toggled with a slash command.

It started with a few useful ones (context, usage, file tree) and then got carried away: there are now 90 widgets, from git status and a turn timer to a pixel crab, a dungeon crawl and Tetris.

Try every widget in its own little terminal on the [demo page](https://oman-rod.github.io/claude-code-widgets/): the real widget code runs in the browser against a simulated session, so you can type its slash commands, run a turn and play the games. It is a static page in `docs/`, published to GitHub Pages on every push to `main` that changes it; opening `docs/index.html` from a checkout works too.

## Install

Add the marketplace, then install the layout plugin and whichever widgets you want:

```
/plugin marketplace add oMaN-Rod/claude-code-widgets
/plugin install widgets@claude-code-widgets
/plugin install context-widget@claude-code-widgets
```

Every widget needs `widgets`, the layout plugin that places the cards.

Requires a Claude Code version with mod (function hook) support. The mod API is early access and may change between releases.

## Widgets

### Layout

Required by every widget.

| Plugin | Command | What it shows |
| --- | --- | --- |
| `widgets` | `/widgets [side\|above\|below\|close\|<columns>\|width <widget> <columns\|reset>]` | Places the cards: below the prompt, above it, or docked beside the transcript in fullscreen |

### Session

What Claude is doing and what it is costing.

| Plugin | Command | What it shows |
| --- | --- | --- |
| `context-widget` | `/context-widget [auto\|detailed\|grid\|top\|bar\|line]` | The context window as a stacked bar, one colour per `/context` category |
| `usage-widget` | `/usage-widget` | A bar per rate-limit window, time to reset, session cost |
| `timer-widget` | `/timer-widget [on\|off\|clear]` | The running turn's elapsed time, plus last, average and longest turn and a sparkline |
| `activity-widget` | `/activity-widget [on\|off\|clear]` | The latest tool calls with their duration and whether they failed |
| `tasks-widget` | `/tasks-widget [on\|off\|clear]` | The task list Claude is working through, with a progress bar |
| `checks-widget` | `/checks-widget [on\|off\|clear]` | The latest test, lint and build runs: pass or fail, duration and how long ago |
| `timeline-widget` | `/timeline-widget [on\|off]` | The turn as a chart: one bar per tool call on a time axis, parallel calls stacked |
| `board-widget` | `/board-widget [on\|off\|clear]` | A status board Claude writes itself through a `pin` tool: goal, findings and open questions |
| `forecast-widget` | `/forecast-widget [on\|off\|clear]` | Context growth per turn as a chart, with the turns left before compaction; warns once when three or fewer are left |
| `guard-widget` | `/guard-widget [on\|off\|clear]` | Permission checks this session: allowed, asked and denied, with what you keep being asked about |
| `stream-widget` | `/stream-widget [on\|off]` | A live tokens-per-second gauge and sparkline while Claude is writing (estimated from text length) |
| `sessions-widget` | `/relay <number> <message>`, `/sessions-widget [on\|off]` | Every Claude Code session open on this machine: folder, branch, working or waiting and for how long; `/relay 1 <message>` sends a line to one |
| `collision-widget` | `/collision-widget [on\|off\|clear]` | Stops an edit to a file another Claude Code session on this machine changed since this one last read it, and has Claude read it again first |
| `sieve-widget` | `/sieve-widget [on\|off]` | A compaction that keeps every word you and Claude said and folds only the old tool traffic, with no summary and no tokens spent |
| `redact-widget` | `/redact-widget [on\|off\|clear]` | Replaces API keys, tokens, private keys and passwords in command output and file reads before Claude sees them |
| `notebook-widget` | `/notebook-widget [on\|off\|show\|drop <number>\|clear]` | Gives Claude a jot tool for writing down what its future self should know about this project, and reads the notes back next session |
| `footnotes-widget` | `/footnotes-widget [on\|off\|show\|clear]` | Checks every file path, cited line and code symbol in Claude's last reply against the working tree, with no model call, and flags the ones that are not there |
| `witness-widget` | `/witness-widget [on\|off\|show\|clear]` | Every line of hidden context the other widgets add to your prompts, word for word, with a running size |
| `queue-widget` | `/queue-widget [on\|off\|add <prompt>\|until <command\|off>\|start\|drop <number>\|report\|clear]` | A queue of prompts that run back to back while you are away, a gate command each must pass before the next starts, and a report of how each one ended |
| `done-widget` | `/done-widget [on\|off\|add <criterion>\|drop <number>\|show\|clear]` | A definition of done you write once: Claude ticks each item with evidence through its tick tool, and is pulled up when it says done with items open |
| `trial-widget` | `/trial-widget [on\|off\|test <widget>\|clear]` | A fair test of another widget: sessions alternate with it on and off, and the card compares how many turns end clean |
| `aside-widget` | `/aside-widget [on\|off\|ask <question>\|clear]` | Ask a side question about the conversation, even mid-turn, and get the answer on a card without adding a turn to the transcript |
| `tap-widget` | `/tap-widget [on\|off\|list [word]\|add <server> <tool> [json] [anyway]\|run <n>\|show <n>\|drop <n>\|clear]` | One line per tool of your connected MCP servers, called by the widget on a clock with no model: pull requests, errors, the next meeting |
| `margin-widget` | `/margin-widget [on\|off\|mark [remark]\|drop <n>\|send\|clear]` | Mark passages of Claude's reply with the mouse, write a remark against each, and send them back as one quoted prompt |
| `loupe-widget` | `/loupe-widget [on\|off\|look [text]\|copy]` | Select a hash, path, name, timestamp or colour in the transcript with the mouse and the card says what it is, with no model call |
| `strays-widget` | `/strays-widget [on\|off\|stop <port>\|forget <port>\|clear]` | Servers this session started that still hold a port, with age and turn, one verb to stop one, and the survivors shown when the next session opens |
| `premise-widget` | `/premise-widget [on\|off\|show\|fix <n>\|clear]` | Quotes thinking-summary sentences that name a gap and a choice made anyway, unless the reply flags it, and starts your correction; no model call; needs "showThinkingSummaries": true in settings.json |
| `earpiece-widget` | `/earpiece-widget [on\|off]`, `/whisper <number> <note>` | Every running subagent with the tool it is on and its last sentence, and /whisper slips one of them a note without stopping the turn |
| `pen-widget` | `/pen-widget [on\|off\|show\|clear]` | The file, edit or command Claude is writing right now, drawn line by line as the tool call's arguments stream in, before the tool runs |
| `outage-widget` | `/outage-widget [on\|off\|check\|clear]` | When a push or install fails on the network, checks the provider's status page and says whether GitHub, npm, PyPI or crates.io reports an incident |
| `landmarks-widget` | `/landmarks-widget [on\|off\|list\|go <n>\|clear]` | A numbered table of contents for the session, built as it happens from prompts, first edits, checks turning red or green, commits and questions; press a line to scroll the transcript to it |
| `seen-widget` | `/seen-widget [on\|off\|show\|open [n]\|clear]` | The pictures Claude looked at this session, image files it read and screenshots that came back from tools, drawn as Claude received them and opened full size with one command |
| `amendments-widget` | `/amendments-widget [on\|off\|show [n]\|clear]` | What changed in the system prompt and the built-in tool descriptions Claude Code gives Claude since the version you last ran, with the before and after one command away |
| `skimmed-widget` | `/skimmed-widget [on\|off\|show\|clear]` | The caveats in Claude's replies that left your screen while Claude was still writing and have not been back, quoted in full; it never claims that what was on screen was read |
| `attic-widget` | `/attic-widget [on\|off\|show\|keep <tool>\|stow <tool>\|clear]` | Counts which tools Claude calls in this project, puts the unused ones behind ToolSearch, lists the daily ones up front, and reports how many schema tokens each request no longer carries |

### Project and git

The state of the working tree.

| Plugin | Command | What it shows |
| --- | --- | --- |
| `file-tree-widget` | `/file-tree-widget` | The project directory; folders expand on click |
| `git-widget` | `/git-widget` | Branch, ahead/behind, staged, changed and untracked counts, and the last commit |
| `changes-widget` | `/changes-widget [on\|off\|clear]` | Files edited this session, most recent first, with an edit count each |
| `commits-widget` | `/commits-widget` | The commits made since the session started |
| `todos-widget` | `/todos-widget` | TODO, FIXME, HACK and XXX comments in tracked files, counted and listed |
| `diff-widget` | `/diff-widget [on\|off\|clear]` | The last edit as a syntax-highlighted diff |
| `watch-widget` | `/watch-widget [on\|off\|run\|stop]`, `/watch <command>` | `/watch bun test` reruns the command after every edit: a pass or fail light and the last failing lines |
| `map-widget` | `/map-widget [on\|off\|clear]` | A pixel map of the tracked files, lit blue where Claude has read and green where it has edited |
| `stakes-widget` | `/stakes-widget [on\|off\|clear]` | What a yes would lose, measured from git and written under the permission dialog for a destructive command |
| `ledger-widget` | `/ledger-widget [on\|off\|scan\|show\|clear]` | What a project has cost across every session, from any folder or worktree in it: measured as each turn ends, and read back from the sessions Claude Code saved |
| `squiggle-widget` | `/squiggle-widget [on\|off\|check [text]]` | Underlines file names that do not exist, as you type them in the prompt box, and paints the ones that do green |
| `critic-widget` | `/critic-widget [on\|off\|review\|tell\|clear]` | A second pair of eyes: a separate model reads the uncommitted diff and lists only real defects, which you can hand to Claude |
| `customs-widget` | `/customs-widget [on\|off\|show\|trust <name>\|clear]` | Looks up every package Claude installs on npm or PyPI before the command runs, and holds the install for a yes when the name is missing or under 30 days old. Scoped names and installs that name a registry, or sit beside a project `.npmrc` that does, are not looked up; user-level and environment registry settings, `bunfig.toml`, `.yarnrc.yml` and pip and uv config files are not seen |

### Time and focus

Clocks, timers and reminders that do not depend on the session.

| Plugin | Command | What it shows |
| --- | --- | --- |
| `pomodoro-widget` | `/pomodoro-widget [on\|off\|start\|break\|stop\|<minutes>]` | A focus timer with a countdown, a progress bar and a count of finished sessions |
| `countdown-widget` | `/countdown-widget [on\|off\|clear]`, `/countdown <HH:MM\|<n>m\|<n>h> [label]` | Time left to a deadline you set, with a progress bar and a toast when it arrives |
| `clocks-widget` | `/clocks-widget [on\|off\|add <zone>\|remove <zone>\|clear]` | Your local time beside the time zones you add, such as `Asia/Tokyo` |
| `notes-widget` | `/notes-widget [on\|off\|clear]`, `/note <text\|done <n>>` | Pinned notes kept across sessions; `/note <text>` adds one, `/note done <n>` removes it |
| `coffee-widget` | `/coffee-widget [on\|off\|refill\|<minutes>]` | A cup that empties over 90 minutes and nudges you to take a break |

### Scenes

Pixel art that reacts to turns, tool calls, checks and context usage.

| Plugin | Command | What it shows |
| --- | --- | --- |
| `pet-widget` | `/pet-widget [on\|off\|<mood>]` | Clawd, a pixel crab: works during a turn, dizzy when a tool call fails, happy when tests pass. Earns XP and levels up across sessions, wears a hat once `badges-widget` has awarded a badge, and with two sessions open stays in the one you last prompted. Remembers each project and greets you with how long you were away and whether the checks were red |
| `aquarium-widget` | `/aquarium-widget [on\|off\|demo]` | A fish for every running tool call and agent |
| `skyline-widget` | `/skyline-widget [on\|off\|demo\|clear]` | One building per turn, one floor per tool call |
| `train-widget` | `/train-widget [on\|off]` | A locomotive pulling one wagon per tool call this turn, coloured by tool |
| `garden-widget` | `/garden-widget [on\|off\|reset]` | A plant: a leaf per tool call, a flower when checks pass, wilting when a call fails |
| `campfire-widget` | `/campfire-widget [on\|off\|stoke]` | A campfire that burns higher with tool calls and dies down to embers when idle |
| `constellation-widget` | `/constellation-widget [on\|off\|clear]` | A star per turn, joined into a constellation that gets a name after nine |
| `fireworks-widget` | `/fireworks-widget [on\|off\|demo]` | A night sky that sets off fireworks when checks pass, and a dud when they fail |
| `invaders-widget` | `/invaders-widget [on\|off\|demo\|clear]` | An invader arrives for every failing check; passing checks shoot them down |
| `weather-widget` | `/weather-widget [on\|off\|live\|<percent>]` | Clear sky when context has room, a storm near compaction |
| `boss-widget` | `/boss-widget [on\|off]` | Context usage as a boss health bar; compaction defeats it and starts the next level |
| `sky-widget` | `/sky-widget [on\|off]` | The sky at your local time: sun by day, moon by night, more stars the longer the session runs |
| `world-widget` | `/world-widget [on\|off\|clear]` | One scene for everything: sky by the clock, weather by context, a tower per turn, a train of tool calls and a wandering crab |
| `quest-widget` | `/quest-widget [on\|off\|reset]` | The session as a dungeon crawl: a room per turn, a monster per tool call, loot when checks pass; the hero is kept across sessions |
| `race-widget` | `/race-widget [on\|off\|clear]` | Parallel subagents as cars on a track, one stride per tool call, with a podium as they finish |
| `moon-widget` | `/moon-widget [on\|off\|north\|south]` | The real moon right now, drawn for your hemisphere, with a countdown to the next full moon and what it means for your deploy |

### Visualizers

Abstract pictures driven by tool activity.

| Plugin | Command | What it shows |
| --- | --- | --- |
| `mosaic-widget` | `/mosaic-widget [on\|off\|clear]` | One tile per tool call, coloured by tool; failures are red |
| `sorting-widget` | `/sorting-widget [on\|off\|step]` | A bar chart being sorted, one swap per tool call |
| `equalizer-widget` | `/equalizer-widget [on\|off]` | Level meters that jump with each tool call and fall back to rest |
| `rain-widget` | `/rain-widget [on\|off]` | Falling code rain that speeds up the busier the turn gets |
| `orbit-widget` | `/orbit-widget [on\|off]` | A small solar system; the planets speed up while tool calls run |
| `life-widget` | `/life-widget [on\|off\|reset]` | Conway's Game of Life; every tool call drops a glider |
| `donut-widget` | `/donut-widget [on\|off]` | The spinning 3D donut; it spins faster while tool calls run |
| `pipes-widget` | `/pipes-widget [on\|off]` | The pipes screensaver; it grows while the session is idle and pauses while Claude works |
| `maze-widget` | `/maze-widget [on\|off\|new]` | A first-person walk through a maze seeded by the project folder |
| `marquee-widget` | `/marquee-widget [on\|off\|clear\|<text>]` | An LED ticker scrolling session events; any other text posts your own headline |

### Games

Snake, 2048 and Tetris play themselves until you click the board and take the keys.

| Plugin | Command | What it shows |
| --- | --- | --- |
| `snake-widget` | `/snake-widget [on\|off]` | Snake; it plays itself until you take the keys |
| `2048-widget` | `/2048-widget [on\|off]` | 2048; it plays itself until you take the keys |
| `tetris-widget` | `/tetris-widget [on\|off]` | Tetris; it plays itself until you take the keys |
| `minesweeper-widget` | `/minesweeper-widget [on\|off]` | Minesweeper: click to reveal, right-click or `f` to flag, `r` to restart |
| `breakout-widget` | `/breakout-widget [on\|off\|reset]` | A self-playing brick breaker; every tool call adds a row of bricks |
| `typer-widget` | `/typer-widget [on\|off]` | A typing game: words from your own file names fall, and you type them before they land |

### Just for fun

| Plugin | Command | What it shows |
| --- | --- | --- |
| `fortune-widget` | `/fortune-widget [on\|off\|next]` | A one-line fortune that changes with every turn |
| `8ball-widget` | `/8ball-widget [on\|off]`, `/8ball <question>` | `/8ball <question>` gives an answer of doubtful reliability |
| `badges-widget` | `/badges-widget [on\|off\|reset]` | Achievements earned across sessions, with a toast when one unlocks |
| `sigil-widget` | `/sigil-widget [on\|off\|clear]` | A pixel emblem generated from this session's activity, beside a gallery of the ones from earlier sessions |
| `sound-widget` | `/sound-widget [on\|off\|mute\|test]` | A note per tool call, a chord when checks pass, a buzz on failure, with a piano roll (audio plays on macOS only) |

Placement, which widgets are on, and view modes are saved and restored in every session.

## Notes

- `/widgets width pet 60` sets how wide one widget's card may grow (the default is 40 columns); `/widgets width pet reset` puts it back.
- `/widgets side` docks the cards beside the transcript only in the fullscreen layout (`/tui fullscreen`). In the default layout it falls back to below the prompt.
- The pixel art is drawn with terminal block characters and shows in the terminal only.
- `sound-widget` plays audio on macOS only; elsewhere it stays silent and just draws the piano roll.
- `board-widget` registers a `pin` tool that Claude can call, so its description is part of the context while the board is on.
- `watch-widget` runs your command through `sh -c`, falling back to `cmd /c`.
- Taking over a game, and playing Minesweeper at all, needs a mouse click on the board, which the fullscreen layout reports.

## Develop

Each plugin under `plugins/` is a mod: a manifest, a hooks module and its tests.

```
claude --plugin-dir plugins            # load every plugin from this checkout
claude plugin validate plugins/<name>  # check a manifest and hooks module
claude plugin test plugins/<name>      # run its tests
```

Plugin storage (`$.store`) is read once per session, so a widget that has to see other live sessions keeps a file under its own folder instead (`$.plugin.root`).

Plugins cannot import from one another, so `widgets` shares card stacking and the pixel renderer as `$.widgets` (`plugins/widgets/hooks/kit.tsx`), which every widget calls.

### Demo page

`docs/` is the demo page. `bun run site/build.ts` bundles every widget's hooks module into `docs/mods.js` and writes `docs/catalog.js` from the tables above, so a new widget appears on the page once it has a row here. `docs/engine.js` is a small stand-in for the mod engine (state, store, clock, commands, a made-up project and a scripted turn), and `docs/view.js` draws the card trees. `bun run site/smoke.ts` boots every widget in that engine and runs a turn; a widget that needs an engine call the stand-in lacks shows up there. `docs/widgets.js` holds recordings from the real interface, shown only if a widget fails to start.

## The Widget Factory

New widgets are made by the Widget Factory in `factory/`: a crew of Claude Code agents that takes each widget through ideation, design, build, inspection and shipping, with a different agent inspecting than built it. Clone the repository and you can run your own:

https://github.com/user-attachments/assets/6833eb82-8b2e-4b4c-80ca-4194d48d10e7

```
bun run --cwd factory setup   # checks what you need and prepares the floor
bun run --cwd factory floor   # the factory floor in your browser
bun run --cwd factory line    # opens a Claude Code session that runs the line
```

https://github.com/user-attachments/assets/d0953871-4935-4fa9-8ab3-f58b51739a17

[factory/README.md](factory/README.md) explains the stations, the crew, the widget standard and how to contribute a widget.

## License

MIT
