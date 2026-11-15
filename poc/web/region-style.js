/** The style the pipeline publishes for a region, built live from the deployed site. */
import {
  buildStyle,
  MAX_TILE_Z,
  DEFAULT_DEM_TILES,
  DEFAULT_DEM_MAXZOOM,
  DEFAULT_DEM_SOURCE,
  DEFAULT_ICON_SOURCE
} from "./themes.js";
import { packageOf } from "./packages.js";

/** Draws every archive the region has; `set` is the icon set, `baseUrl` the site's. */
export function regionStyle({ manifest, regionKey, baseUrl, set, overrides, theme, mapType,
                              languages }) {
  const region = manifest.regions[regionKey];
  const archive = (key) => (region[key] ? `pmtiles://${baseUrl}/${region[key]}` : null);
  const style = buildStyle({
    languages,
    theme,
    mapType,
    tilesUrl: `pmtiles://${baseUrl}/${region.pmtiles || region.cuts?.landscape}`,
    spriteUrl: set ? set.spriteUrl : `${baseUrl}/sprites/osm-liberty`,
    glyphsUrl: manifest.glyphs || "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
    icons: set ? set.icons : [],
    iconSet: set ? set.id : DEFAULT_ICON_SOURCE,
    sdfIcons: set ? set.sdf : false,
    fonts: manifest.fonts || {},
    maxzoom: region.maxzoom || manifest.maxzoom || MAX_TILE_Z,
    contoursUrl: archive("contours"),
    contoursMaxzoom: region.contours_maxzoom || 14,
    rocksUrl: archive("rocks"),
    rocksMaxzoom: region.rocks_maxzoom || 16,
    trailsUrl: archive("trails"),
    trailsMaxzoom: region.trails_maxzoom || 14,
    featuresUrl: archive("features"),
    featuresMaxzoom: region.features_maxzoom || 15,
    pointsUrl: archive("points"),
    pointsMaxzoom: region.points_maxzoom || 15,
    transportUrl: archive("transport"),
    transportMaxzoom: region.transport_maxzoom || 14,
    roadSigns: !!region.road_sign_sprite,
    boundariesUrl: archive("boundaries"),
    boundariesMaxzoom: region.boundaries_maxzoom || 12,
    namesUrl: archive("names"),
    namesMaxzoom: region.names_maxzoom || 14,
    waterUrl: archive("water"),
    waterMaxzoom: region.water_maxzoom || 14,
    buildingsUrl: archive("buildings"),
    buildingsMaxzoom: region.buildings_maxzoom || 14,
    demSource: region.dem_source || DEFAULT_DEM_SOURCE,
    demTiles: manifest.dem === null ? null : manifest.dem || DEFAULT_DEM_TILES,
    // the shading's heights may come from another model than the contours
    demTilesSource: manifest.dem_source || region.dem_source || DEFAULT_DEM_SOURCE,
    demMaxzoom: manifest.dem_maxzoom || DEFAULT_DEM_MAXZOOM,
    // a quick test shades only its square, the map is the whole region
    demBounds: region.test_bbox || null,
    overrides,
    name: `FricoMaps – ${region.name}`
  });
  return region.pmtiles || !region.cuts ? style : onCuts(style, region.cuts, baseUrl);
}

/** A region without its whole base map: each base layer reads its package's cut. */
function onCuts(style, cuts, baseUrl) {
  const base = style.sources.omt;
  for (const layer of style.layers) {
    if (layer.source !== "omt") continue;
    const id = `omt-${packageOf(layer)}`;
    style.sources[id] ||= { ...base, url: `pmtiles://${baseUrl}/${cuts[id.slice(4)]}` };
    layer.source = id;
  }
  delete style.sources.omt;
  return style;
}
