#!/usr/bin/env bash
# `mountain: all` builds nothing itself: one mountain run per range, side by side.
# From the environment: REPO REF REBUILD TEST GH_TOKEN, SELF (default mountain.yml).
set -euo pipefail

SELF="${SELF:-mountain.yml}"
SUMMARY="${SUMMARY:-${GITHUB_STEP_SUMMARY:-/dev/null}}"
ranges="$(python3 workers/mountain/plan.py --ranges)"
# an empty list would end green with nothing built
[ -n "$ranges" ] || { echo "::error::\`maps.mountains.ranges\` has no range."; exit 1; }

{
  echo "## Mountain batch · all ranges"
  echo ""
  echo "One **$SELF** run per range, side by side."
  echo ""
} >> "$SUMMARY"
for range in $ranges; do
  gh workflow run "$SELF" --repo "$REPO" --ref "$REF" \
    -f mountain="$range" \
    -f rebuild="${REBUILD:-nothing}" \
    -f test="${TEST:-false}"
  echo "- \`$range\`" | tee -a "$SUMMARY"
done
