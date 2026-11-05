#!/usr/bin/env bash
# Ski & winter from OSM → `{region}-ski.pmtiles`; kinds and zooms in `ski.yml`.
# Ski areas and piste areas are often multipolygons, so the prefilter pulls members.
# Its share of the page size comes from `BUDGET_SKI_PCT`.

set -euo pipefail
mkdir -p _site/tiles data steps-out
sudo apt-get update -qq
sudo apt-get install -y -qq osmium-tool
python3 -c 'import osmium' 2>/dev/null \
  || python3 -m pip install --quiet --break-system-packages 'osmium>=3.6,<5'

T_F=$(date +%s)
osmium tags-filter --overwrite -o data/ski.osm.pbf \
  data/region.osm.pbf --expressions=workers/ski/filter.txt

# ski areas ride in as border members far away; a low-zoom tile would hold them
workers/lib/region-cut.sh data/ski.osm.pbf "$REGION_BBOX"

BEFORE=$(stat -c%s data/region.osm.pbf)
AFTER=$(stat -c%s data/ski.osm.pbf)
echo "Prefilter: $(du -h data/region.osm.pbf | cut -f1) → $(du -h data/ski.osm.pbf | cut -f1)"
printf '%s\t%s\t%s\t%s\n' "78" "Ski and winter prefilter" "$(( $(date +%s) - T_F ))" \
  "$(( BEFORE / 1048576 )) MB → $(( AFTER / 1048576 )) MB" \
  >> steps-out/ski.tsv

# empty isn't an error for a small test; `contents.json` says the layer is absent
# counted, not weighed: one small resort makes a file smaller than other packages' floor
if [ "$(osmium fileinfo -e -g data.count.nodes data/ski.osm.pbf)" -eq 0 ]; then
  echo "::warning::This area has no ski area, piste, lift or winter path – the \`ski\` package isn't made."
  echo "enabled=false" >> "$GITHUB_OUTPUT"
  exit 0
fi

SZ_="$OPT_SKI_MAXZOOM"
case "$SZ_" in ''|*[!0-9]*) SZ_=14 ;; esac
if [ "$SZ_" -gt 16 ]; then SZ_=16; fi

# Planetiler silently drops `min_zoom` above maxzoom
TOPZ=$(grep -oE 'min_zoom: [0-9]+' workers/ski/ski.yml \
       | grep -oE '[0-9]+' | sort -n | tail -1)
if [ "${TOPZ:-0}" -gt "$SZ_" ]; then
  echo "::error::workers/ski/ski.yml has blocks with min_zoom up to ${TOPZ}, but tiles go to z${SZ_}. Raise ski_maxzoom to ${TOPZ}, or lower min_zoom of those blocks."
  exit 1
fi

mapfile -t CLIP < <(workers/lib/region-clip.sh "$REGION_BBOX")

# a cable car is Ski & winter's in the mountains only
python3 workers/lib/cable_cars.py --pbf=data/ski.osm.pbf --out=data/ski-marked.osm.pbf

# names in the app's languages, as the base map has them
workers/lib/name-languages.sh workers/ski/ski.yml data/ski.yml

T_PM=$(date +%s)
OUT="_site/tiles/${REGION_KEY}-ski.pmtiles"
java -Xmx4g -jar planetiler.jar generate-custom \
  --schema=data/ski.yml \
  "${CLIP[@]}" \
  --output="$OUT" \
  --maxzoom="$SZ_" --render_maxzoom="$SZ_" \
  --force
# the region ends in the tiles, not in the style
workers/lib/clip-tiles.sh "$OUT"

MB=$(( $(stat -c%s "$OUT") / 1048576 ))

LIMIT_MB="$SIZE_LIMIT_MB"
case "$LIMIT_MB" in ''|*[!0-9]*) LIMIT_MB=900 ;; esac
SBUDGET_MB=$(( LIMIT_MB * BUDGET_SKI_PCT / 100 ))
if [ "$MB" -gt "$SBUDGET_MB" ]; then
  echo "::warning::Ski and winter take ${MB} MB, above their ${SBUDGET_MB} MB share of the page budget. Lower ski_maxzoom or raise BUDGET_SKI_PCT."
fi

echo "enabled=true" >> "$GITHUB_OUTPUT"
echo "maxzoom=$SZ_" >> "$GITHUB_OUTPUT"
echo "size_mb=$MB" >> "$GITHUB_OUTPUT"
ls -lh "$OUT"
printf '%s\t%s\t%s\t%s\n' "79" "Ski and winter → PMTiles" "$(( $(date +%s) - T_PM ))" \
  "maxzoom $SZ_, $(du -h "$OUT" | cut -f1)" \
  >> steps-out/ski.tsv
