# Configuration

Everything the pipeline is told by hand, in one place. Scripts find this folder beside
`workers/`.

| File | What it says | Read by |
|---|---|---|
| [`map-settings.json`](map-settings.json) | regions, ranges and cut-outs, run defaults, data sources, credits | `workers/plan/options.py` and every run |
| [`packages.json`](packages.json) | the packages: their files, the app's words, the base map's share of each, the OSM tags each owns | the packer, the base map cut, `workers/lint/owners.py`, the app's tests |
| [`routing.json`](routing.json) | routing: tag dictionaries (road, rail), profiles, national scopes, vignettes | `workers/routing/`, the routing lints; the app bundles the dictionaries' export and the vignettes |
| [`road-signs.json`](road-signs.json) | which traffic sign image each OSM sign value draws, by country | `workers/transport/signs.py` |
| [`wiki-languages.json`](wiki-languages.json) | the Wikipedia languages of each region | `workers/wiki/collect.py` |
| [`world-variants.json`](world-variants.json) | the variants of the world map | `workers/world/` |

Not here, because no one writes them by hand: `workers/data/layer-places.json` (the style
build records each layer's place in it) and `workers/data/outlines/` (the ranges' outlines).
