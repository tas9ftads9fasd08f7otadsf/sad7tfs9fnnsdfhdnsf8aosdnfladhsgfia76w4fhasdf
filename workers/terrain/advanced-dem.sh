#!/usr/bin/env bash
# Is the region's 2 m DMR 5.0 cut in the store, for the advanced height model?
#
# The cut is a cut-out like a range's (`ugkk-<key>.tif` in `dem-ugkk`), its key the
# region's with `_2m`; `Data · DMR 5.0` makes it from the 2 m overviews when missing.
#
#   REGION_KEY=bratislavsky GDRIVE_CREDENTIALS=… workers/terrain/advanced-dem.sh
#
# Into $GITHUB_OUTPUT: `area_key`, `asset`, `missing` (true/false).
set -euo pipefail
: "${REGION_KEY:?region key}"
HERE="$(dirname "$0")"
WORKERS="$(dirname "$HERE")"
OUT="${GITHUB_OUTPUT:-/dev/null}"

KEY="${REGION_KEY}_2m"
TARGET=$(python3 "$WORKERS/dem/target.py" --source=dmr5 --area-key="$KEY")
STORE=$(printf '%s\n' "$TARGET" | sed -n 's/^store=//p')
ASSET=$(printf '%s\n' "$TARGET" | sed -n 's/^assets=//p')
# a Drive error must fail here: "missing" would start an hour of cutting for nothing
NAMES=$(python3 "$WORKERS/drive/store.py" --names --store="$STORE")
MISSING=true
if printf '%s\n' "$NAMES" | grep -qx "$ASSET"; then
  MISSING=false
  echo "Advanced height model: $ASSET is in store $STORE ✓"
else
  echo "Advanced height model: $ASSET isn't in store $STORE → cutting it from DMR 5.0 at 2 m"
fi
{
  echo "area_key=$KEY"
  echo "asset=$ASSET"
  echo "missing=$MISSING"
} >> "$OUT"
