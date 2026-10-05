# Seen

`seen-widget` - `/seen-widget [on|off|open <n>|clear]`

## What it shows

The pictures Claude looked at this session: image files it read, screenshots it took, images that came back in MCP tool results. Each is drawn on the card as Claude received it, newest first, with where it came from (file path or tool name), its size and the turn. `/seen-widget open <n>` opens the full-size picture in the person's own viewer.

At rest: "No pictures yet: appears when Claude reads an image or takes a screenshot."

At its best: Claude reports "the page renders correctly" and the card beside that sentence shows the screenshot it judged from, a blank white page or an error overlay.

## Why it is remarkable

In a terminal the person never sees what Claude sees. The transcript says an image was read and nothing more, so every claim Claude makes from a picture is taken on faith. This card puts the evidence next to the claim, and the person checks the picture instead of the sentence.

Closest existing widgets: `pen-widget` (shows what Claude is writing) and `footnotes-widget` (checks Claude's claims against the tree). Neither touches images. No shipped or waiting widget uses the `Image` element or reads image content from a tool result. This is a new sense for the catalog, not a variation.

## Sharpened

- The `open` verb is the part that works on every terminal and must be first-class, not an extra. The thumbnail is the invitation; the full picture in the OS viewer is the check.
- Keep the card to the latest picture drawn large plus a numbered one-line list of the few before it. A grid of tiny thumbnails says nothing at 40 columns.
- For an image that came from a file Claude read, keep the path and never copy the bytes: draw and open from the path.

## API it needs (checked against the types file, 2.1.289)

- `on('tool.call')` awaiting `next(e)`: the Read result for an image file carries base64 with `media_type` of `image/png | image/jpeg | image/gif | image/webp`; an MCP result's `content` is `McpContentBlock[]`, where an `image` block declares `mimeType`.
- `Image` element (`ImageProps`: `source`, `columns`, `rows`, required `alt`, optional `key`). `ImageSource` is `{ png }` base64, `{ rgba, width, height }` (1 to 2048 each side), or `{ file, format: 'png' }` read by the terminal itself. Base64 sources are capped at 2 MiB decoded.
- `$.ui.blit` to swap a keyed Image without a redraw.
- `$.widgets.picture` (kit) for the fallback thumbnail where `Image` cannot draw.
- `$.fs.write` under `$.plugin.root` for a picture that arrived only as base64, then `$.process.run` with `cmd /c start`, `open` or `xdg-open`.
- `session.start`, `command.run`, `ui.render`, `$.state`.

## Cost

No model calls, nothing added to context. A few pictures held in session state. A file is written to disk only when the person opens a picture that arrived as base64. The card changes only when Claude looks at a picture.

## Risks the designer must settle

1. Terminals without the kitty graphics protocol. `Image` draws only `alt` there (Windows Terminal, anything through tmux), and the repo owner is on Windows. The fallback must be a real thumbnail from `$.widgets.picture`, which needs decoded pixels. Find out first whether the module environment has `DecompressionStream`; if not, a small pure-JS inflate for PNG is the price. Decide how the card knows which path to take, since the engine does not report it: a `/seen-widget` view switch may be needed.
2. JPEG, GIF and WebP. Do not write a JPEG decoder. Find out what the Read tool actually hands back for a PNG file (it may be resized or re-encoded) and what the common screenshot tools return. A picture that cannot be decoded is shown as a row with its name, type and size, and `open` still works. If most real screenshots turn out to be JPEG, say so in the spec: the thumbnail then depends on a kitty-protocol terminal, and the designer should send the order back rather than ship a card that is mostly rows of text.
3. Size. A base64 source over 2 MiB decoded cannot be passed to `Image`; use `{ file, format: 'png' }` for files on disk and a downscaled `{ rgba }` otherwise. Bound what is kept in `$.state` (the last few pictures, thumbnails only, originals by path or dropped).
4. Loader rules. Check the mod validator's limits on `$.state` size and on what may cross into the module before planning to hold image bytes there.
5. Files written for `open`. Name them under `$.plugin.root`, remove them on `clear` and on switching off, and never write one without the verb being typed.
6. Sensitive pictures. A screenshot can hold anything on the person's screen. Nothing leaves the machine, nothing is kept across sessions.
7. Subagents. Decide whether pictures a subagent read are shown, and mark them if so.
8. The demo page. `docs/view.js` has no `Image`; the stand-in needs a way to draw one, and a scripted turn that reads a picture.
