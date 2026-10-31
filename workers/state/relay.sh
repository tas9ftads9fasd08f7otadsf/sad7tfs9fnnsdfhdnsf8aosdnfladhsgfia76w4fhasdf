#!/usr/bin/env bash
# One relay leg of “Build map state”: wait for the running region, start the
# next, hand the relay to itself. The core is `workers/state/relay-core.sh`.
#
# How the batch differs from one region:
#   area          always `whole_region` – one range for eight regions makes no sense
#   publish_pages always off – Pages holds one map, eight runs would overwrite it
#
# Every setting is each region's own in `workers/data/map-settings.json`; the
# form's few fields are passed on whole every time, `workers/lint/state.py` guards it.
#
# From the environment (see `.github/workflows/build-map-state.yml`):
#   COUNTRY CONTINUATION REF SELF REGION_WF REPO SUMMARY GH_TOKEN REBUILD TEST
set -euo pipefail

SELF="${SELF:-build-map-state.yml}"
REGION_WF="${REGION_WF:-build-map-region.yml}"
REGION_NAME="Map · Build map region"

TITLE="Map batch · ${COUNTRY:-?}"
DESCRIPTION="Each region is its own run of **Map · Build map region**;
the batch starts them one by one and dispatches its own next run after each –
a job has a 6 h cap, a batch takes a day, so nothing can kill it."

# same workflow, same settings, another baton; settings go whole every time
hand_over() {
  local baton="$1"
  echo "Handing the relay over: continuation=$baton"
  gh workflow run "$SELF" --repo "$REPO" --ref "$REF" \
    -f country="$COUNTRY" \
    -f rebuild="${REBUILD:-nothing}" \
    -f test="${TEST:-false}" \
    -f continuation="$baton"
}

start_region() {
  local region="$1"
  gh workflow run "$REGION_WF" --repo "$REPO" --ref "$REF" \
    -f region="$region" \
    -f area=whole_region \
    -f test="${TEST:-false}" \
    -f rebuild="${REBUILD:-nothing}" \
    -f publish_pages=false
}

# shellcheck source=workers/state/relay-core.sh
. workers/state/relay-core.sh
relay_main
