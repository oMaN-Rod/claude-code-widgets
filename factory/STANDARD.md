# The widget standard

Every widget the factory ships meets this standard. `bun factory/tools/check.ts <folder>` says whether one does.

## Folder

```
<name>-widget/
  .claude-plugin/plugin.json   manifest: ten keys, depends on "widgets"
  widget.json                  title, category, shows, commands, cost
  hooks/hooks.json             stamped
  hooks/register.tsx           the widget
  hooks/lib.ts                 stamped: fit, plural, span, spark, hash, shade, folder
  hooks/<client>.tsx           only for a widget with a Client module
  types/index.d.ts             the state contract
  tests/kit.tsx                stamped: layout stub, ground(), session(), turn(), target()
  tests/standard.test.tsx      stamped: the five standard tests
  tests/widget.test.tsx        one test per acceptance line of the spec
```

Stamped files come from `factory/template/` and are never edited in a widget. To change one, change the template.

`widget.json` is the widget's entry in the catalog. The demo page and the README row are made from it.

- `title`: the name on the card.
- `category`: one of Session, Project and git, Time and focus, Scenes, Visualizers, Games, Just for fun.
- `shows`: one sentence, 20 to 200 characters, the same as the manifest description.
- `commands`: every command with its arguments, the widget's own command first.
- `cost`: what it spends beyond a normal session (model calls, context), or empty.

## Switch

- One command, named after the plugin: `/<name>-widget [on|off|...]`. Bare toggles, `on` and `off` set, anything unknown answers `Usage: /<name>-widget [...]` and changes nothing.
- The switch is the `isOn` atom, saved to the store as `isOn` and restored at `session.start`.
- Other verbs act only while the widget is on. While off they answer that the widget is off. A verb never switches the widget on.
- `clear` is the verb that wipes what a widget has collected.
- A second, shorter command or a tool for Claude is allowed only when the spec gives the reason, it is listed in `widget.json`, and no other widget uses the name.

## Off means inert

While off a widget draws nothing, writes nothing to the store or to disk, runs no timer, adds nothing to a prompt, and does not deny, rewrite or abort anything. Every hook other than `session.start`, `command.run` and `ui.render` checks the switch before it does any work. Switching off stops what switching on started.

## Lifecycle

- `session.start` registers the command and restores the switch and settings. It does no other work unless the widget is on.
- Timers start and stop in one function named `sync`, called after every change of the switch and at `session.start`. A timer handle is the only module-level `let`.
- Everything else a widget remembers is in `$.state` (this session), `$.store` (across sessions, read once per session) or a file under `$.plugin.root` (shared live between sessions).
- A `prompt.submit` hook accepts prompts from `composer`, `bridge` and `sdk`.
- A key made from a folder goes through `folder()` so that Windows paths compare equal.
- A widget reads another plugin's state only for the layout's `site` and `widths`.

## Rendering

- The card is drawn by `$.widgets.card`, in all three placements, through the three `ui.render` hooks of the template.
- The width is `fit(wanted, columns)`: 40 by default, never under 20, wider only when the person asked with `/widgets width`.
- The card must read well at 20, 40 and 60 columns: no line breaks the border, nothing important is cut, and a long value truncates instead of wrapping into the next row.
- A card has an empty state that says what will appear and what makes it appear.
- A picture is drawn with `$.widgets.picture` and scales with the card's width.
- Counts are written with `plural()`, durations with `span()`.

## Tests

- `tests/standard.test.tsx`: inert while off, the switch and usage, restore from the store, the three placements, narrow and wide widths on two surfaces.
- `tests/widget.test.tsx`: one test per acceptance line of the spec, named `A<n>: ...`. Tests use `ground()` from the kit for the store, files, clock and engine calls, and feed the widget data shaped like the real thing.

## Shared code

Plugins cannot import from one another, and the engine handle cannot be passed to imported code. So sharing takes three forms:

- `$.widgets` (the layout plugin): `card`, `stack`, `picture`.
- `hooks/lib.ts`: pure helpers, stamped into every widget.
- The template: the switch, the three render hooks and `show()`, which every widget starts from and the checker holds in shape.
