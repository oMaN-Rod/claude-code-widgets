# Spec notes, WO-0026 Seen (third review, after the inspection send-back)

No blocking fault. Both design findings of the inspection are answered: no pixel is decoded in the `tool.call` hook, the thumb is drawn afterwards by a timer job in slices, the ceiling (4 200 000 pixels, sides to 4096) rests on the rate measured in `claude plugin test`, and a PNG past it shows `No preview for PNG here.` with `open` still working. The arithmetic holds: 12 rows a slice and 60 slices for 1280×720, 8 rows and 135 slices for 1920×1080, about 34 ms a slice at 2.1 microseconds a pixel. `$.clock.every` ("at least 1", "One `clock.every` dispatch per period"), `Timer.cancel`, `HookBudget.ms` 10 000 and "no `WebAssembly`" are all in the 2.1.289 types file; `docs/engine.js` has `clock.every` for the demo. Build findings 3 to 7 are taken up (`SLOW` and five runs, `(no path)`, the usage past 9 digits, control characters, the page separator). 117 lines, 15 acceptance lines. Settle these while building; they are looked at on inspection.

New with this revision

1. Where the base64 of the kept picture is decoded is not said. Decoding up to 4 000 000 characters is not free at the plugin runtime's speed: it must not happen in the capture (the 50 ms ceiling) nor all in one slice (the 100 ms ceiling). Decode it inside the generator, in pieces, and include it in the measured figures.
2. `sync` after a capture runs inside the `tool.call` hook. It may only cancel, read a slot and start the timer there; the first slice belongs to the first tick, never to the hook.
3. The job's last step and a capture can both write `shots`. Write through `update` on the current list and match by id, so a thumb finishing late neither brings back a dropped shot nor wipes a new one. A14's "no later tick writes state" covers off; do the same for `clear`.
4. Slices of about 35 ms with 5 ms between them keep the plugin busy most of the time for 2.5 to 11 s. If typing or the spinner stutters in a real session while a thumb is drawn, report it as a fault of the spec with the measurement; do not hide it by shrinking the slice silently.
5. On a pixel terminal the `Image` is drawn at once, yet the shot is still pending and `show` says `preview coming` until the job ends. Either word is acceptable, but `show` must not say `no preview` for a picture the card is drawing.
6. An earlier pending picture overtaken by a newer one ends with no thumb; `show` then says `no preview` for it. That follows the spec; keep the card's one-row form for it and never start a job for a shot that is not the newest.
7. The card grows by about nine rows when the thumb lands. Draw the pending row in the picture's place so that nothing else on the card reorders.
8. The live line expects `preview` at `show`, one prompt after the `Read`. If the headless session fires no timer between turns the answer is `preview coming`; the spec calls that a fault, so report it and do not start the job from `show` to make the line pass.
9. Log the two measured figures (capture, longest slice at 1920×1080, in `claude plugin test`) in the build stamp; the inspection repeats them.

Carried over, still open in the drawings or the text

10. Head row at 20 columns: the drawing still shows `#7 …/out/shot.p…`, cut at the end. The Card rule and A15 win: cut from the start, as the build already does.
11. Detail row at 20 columns: `14:02 · PNG · 2…` cuts a number. Drop whole parts instead (time first), keep ` · agent` when it fits whole, as the build already does.
12. `No preview for <TYPE> here.` (25) and `Not kept: too large.` (20) do not fit 16 cells. Keep the built short forms under 30 columns (`No JPEG preview`, and a short too-large form), next to the spec's `Drawing…`.
13. `show` for an MCP picture: print the full tool name once, not the tool and then its short name again.
14. The `data:` media type written to the page is one of the four known types, never the declared string as received.
15. `rundll32` exits 0 even when nothing opened; `Opened` claims only that the call was made. The owner runs `open` once by hand before shipping.
16. `types/index.d.ts` must gain `isPending` on `SeenShot` and keep `kept` as the `StateFamily`.
