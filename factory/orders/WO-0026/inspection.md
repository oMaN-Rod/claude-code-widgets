# Inspection, WO-0026 Seen (`seen-widget`), third build

Verdict: **pass.** The two design faults and five build findings of the last inspection are all answered, the checker is steady, and the measured cost is well inside the spec's ceilings.

## What was run

- `check.ts --spec`: 3 runs, 3 passed (the last build failed 3 of 5).
- `render.ts` at rest, `--turns 1`, `--turns 3`: the empty sentence at 20, 40 and 60 columns, no torn
  border. The demo engine has no picture yet (the spec's stand-in is not in `docs/engine.js`), so the
  working states were drawn from a scratch copy under `claude plugin test` with my own probe file;
  nothing in the floor folder was touched.
- Live run: read from `live.txt` (the director's run on this build, made after the last file change).
  `on` and `off` answered as specified; `Read` handed back `image/png`, 70 B, unchanged; `show`
  answered `#1 Read C:\Users\O\.claude-factory\scratch-project\seen.png: PNG 1×1, 70 B, 08:44, preview`,
  so the listing, the timer and the inflate all run in the real module; the store holds `isOn: false`
  and nothing else.

## Measured in `claude plugin test` with realistic pictures (noisy RGBA, all five row filters)

| picture | file | capture, wall time of the whole call | slices | decode in all | longest tick |
|---|---|---|---|---|---|
| 1280×720 | 694 KB | 51 ms | 60 | 0.9 s | 51 ms (first, cold) |
| 1920×1080 | 1.55 MB | 54 ms | 135 | 1.7 s | 21 ms |
| four 1920×1080 in one MCP call | 6.2 MB | 221 ms | 135 (newest only) | 1.6 s | 22 ms |

The capture figures include the test harness and the state calls, which the hook budget does not
count; they agree with the build stamp (14 to 17 ms in the hook). No slice comes near 100 ms. The
thumb of the 1080p fixture is right: red bar on top, grey text below.

## Frames that matter (rows inside the card)

```
40 columns, four screenshots from one call          20 columns, same state
#7 browser_take_screenshot 1920×1080                #7 browser_take…
(36 by 10 raster)                                   (16 by 5 raster)
14:13 · PNG · 1.6 MB                                PNG · 1.6 MB
/seen-widget open for full size                     #6 browser_take…
#6 browser_take_screenshot       PNG                #5 browser_take…
#5 browser_take_screenshot       PNG                #4 browser_take…

40 columns, too large to keep                       20 columns, subagent JPEG
#8 …rk/project/out/top.png 2560×1600                #14 screenshot
Not kept: too large.                                No JPEG preview
14:13 · PNG · 3.0 MB                                134 B · agent
```

Three image `Read` calls at once (1080p, 720p, JPEG) end as `#3`, `#2`, `#1` each with its own bytes in its own slot, one thumb for the newest, and the timer idle afterwards. 
## Tried to break it

No throw and no vanished card for: an empty base64 string, a PNG header of 0 by 0, a numeric
`file_path` (`(no path)`), a 300-character Windows path, a long MCP tool name, `mcp__x`, an upper-case
media type, a media type with parameters (ignored), blocks that are `null`, numbers or strings, a JPEG
labelled PNG, 4096×1 and 1×4096 headers. `OPEN 1`, `open -1`, `open 01`, `open 000`, `open 1 2`,
`show all`, `clear all`, `on now`, `toggle` answer the usage or the right sentence; `open 999999999`
answers `No picture 999999999. The card holds #11 to #14.` Off empties `shots`, all four slots and
the page, and `show`, `open`, `clear` then answer `Seen is off.` with no timer left.

## Code read

`tool.call` returns `next(e)` first thing while off and always hands back `ran` itself; no pixel is
decoded in it. The one timer starts and stops in `sync`; a finished or failed job cancels itself and
writes only to the shot with its own id while that shot is still pending. The page title is escaped,
the media type comes from a fixed table and the data is stripped to base64 letters. The store holds
`isOn` only. The tests feed real-zlib fixtures and assert pixels, slots, argv and file contents; they
prove their lines.
## Findings (none blocking)

1. Note. Wide characters are counted as one cell (`register.tsx` `tail`, `cut`, `headline`): a CJK path
   overruns the row and the terminal cuts it at the end, losing the `<W>×<H>` or type at the right. The
   border holds. Right looks like a cell-width count; worth a later rework, not a send-back.
2. Note. A realistic 2560×1600 screenshot (3.0 MB, 4.01 M base64 characters) passes the 4 000 000
   keep limit: it is listed with `Not kept: too large.` and `open` cannot show it. This is the spec's
   limit, working as written; the owner should know the Retina full-screen case shows no picture.
3. Note. Base64 that carries line breaks is listed and `open` shows it, but the thumb job fails and
   the card says `No preview for PNG here.` No tool seen so far sends it that way.
4. Carried from the spec: `open` has never been run for real by an agent, and `rundll32` exits 0
   whatever happens. The owner runs `/seen-widget open` once by hand before shipping.
5. For shipping: the demo needs the spec's stand-in call in `docs/engine.js`; without it the demo
   card stays on the empty sentence.
