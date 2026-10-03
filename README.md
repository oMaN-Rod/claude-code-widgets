# Claude Code Widgets

Small cards that sit under the Claude Code prompt, or docked beside the transcript in fullscreen. Each widget is its own mod, toggled with a slash command.

It started with a few useful ones (context, usage, file tree) and then got carried away: there are now 42 widgets, from git status and a turn timer to a pixel crab, a campfire and Tetris.

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
| `pet-widget` | `/pet-widget [on\|off\|<mood>]` | Clawd, a pixel crab: works during a turn, dizzy when a tool call fails, happy when tests pass |
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

### Games

Snake, 2048 and Tetris play themselves until you click the board and take the keys.

| Plugin | Command | What it shows |
| --- | --- | --- |
| `snake-widget` | `/snake-widget [on\|off]` | Snake; it plays itself until you take the keys |
| `2048-widget` | `/2048-widget [on\|off]` | 2048; it plays itself until you take the keys |
| `tetris-widget` | `/tetris-widget [on\|off]` | Tetris; it plays itself until you take the keys |
| `minesweeper-widget` | `/minesweeper-widget [on\|off]` | Minesweeper: click to reveal, right-click or `f` to flag, `r` to restart |
| `breakout-widget` | `/breakout-widget [on\|off\|reset]` | A self-playing brick breaker; every tool call adds a row of bricks |

### Just for fun

| Plugin | Command | What it shows |
| --- | --- | --- |
| `fortune-widget` | `/fortune-widget [on\|off\|next]` | A one-line fortune that changes with every turn |
| `8ball-widget` | `/8ball-widget [on\|off]`, `/8ball <question>` | `/8ball <question>` gives an answer of doubtful reliability |
| `badges-widget` | `/badges-widget [on\|off\|reset]` | Achievements earned across sessions, with a toast when one unlocks |

Placement, which widgets are on, and view modes are saved and restored in every session.

## Notes

- `/widgets width pet 60` sets how wide one widget's card may grow (the default is 40 columns); `/widgets width pet reset` puts it back.
- `/widgets side` docks the cards beside the transcript only in the fullscreen layout (`/tui fullscreen`). In the default layout it falls back to below the prompt.
- The pixel art is drawn with terminal block characters and shows in the terminal only.
- Taking over a game, and playing Minesweeper at all, needs a mouse click on the board, which the fullscreen layout reports.

## Develop

Each plugin under `plugins/` is a mod: a manifest, a hooks module and its tests.

```
claude --plugin-dir plugins            # load every plugin from this checkout
claude plugin validate plugins/<name>  # check a manifest and hooks module
claude plugin test plugins/<name>      # run its tests
```

Plugins cannot import from one another, so `widgets` shares card stacking and the pixel renderer as `$.widgets` (`plugins/widgets/hooks/kit.tsx`), which every widget calls.

## License

MIT
