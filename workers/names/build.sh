#!/usr/bin/env bash
# Geographical names from OSM → `{region}-names.pmtiles`; kinds and zooms in `names.yml`.
# Ranges, valleys and regions are often multipolygons, so the prefilter pulls members.
# Its share of the page size comes from `BUDGET_NAMES_PCT`.

set -euo pipefail
mkdir -p _site/tiles data steps-out
sudo apt-get update -qq
sudo apt-get install -y -qq osmium-tool

T_F=$(date +%s)
osmium tags-filter --overwrite -o data/names.osm.pbf \
  data/region.osm.pbf --expressions=workers/names/filter.txt

# regions and ranges ride in as border members far away; a z6 tile would hold them
workers/lib/region-cut.sh data/names.osm.pbf "$REGION_BBOX"

BEFORE=$(stat -c%s data/region.osm.pbf)
AFTER=$(stat -c%s data/names.osm.pbf)
echo "Prefilter: $(du -h data/region.osm.pbf | cut -f1) → $(du -h data/names.osm.pbf | cut -f1)"
printf '%s\t%s\t%s\t%s\n' "76" "Geographical names prefilter" "$(( $(date +%s) - T_F ))" \
  "$(( BEFORE / 1048576 )) MB → $(( AFTER / 1048576 )) MB" \
  >> steps-out/names.tsv

# empty isn't an error for a small test; `contents.json` says the layer is absent
# counted, not weighed: a few named places make a file smaller than other packages' floor
if [ "$(osmium fileinfo -e -g data.count.nodes data/names.osm.pbf)" -eq 0 ]; then
  echo "::warning::This area names no place, mountain, valley, plain or region – the \`names\` package isn't made."
  echo "enabled=false" >> "$GITHUB_OUTPUT"
  exit 0
fi

NZ_="$OPT_NAMES_MAXZOOM"
case "$NZ_" in ''|*[!0-9]*) NZ_=14 ;; esac
if [ "$NZ_" -gt 16 ]; then NZ_=16; fi

# Planetiler silently drops `min_zoom` above maxzoom
TOPZ=$(grep -oE 'min_zoom: [0-9]+' workers/names/names.yml \
       | grep -oE '[0-9]+' | sort -n | tail -1)
if [ "${TOPZ:-0}" -gt "$NZ_" ]; then
  echo "::error::workers/names/names.yml has blocks with min_zoom up to ${TOPZ}, but tiles go to z${NZ_}. Raise names_maxzoom to ${TOPZ}, or lower min_zoom of those blocks."
  exit 1
fi

mapfile -t CLIP < <(workers/lib/region-clip.sh "$REGION_BBOX")

# names in the app's languages, as the base map has them
workers/lib/name-languages.sh workers/names/names.yml data/names.yml

T_PM=$(date +%s)
OUT="_site/tiles/${REGION_KEY}-names.pmtiles"
java -Xmx4g -jar planetiler.jar generate-custom \
  --schema=data/names.yml \
  "${CLIP[@]}" \
  --output="$OUT" \
  --maxzoom="$NZ_" --render_maxzoom="$NZ_" \
  --force
# the region ends in the tiles, not in the style
workers/lib/clip-tiles.sh "$OUT"

MB=$(( $(stat -c%s "$OUT") / 1048576 ))

LIMIT_MB="$SIZE_LIMIT_MB"
case "$LIMIT_MB" in ''|*[!0-9]*) LIMIT_MB=900 ;; esac
NBUDGET_MB=$(( LIMIT_MB * BUDGET_NAMES_PCT / 100 ))
if [ "$MB" -gt "$NBUDGET_MB" ]; then
  echo "::warning::Geographical names take ${MB} MB, above their ${NBUDGET_MB} MB share of the page budget. Lower names_maxzoom or raise BUDGET_NAMES_PCT."
fi

echo "enabled=true" >> "$GITHUB_OUTPUT"
echo "maxzoom=$NZ_" >> "$GITHUB_OUTPUT"
echo "size_mb=$MB" >> "$GITHUB_OUTPUT"
ls -lh "$OUT"
printf '%s\t%s\t%s\t%s\n' "77" "Geographical names → PMTiles" "$(( $(date +%s) - T_PM ))" \
  "maxzoom $NZ_, $(du -h "$OUT" | cut -f1)" \
  >> steps-out/names.tsv
