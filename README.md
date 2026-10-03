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
| `widgets` | `/widgets [side\|above\|below\|close\|<columns>]` | Places the cards: below the prompt, above it, or docked beside the transcript in fullscreen |
| `context-widget` | `/context-widget [auto\|detailed\|grid\|top\|bar\|line]` | The context window as a stacked bar, one colour per `/context` category |
| `usage-widget` | `/usage-widget` | A bar per rate-limit window, time to reset, session cost |
| `file-tree-widget` | `/file-tree-widget` | The project directory; folders expand on click |
| `pet-widget` | `/pet-widget [on\|off\|<mood>]` | Clawd, a pixel crab: works during a turn, dizzy when a tool call fails, happy when tests pass |
| `skyline-widget` | `/skyline-widget [on\|off\|demo\|clear]` | One building per turn, one floor per tool call |
| `aquarium-widget` | `/aquarium-widget [on\|off\|demo]` | A fish for every running tool call and agent |
| `weather-widget` | `/weather-widget [on\|off\|live\|<percent>]` | Clear sky when context has room, a storm near compaction |
| `snake-widget` | `/snake-widget [on\|off]` | Snake; it plays itself until you take the keys |

Placement, which widgets are on, and view modes are saved and restored in every session.

## Notes

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

`hooks/kit.tsx` (card stacking and the pixel renderer) is the same file in each plugin that draws pictures, since plugins cannot import from one another.

## License

MIT
