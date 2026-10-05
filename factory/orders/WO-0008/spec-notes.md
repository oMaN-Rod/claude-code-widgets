# Spec notes, WO-0008 (done-widget), spec review after the third send-back

Only line 24 (now lines 24 to 31), A8 and A9 changed. Every answer quoted in A8 and A9 was walked through the six steps by hand and lands where the acceptance line puts it. The notes of the first review were settled in the build and held through three inspections; keep that behaviour as it is (duplicates compared ignoring case, `drop 02`, the literal tool name in the hook filter).

1. Hedge words, claim words, closers and process names match as whole words. `no` must not match inside `now` (a closer: `The fix is complete now.` nudges), `open` not inside `opened`, `if` not inside `diff`, `go` not inside `going`.
2. Item texts are taken out in step 1 as literal text, compared in lower case. Escape them if a pattern is built from them: an item such as `the build passes (ci.yml)` or `a+b works` must not throw or match more than itself.
3. Step 2 drops a sentence that ends in `?`. Judge that with trailing symbols aside, as step 4 does, so `**Is it done?**` and `Is it done?"` are dropped too.
4. Step 2 splits after every `.`, so `src/client.ts` and `1.5` are split mid-word. That is harmless for every quoted answer; do not add a rule for it.
5. Step 5's command names include `go` and `make`, which are also plain words (`Good to go, done.` is unaffected since the comma splits; `what I set out to make is done` is not directly before the claim). Leave the list as written; inspection will try a few of these and accepts either outcome.
6. `Done: 14 pass, 0 fail.` nudges and `Done: 14 pass, 2 fail.` does not; make sure the count is read as a whole number, so `10 failures` counts and `0 failures` does not, and `20 fail` is not read as `0 fail`.
7. The 400,000-character bound in line 25 has no acceptance line. Keep the patterns free of nested repetition; inspection will time it again.
