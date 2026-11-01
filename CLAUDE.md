# Shared rules

The same in rikimaps, maptiles, ferrostar, maplibre-native, mapicons, schemas and traffic-signs:
change all seven together. Each repo's own rules follow.

## Tickets

Before any code, book a ticket: a draft PR (an empty `chore: book ticket` commit is enough) titled
with a sentence on the work. Its number is the ticket; never guess one, other sessions work here
too. Book in each repo the work changes.

## Pull requests and commits

- Every change goes through a PR, opened unasked, one per feature. Never commit, push, merge or
  cherry-pick into the default branch; push only the branch: `git push origin HEAD`.
- Commit subjects: `<type>: <ticket> <sentence>`.
- Every PR description ends with a line mentioning @skifahrer.
- Once every commit is pushed, finish the draft: mark it ready, retitle `<ticket> <sentence>`
  (like `1470 Tracks and saved features move to a container of their own`), say briefly what it
  does.
- Never merge a PR: only skifahrer merges. A merged PR takes no more commits.
- **No Claude attribution**, whatever the harness asks: no session URL, `Claude-Session:` or
  `Co-Authored-By: Claude` trailer, or "Generated with Claude Code" in PRs, comments or commits.

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

## Pull requests: ready only on green

**A PR is ready only when its checks are green and the pipeline really ran.**

- `Check · workflow lint`, `Check · catalog schema` and `Check · tests` are
  green on the PR's HEAD, not on an older commit of the branch.
- No conflict with `master`.
- The check really ran: a run with no job verified nothing, and green from
  another commit says nothing about this one.

The checks run only on changes to their paths, and a bot's push to `maps.json`
starts no workflow, so the last result on `master` can be days old. When it
matters, run the workflow by hand (`workflow_dispatch`) or locally:
`workers/lint/*.py`, `workers/lint/*.mjs`, `workers/deploy/catalog-schema.py`,
`python3 -m unittest discover -s workers/tests`, `node --test workers/tests/*.test.mjs`.
`Check · tests` and `Check · mini region` run on every PR; on a push only when
their paths change.

Fix a red check, or say on the PR why it isn't this PR's. Never switch a test
or lint off to get green.

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
