#!/usr/bin/env bash
# Job `settings` – the run's first job: the form and what map-settings.json gives the target.
# Its own job, so it isn't buried under the 380 MB PBF download of `plan`.
set -euo pipefail

OUT="$RUNNER_TEMP/settings.md"
: > "$OUT"

python3 workers/plan/summary-inputs.py \
  --inputs="$INPUTS_JSON" \
  --workflow="${WORKFLOW:-.github/workflows/build-map-region.yml}" \
  --with-env >> "$OUT"

# without `--out`: this job only shows, `plan` resolves again and fails the same way
python3 workers/plan/options.py \
  --rebuild="${OPT_REBUILD:-nothing}" \
  --region="${OPT_REGION:-}" \
  --mountain="${OPT_MOUNTAIN:-}" \
  --test="${OPT_TEST:-false}" \
  --publish-pages="${OPT_PUBLISH_PAGES:-false}" \
  --summary="$OUT"

# summary is read on a phone, the log can be grepped
cat "$OUT" >> "$GITHUB_STEP_SUMMARY"
cat "$OUT"
