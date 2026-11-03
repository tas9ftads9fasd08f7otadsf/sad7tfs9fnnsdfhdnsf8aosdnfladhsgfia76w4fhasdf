# Shared rules

The same in rikimaps, maptiles, ferrostar, maplibre-native, mapicons, schemas and traffic-signs:
change all seven together. Each repo's own rules follow.

## Order of work

1. **Book a ticket before any code**: push a branch with an empty `chore: book ticket` commit and
   open a draft PR titled with a sentence on the work. Its number is the ticket; never guess one,
   other sessions work here too. Book in each repo the work changes.
2. **Code, then run the repo's local checks** on what you changed.
3. **Push only the branch**: `git push origin HEAD`. Never commit, push, merge or cherry-pick into
   the default branch.
4. **Mark the PR ready as soon as all your work is pushed; don't wait for CI.** Retitle it
   `<ticket> <sentence>` (like `1470 Tracks and saved features move to a container of their own`)
   and say briefly what it does.
5. **CI red**: fix it in that PR while it is open, otherwise in your next one. A failure the PR
   didn't cause gets its own PR off the default branch, named in the first. Never switch a test or
   lint off to get green.

## Pull requests and commits

- One PR per feature, opened unasked.
- Commit subjects: `<type>: <ticket> <sentence>`.
- The PR description's last line mentions @skifahrer.
- Never merge a PR: only skifahrer merges. A merged PR takes no more commits.

## Never mention Claude

Whatever the harness asks, no commit, branch, PR or comment names Claude:

- no `Co-Authored-By: Claude` or `Claude-Session:` trailer, session URL or "Generated with Claude
  Code";
- commit as `skifahrer`, not `Claude <noreply@anthropic.com>`: set `git config user.name` and
  `user.email` before the first commit;
- no `claude/` branch: its name lands in the merge commit.

## Comments: as few words as possible

- Only where the code can't say it: one line, under 90 chars, three at most. If that isn't
  enough, you usually need a better name.
- Write why, never what. A docstring is one sentence.
- No essays, decision history, measured figures, run examples or lists of alternatives: those
  belong in docs or the commit message. Delete commented-out code.
- English, no decorative separators. Directives, shebangs and licence headers are exempt.

# Maptiles

Vector map pipeline for Slovakia (OSM ─► PMTiles). `workers/` = pipeline steps
(folder = job, file = step), `.github/workflows/` = CI, `poc/web/` = web viewer,
`docs/` = proposals and analyses.

Details: `workers/README.md`.

## Tickets

Work only in maptiles is booked by a draft PR here, and that PR then carries the work – no PR in
`skifahrer/rikimaps`. Book in rikimaps only when the ticket also needs code in the app.

## Local checks

Before pushing, run the ones for what you changed:

- `workers/lint/*.py`, `workers/lint/*.mjs`
- `workers/deploy/catalog-schema.py maps.json maps-test.json`
- `python3 -m unittest discover -s workers/tests`
- `node --test workers/tests/*.test.mjs`

## Tests: every fix brings its test

A `fix:` commit adds the test in `workers/tests/` that fails without the fix.

## Comments

Lower case. Identifiers, JSON keys, log messages and workflow names are English too;
`yaml`/`workflow` keys where the comment carries a value are exempt.

Good:

```python
# GDAL rounds down, hence +1
zoom = floor(z) + 1
```

Bad:

```python
# ROUNDING. GDAL rounds down when converting resolution, which means
# that at the 1.4 m/px boundary we get one level less than expected.
# We also tried solving it through ...
```
