# Claude Code Widgets

Small cards that sit under the Claude Code prompt, or docked beside the transcript in fullscreen. Each widget is its own mod, toggled with a slash command.

It started with a few useful ones (context, usage, file tree) and then got carried away (a pixel crab, a skyline, an aquarium, weather and snake).

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

| Plugin | Command | What it shows |
| --- | --- | --- |
| `widgets` | `/widgets [side\|above\|below\|close\|<columns>\|width <widget> <columns\|reset>]` | Places the cards: below the prompt, above it, or docked beside the transcript in fullscreen |
| `context-widget` | `/context-widget [auto\|detailed\|grid\|top\|bar\|line]` | The context window as a stacked bar, one colour per `/context` category |
| `usage-widget` | `/usage-widget` | A bar per rate-limit window, time to reset, session cost |
| `file-tree-widget` | `/file-tree-widget` | The project directory; folders expand on click |
| `pet-widget` | `/pet-widget [on\|off\|<mood>]` | Clawd, a pixel crab: works during a turn, dizzy when a tool call fails, happy when tests pass |
| `skyline-widget` | `/skyline-widget [on\|off\|demo\|clear]` | One building per turn, one floor per tool call |
| `aquarium-widget` | `/aquarium-widget [on\|off\|demo]` | A fish for every running tool call and agent |
| `weather-widget` | `/weather-widget [on\|off\|live\|<percent>]` | Clear sky when context has room, a storm near compaction |
| `snake-widget` | `/snake-widget [on\|off]` | Snake; it plays itself until you take the keys |
| `git-widget` | `C:/Program Files/Git/git-widget` | Branch, ahead/behind, staged, changed and untracked counts, and the last commit |
| `changes-widget` | `/changes-widget [on\|off\|clear]` | Files edited this session, most recent first, with an edit count each |
| `garden-widget` | `/garden-widget [on\|off\|reset]` | A plant: a leaf per tool call, a flower when checks pass, wilting when a call fails |
| `life-widget` | `/life-widget [on\|off\|reset]` | Conway's Game of Life; every tool call drops a glider |
| `activity-widget` | `/activity-widget [on\|off\|clear]` | The latest tool calls with their duration and whether they failed |
| `tasks-widget` | `/tasks-widget [on\|off\|clear]` | The task list Claude is working through, with a progress bar |
| `train-widget` | `/train-widget [on\|off]` | A locomotive pulling one wagon per tool call this turn, coloured by tool |
| `sky-widget` | `/sky-widget [on\|off]` | The sky at your local time: sun by day, moon by night, more stars the longer the session runs |
| `checks-widget` | `/checks-widget [on\|off\|clear]` | The latest test, lint and build runs: pass or fail, duration and how long ago |
| `timer-widget` | `/timer-widget [on\|off\|clear]` | The running turn's elapsed time, plus last, average and longest turn and a sparkline |
| `fireworks-widget` | `/fireworks-widget [on\|off\|demo]` | A night sky that sets off fireworks when checks pass, and a dud when they fail |
| `rain-widget` | `/rain-widget [on\|off]` | Falling code rain that speeds up the busier the turn gets |
| `notes-widget` | `/notes-widget [on\|off\|clear]`, `/note <text\|done <n>>` | Pinned notes kept across sessions; `/note <text>` adds one, `/note done <n>` removes it |
| `pomodoro-widget` | `/pomodoro-widget [on\|off\|start\|break\|stop\|<minutes>]` | A focus timer with a countdown, a progress bar and a count of finished sessions |

Placement, which widgets are on, and view modes are saved and restored in every session.

## Notes

- `/widgets width pet 60` sets how wide one widget's card may grow (the default is 40 columns); `/widgets width pet reset` puts it back.
- `/widgets side` docks the cards beside the transcript only in the fullscreen layout (`/tui fullscreen`). In the default layout it falls back to below the prompt.
- The pixel art is drawn with terminal block characters and shows in the terminal only.
- Taking over snake needs a mouse click on the board, which the fullscreen layout reports.

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
