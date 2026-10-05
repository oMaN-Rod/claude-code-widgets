# Moon: spec (WO-0002, rebuild)

## Purpose

For the person who likes to know what the sky is doing while they work, and enjoys an omen before a deploy. The card shows the real moon right now: a disc lit the way it looks from their hemisphere, the phase, how lit it is, a countdown to the exact moment of the next full moon, and one line of deploy folklore. It needs no network and no setup beyond `south` for a southern sky.

## Card

Title `Moon`. Note `<n>% lit`. Left: working (any ordinary night). Middle: best moment (full). Right: busiest state at 20 columns.

```
╭──────────────────────────────────────╮  ╭──────────────────────────────────────╮  ╭──────────────────╮
│ Moon                         84% lit │  │ Moon                        100% lit │  │ Moon    100% lit │
│    ░░██████                          │  │    ████████                          │  │   ██████         │
│  ░░██████████                        │  │  ████████████                        │  │ ██████████       │
│ ░░████████████  Waxing gibbous       │  │ ██████████████  Full moon            │  │ ██████████       │
│ ░░████████████  Full in 3d 16h       │  │ ██████████████  Peak in 5h 12m       │  │ ██████████       │
│ ░░████████████                       │  │ ██████████████                       │  │   ██████         │
│  ░░██████████                        │  │  ████████████                        │  │ Full moon        │
│    ░░██████                          │  │    ████████                          │  │ Peak 4h 47m ago  │
│ Nearly full. Finish it.              │  │ Folklore says: do not deploy.        │  │ Folklore says:   │
╰──────────────────────────────────────╯  ╰──────────────────────────────────────╯  │ do not deploy.   │
                                                                                    ╰──────────────────╯
```

- **Empty and error**: none. The card is computed from the clock alone, so it always has a moon to show.
- **Disc**: `$.widgets.picture`, a circle of lit (`0xf2e9c4`) and dark (`0x30363d`) pixels, no fill. Size in cells by card width: under 38, 10 x 5 above the text; 38 to 55, 14 x 7 beside the text (`columnGap` 2, text centred vertically); 56 and over, 18 x 9 beside it. The picture is asked for twice those numbers in pixels.
- **Off the terminal** (`e.surface !== 'terminal'`) no picture is asked for. One `Text` row, the bar, takes its place: the disc's middle row, as wide as the disc in cells, `█` lit and `░` dark.
- **Name** bold, yellow when it is `Full moon`. **Countdown** dim. Both `wrap="truncate-end"` and never over 16 characters. **Lore** dim italic, `wrap="wrap"`, under everything.
- With `e` the elongation in degrees: lit = `round((1 - cos e) / 2 * 100)`. Within 6 of 0, 90, 180, 270 the name is New moon, First quarter, Full moon, Last quarter; between them Waxing crescent, Waxing gibbous, Waning gibbous, Waning crescent.
- Countdown: `Full in <span>` to the next full-moon moment. While the name is Full moon: `Peak in <span>` before the moment, `Peak <span> ago` after it (the nearest moment). Durations through `span()`.
- Disc pixel at `x, y` in -1..1 (pixel centres), `half = sqrt(1 - y*y)`: outside when `|x| > half`; lit when `e < 180 ? x > half * cos e : x < -half * cos e`. South mirrors `x`. The bar is the same rule with `half = 1`.
- Lore, in name order from New moon: `Dark sky. Start something.` / `Begun now, it grows.` / `Half lit. Decide what ships.` / `Nearly full. Finish it.` / `Folklore says: do not deploy.` / `Light fades. Delete code.` / `Let go of what did not work.` / `Rest. A new cycle is near.`

## Commands

`/moon-widget [on|off|north|south]`

- bare, `on`, `off`: the switch, as the template. Answers `Moon on; /widgets places it.` / `Moon off.`
- `north`, `south`: which way up the disc is drawn. Saves the choice and answers `Moon drawn for the northern sky.` / `Moon drawn for the southern sky.` While off: answers `Moon is off; /moon-widget on shows it.` and changes nothing.
- anything else: `Usage: /moon-widget [on|off|north|south]`, changes nothing. There is nothing collected, so no `clear`.

## Data

- `session.start`: `$.command.register` (argumentHint `[on|off|north|south]`), `$.store.get('isOn')`, `$.store.get('isSouth')`, then `sync`.
- `command.run` `{ command: 'moon-widget' }`: `$.store.set`, then `sync`.
- `ui.render` x 3 (template): `$.clock.now()` once per paint; `$.state.get` of the layout's `site` and `widths`; `$.widgets.picture`, `$.widgets.card`.
- `$.clock.every(60_000)` while on (in `sync`): bumps the `tick` atom so the countdown repaints. No other hook, no network, no files.
- Elongation at `now` (Meeus, truncated; this replaces the mean lunation). `T = (now / 86400000 + 2440587.5 - 2451545 + 69 / 86400) / 36525`. In degrees: `L = 218.3164477 + 481267.88123421 T`, `D = 297.8501921 + 445267.1114034 T`, `M = 357.5291092 + 35999.0502909 T`, `M' = 134.9633964 + 477198.8675055 T`, `F = 93.272095 + 483202.0175233 T`, `E = 1 - 0.002516 T`.
  Moon = `L + sum / 1e6`, summing `c * sin(d*D + m*M + p*M' + f*F)` (times `E` when `m` is not 0) over `d m p f c`:

```
0 0 1 0 6288774 | 2 0 -1 0 1274027 | 2 0 0 0 658314  | 0 0 2 0 213618  | 0 1 0 0 -185116 | 0 0 0 2 -114332
2 0 -2 0 58793  | 2 -1 -1 0 57066  | 2 0 1 0 53322   | 2 -1 0 0 45758  | 0 1 -1 0 -40923 | 1 0 0 0 -34720
0 1 1 0 -30383  | 2 0 0 -2 15327   | 0 0 1 2 -12528  | 0 0 1 -2 10980  | 4 0 -1 0 10675  | 0 0 3 0 10034
4 0 -2 0 8548   | 2 1 -1 0 -7888   | 2 1 0 0 -6766   | 1 0 -1 0 -5163  | 1 1 0 0 4987    | 2 -1 1 0 4036
2 0 2 0 3994    | 4 0 0 0 3861     | 2 0 -3 0 3665
```

  Sun = `280.46646 + 36000.76983 T + (1.914602 - 0.004817 T) sin M + 0.019993 sin 2M + 0.000289 sin 3M`. `e = (Moon - Sun) mod 360`.
- A full-moon moment: start at `now`, eight passes of `t += (delta / 360) * 29.530588853 days`, `delta = (180 - e(t)) mod 360`, taken as -180..180 after the first pass (for the nearest moment, on every pass). Checked on the floor: this gives every 2026 new, quarter and full moon within 2 minutes of the published times.

## State and storage

- `$.state` `isOn: boolean` (false), `isSouth: boolean` (false), `tick: number` (0). Types file declares `MoonSwitch`, `MoonSouth`, `MoonTick`.
- `$.store` `isOn: boolean`, `isSouth: boolean`; read at `session.start`, written by the command only. A stored value that is not `true` reads as false.
- Module-level `let timer`. No files.

## Off

The card is not drawn, the minute timer is cancelled, and nothing is read from the clock or written to the store. `north` and `south` do nothing while off.

## Demo

At rest: the working card at 40 columns with today's real moon, from the browser's clock through `$.clock.now()`. The scripted turn changes nothing; the moon does not follow the session. No stand-in data needed.

## Cost

None.

## Acceptance

Times are UTC, set with `ground(on, { now })`. "Bar" lines mount on the `desktop` surface; picture lines on `terminal`.

- A1: at 2026-10-22T12:00 the card shows note `84% lit`, `Waxing gibbous`, `Full in 3d 16h` and `Nearly full. Finish it.`
- A2: at 2026-10-14T12:00 it shows `14% lit`, `Waxing crescent`, `Full in 11d 16h` and `Begun now, it grows.`
- A3: at 2026-10-25T23:00 (best moment) it shows `100% lit`, `Full moon`, a countdown matching `^Peak in 5h \d\dm$`, and `Folklore says: do not deploy.`
- A4: at 2026-10-26T09:00 it shows `Full moon` and a countdown matching `^Peak 4h \d\dm ago$`.
- A5 (fault: a day out): at 2026-02-03T06:00, where the mean lunation said full, the card shows `Waning gibbous` and `Full in 28d 5h`, and no text says `Full moon`.
- A6 (fault: a day out): for the published full moons 2026-01-03T10:03, 2026-02-01T22:09 and 2026-10-26T04:12, the countdown matches `^Peak in ` 15 minutes before and ` ago$` 15 minutes after.
- A7: 2026-10-18T16:00 shows `First quarter` and `50% lit`; 2026-11-01T20:00 `Last quarter` and `50% lit`; 2026-11-09T07:00 `New moon` and `0% lit`; each with its own lore line.
- A8 (fault: northern only): at 2026-10-18T16:00 and 40 columns the bar is `░░░░░░░███████`; after `south` it is `███████░░░░░░░`, the answer is `Moon drawn for the southern sky.` and the store holds `isSouth: true`; `north` brings the first bar back and stores `false`.
- A9: on the terminal at that time, the picture's `cells` differ between `north` and `south`.
- A10: a session started with `{ isOn: true, isSouth: true }` in the store draws the southern bar with no command run.
- A11: while off, `south` answers `Moon is off; /moon-widget on shows it.`, writes nothing, and the widget stays off and northern.
- A12: `/moon-widget sideways` answers `Usage: /moon-widget [on|off|north|south]` and changes neither the switch nor the hemisphere.
- A13 (fault: the disc at 20 columns): on the terminal the picture is 14 x 7 cells at 40 columns, 10 x 5 at 20 and at 37, and 18 x 9 at 60 after `widen`.
- A14 (narrow card): at 20 columns the disc or bar comes before the name in the body, the bar is 10 characters, and at each of the times in A1 to A7 the name and countdown are at most 16 characters.
- A15: off the terminal no picture is drawn (no `Raster`, no `no picture` text) and the bar is 14 characters at 40 columns and 18 at 60.
- A16: the bar is all `█` at 2026-10-26T04:12, all `░` at 2026-11-09T07:00, and `███████░░░░░░░` at 2026-11-01T20:00 (waning, north).
- A17: every lore line is at most 30 characters and has no word over 16, so it wraps to two rows at 20 columns.
- A18: with the card mounted at 2026-10-25T23:00, advancing the clock one hour changes the countdown to match `^Peak in 4h \d\dm$` with no command run.
- A19 (fault: untested standard): the five standard tests pass unedited, and after `off` an hour of clock makes no write and the `tick` state does not change.

## widget.json

```json
{
  "title": "Moon",
  "category": "Scenes",
  "shows": "The real moon right now, drawn for your hemisphere, with a countdown to the next full moon and what it means for your deploy",
  "commands": ["/moon-widget [on|off|north|south]"],
  "cost": ""
}
```
