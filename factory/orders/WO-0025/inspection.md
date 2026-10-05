# WO-0025 Customs: inspection (second build)

Verdict: **pass**. The send-back's faults are gone, the build follows the revised spec, the live run on this build is good, and the idea (a fact from the real registry at the moment of the install decision) is beyond anything in the catalog.

## What was run
- `check.ts ... --spec`: PASS.
- `render.ts` at rest, `--turns 1`, `--turns 3`: the empty card, matching the spec's drawing at 20, 40 and 60 (the demo engine has no install yet; see finding 3). Verbs: `show` -> `Nothing checked yet.`, `trust Left_Pad` -> `Customs trusts left-pad.`, `trust`, `trust ../x`, `trust a b`, `what` -> usage, `SHOW` works, `clear` -> `Customs cleared.`, `off` -> `Customs off.`
- Filled states and the parser were probed through a scratch copy outside the floor (nothing in the floor folder was touched). Frames that matter:
```
│ Customs                       2 held │   │ Customs   2 held │
│ ✗ sum-utils-fast              0 days │   │ ✗ sum-utils-fast │
│ first published 0 days ago, 1        │   │ first published  │
│ download last week                   │   │ 0 days ago, 1    │
│ ✗ nope                     not found │   │ download last    │
│ ? unknownpkg               unchecked │   │ week             │
│ ! lodash            3.10.1 → 4.17.21 │   │ ✗ nope           │
│ ! a-very-long-package-name-that-goe… │   │ ? unknownpkg     │
│ ✓ express                     4.21.2 │   │ ! lodash         │
```
  No row passes the inner width at 20, 29, 30, 40 or 60; a fact too long for its row is dropped and the name cut with `…`; plurals are right (`1 download`, `0 days`). The gate line reads `sum-utils-fast: first published 0 days ago, 1 download last week (+1 more)`. After `trust NOPE` the 404 name is still drawn red but no longer raises or carries `[held]`.
- The send-back's cases, URLs actually asked: `pip install requests 2>&1 | tail -5`, `> install.log`, `npm install lodash > out.log 2>&1`, `# add lodash; npm i evil`, `--python-version 3.12`, `uv add --group dev`, `--loglevel error` each ask only the real name. Also clean: `npm install -g typescript@5 2>/dev/null || true`, `pip install -U pip setuptools wheel`, `pip install "requests>=2; python_version<'3.8'"`, `pip install pkg @ https://x/y.whl`, `npm i lodash@npm:other@1` (nothing), a 300-letter name (looked up, no throw), `a?b`, `a#b`, `%2e%2e/x`, `../../etc/passwd` (nothing; no path or query can reach the URL), `-i`/`--index-url=` (nothing asked), ten names (eight asked).
- `register.tsx` read against the standard: both `tool.check` hooks return `next(e)` first while off; verbs never switch on; no timer and no module-level `let`; the 4 s sleep takes `next.signal` and its rejection is caught; a late answer after `off` or `clear` cannot write back; the store gets `isOn` and `trusted` only; the widget never answers `allow` or `deny`; every failure path is `unchecked`, never `missing`.
- Tests: A2 and A3 now carry the redirection, comment, value-flag and digits cases with recorded URL lists; the rest stand as vetted last time, with registry-shaped bodies and the verdict object beneath.

## Live run (director's, `live.txt`, made after this build)
Good. `on` answered as specified. `npm install customs-live-zz9-no-such-package` was refused by the headless host with `decision_reason_type: hook` and the gate line as its reason. `show` listed it `[held]` and `is-odd (npm): on npm 11 years, 1M downloads last week, latest 3.0.1`, so real registry bodies parse. The store held `isOn: false` and nothing else. `npm` is not on the scratch Bash PATH, so the dry run failed after its name was checked: the machine, not the widget. Real packuments of `react`, `typescript` and `next` (1.4 to 2.4 MB compressed) come back in well under a second here, inside the 4 s limit.

## Findings (none blocking)

1. **Text inside quotes and heredocs is split like commands** (`parsed()`, per the spec's Segments rule). `git commit -m "fix; npm install foo bar"` looks up `foo` and `bar`; a heredoc body with a line that starts with an install form (`cat > README.md <<EOF ... pip install myproject ... EOF`, or a commit message written through `cat <<'EOF'`) looks up that name. With a real package the only effect is a row for something not installed; with an unpublished name the write or commit is held with `myproject: no package named myproject on PyPI` and the name goes to the registry. It needs an install form at the start of a line or after `;` inside the text, which is rare, and it errs toward an ask. Right, for a later rebuild: split outside quotes only, and read nothing after a `<<` word until the command ends. The README row should say that install lines inside a heredoc are read too.

2. **A backslash line continuation is a miss.** `npm install \` then names on the next lines reads nothing (the first segment holds only `\`, the next starts with no form). Silent, never a false hold. Right, later: join `\`-newline before the split.

3. **Demo** (`docs/engine.js`, the clerk's work): it still lacks the scripted install and the URL-answering `http.fetch` of the spec's Demo section, so `render.ts --turns` and the demo page show only the empty card. The clerk must add both stand-ins so the page shows `1 held`, `✗ sum-utils-fast  4 days` and `! lodash  3.10.1 → 4.17.21`.

4. **`trust` with no name while off answers the usage,** not `Customs is off.` (`command.run`, the usage test comes before the off test). `trust x`, `show` and `clear` while off answer `Customs is off.` as A12 says. Harmless.

5. **Known misses, as the spec accepts:** PowerShell `2>$null` (the segment holds `$`), `pnpm add -w`, `time npm install x`, capitals (`npm install LoDash`). All silent; the README row should name the first.

6. **Names past the eighth of one command get no row** rather than an `unchecked` one; the list holds eight, so nothing visible differs, and A9 proves no fetch.
