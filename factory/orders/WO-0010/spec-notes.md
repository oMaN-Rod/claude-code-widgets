# Spec notes: WO-0010 Queue

No blocking fault. The machinist settles these while building; each is looked at again at inspection.

1. A queued prompt that never starts a model turn (a slash command such as `/clear`, or a prompt another plugin's hook swallows without a `drop`) leaves the run in phase `sent` for good: `▶` stays, nothing more is sent, and only off ends it. Decide what the person sees, at least say it in `report` (`Running: <task>`), and do not let it look like progress.
2. `step` reads `run === null` and then awaits `$.clock.now()` before it sets `run`. Take the prompt off `tasks` and set `run` before the first await (fill `startedAt` after), so two steps can never send the same prompt.
3. The same holds for `sync`: it is async, so two calls can overlap. Cancel and assign `timer` without an await between them, or a stale handle is left running.
4. The empty state with a gate set (A12 after `clear`, or `until` before any `add`): the spec says the card "returns to the empty state" and also that the gate row shows "when set". Draw the empty sentence and then `until: <gate>`; test A12 for both.
5. The tally with nothing clean reads `0 clean · 1 not` (short `0 ✓ · 1 ✗`). That follows the rule as written; keep it and make A6 assert the whole row, not only `1 not`.
6. The gate can be changed or removed while a run is in phase `gate` or between retries. Use the gate as it stands when the run settles; a run whose gate was removed mid-retry closes `clean` with note `''` at its next ended turn. The retry row must not show a gate that is no longer the one being run.
7. `start` with no halt, or with a run in progress and nothing waiting, answers `Queue running: 0 prompts waiting.` True, but check it reads sensibly; do not let `start` disturb a run.
8. A retry submission that rejects or is dropped closes the run the same way as a first submission (`prompt refused`). Cover it in A9 or A6.
9. A submit that rejects after its `turn.start` already moved the phase to `turn` must not leave both a closed run and a live turn; close the run once and ignore that turn's completion.
10. `drop 01`, `drop 1 2` and `drop -1`: digits only means the whole rest is digits; `01` may be taken as 1 or refused, but pick one and test it. The quoted echo is cut to 20 characters.
11. Retry text: the gate's output is cut to its last 40 lines of `stdout`, then `stderr`, then the last 4000 characters. Do the line cut on `stdout` before joining, and handle a 4 MB single-line output without splitting the whole string more than once.
12. A label of 80 characters with `…` in `report` and in `Dropped <n>: <label>` is fine; on the card every row is truncated by the card, so do not cut twice with two ellipses.
13. `ms` for a run closed by switching off needs `$.clock.now()` inside `command.run`; a run closed `stopped` before its turn started still reports a sane span (not negative, not `NaN`).
14. The gate command and the queued prompt may hold backticks or line breaks. The `Gate set:` answer and the retry text wrap the gate in backticks; keep the answer on one line.
15. Live run: on this machine `ComSpec` is set, so the gate runs as `cmd /c git --version`. `report` is typed before the queued turns can have finished, so expect `Nothing has finished yet.` or a partial count there; the proof is the two unasked turns and the store.
