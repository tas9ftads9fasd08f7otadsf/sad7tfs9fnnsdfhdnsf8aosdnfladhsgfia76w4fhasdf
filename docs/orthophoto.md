# Orthophoto of Slovakia, offline per kraj

The `orthophoto` package is one region's aerial photos: Ortofotomozaika SR, 3rd cycle
(2023–2025, ÚGKK SR), source `ortofoto_sk_3c` in `config/map-settings.json`, which every Slovak
region takes from `maps.slovensko.settings.orthophoto`. The app draws it as a base layer, flat and
in 3D, and may load the zooms past the package online from the same source (`aerial_sources`).

## Building it

`Map · Regenerate region layer`, `what: orthophoto`, one kraj at a time (`Map · Regenerate state`
does every kraj). The job asks the ÚGKK WMS for each z8–z17 tile's box (`{bbox-epsg-3857}`),
cuts the tiles to the region's outline, writes them as WebP (`aerial.py --format=webp`) and adds
`orthophoto`, `orthophoto_maxzoom` and `orthophoto_source` to the manifest and the catalog.
A kraj is hundreds of thousands of tiles: a run that reaches the six hours keeps its tile cache,
and the next run goes on from there.

## Size

Tiles over each kraj's box at z8–z17, at about 20 KB a WebP tile; the outline cuts a third or more.

| region | tiles | box size |
|---|--:|--:|
| bratislavsky | 123 460 | 2.4 GB |
| trnavsky | 337 838 | 6.4 GB |
| trenciansky | 358 050 | 6.8 GB |
| nitriansky | 384 441 | 7.3 GB |
| zilinsky | 440 321 | 8.4 GB |
| banskobystricky | 505 734 | 9.6 GB |
| presovsky | 542 755 | 10.4 GB |
| kosicky | 439 060 | 8.4 GB |
| slovensko (whole) | 2 976 186 | 56.8 GB |

Each zoom quadruples the tiles, so z16 is a quarter of this and z18 four times as much; z17
(about 1.2 m a pixel) is the package, the rest is online.

## Why WebP, not KTX2

MapLibre Native decodes JPEG, PNG and WebP raster tiles, in 3D as well; it has no KTX2 decoder
for raster sources, so a KTX2 package would draw nothing. WebP is about a third smaller than the
JPEG the ranges' photos use, and its alpha keeps the region's edge clear.

## Before the first run

The WMS address (`zbgisws.skgeodesy.sk/zbgis_ortofoto_wms`, layer `1`) was not reachable from the
session that wrote this; a quick run on `bratislavsky` proves it answers and which layer is the
3rd cycle. A layer the server doesn't know comes back as an XML error, which the fetcher refuses
as no image, so a wrong address fails loudly instead of publishing holes.
