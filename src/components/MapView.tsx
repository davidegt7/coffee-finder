import { useEffect, useMemo, useRef } from "react";
import {
  type GeoJSONSource,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  type MapLayerMouseEvent,
  setWorkerUrl,
} from "maplibre-gl";
import { useStore } from "../store";
import { applyFilters } from "../lib/filters";
import { applyRoasterFilters } from "../lib/roasters";
import { ensureMapPins, pinIdFor, PIN_ROASTER } from "../lib/mapPins";
import { useT } from "../lib/useT";
import type { Place, Roaster } from "../types";

/** Santiago, roughly Plaza Baquedano. MapLibre coordinates are longitude first. */
const SANTIAGO: [number, number] = [-70.6344, -33.4372];
const SOURCE_ID = "coffee-places";
const CLUSTER_LAYER = "coffee-clusters";
const CLUSTER_COUNT_LAYER = "coffee-cluster-count";
const SELECTED_LAYER = "coffee-selected";
const POINT_LAYER = "coffee-points";

type MapPoint = { id: string; lat: number; lng: number };

// Liberty is a handsome desktop style, but it contains roughly twice as many
// layers as OpenFreeMap's dark style. Mobile Safari can stall while starting
// it, leaving light mode with only the canvas background. Positron keeps the
// light, quiet look with a much smaller style that is friendlier to phones.
const LIGHT_STYLE = "https://tiles.openfreemap.org/styles/positron";
const DARK_STYLE = "https://tiles.openfreemap.org/styles/dark";

// MapLibre 6 resolves its worker beside a shared module. Vite does not copy
// either sibling automatically, so GitHub Pages returned 404 and left a
// correctly sized but empty map. The build plugin in vite.config.ts copies both
// stable filenames; BASE_URL gives this the `/coffee-finder/` project prefix.
// Development keeps MapLibre's native node_modules-relative URL, which Vite can
// serve directly because the package is excluded from dependency optimization.
if (import.meta.env.PROD) {
  setWorkerUrl(`${import.meta.env.BASE_URL}assets/maplibre-gl-worker.mjs`);
}

function currentStyle() {
  return document.documentElement.dataset.theme === "dark" ? DARK_STYLE : LIGHT_STYLE;
}

function placeFeatureCollection(places: Place[], selectedId: string | null) {
  return {
    type: "FeatureCollection" as const,
    features: places.map((place) => {
      const verified = Object.values(place.claims).some(
        (claim) => claim.confidence === "verified",
      );
      return {
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [place.lng, place.lat] as [number, number],
        },
        properties: {
          id: place.id,
          category: place.category,
          verified,
          selected: place.id === selectedId,
          // Precomputed so the symbol layer doesn't re-encode the category rule
          // for every feature on every pan.
          icon: pinIdFor(place.category, verified),
        },
      };
    }),
  };
}

function roasterFeatureCollection(roasters: Roaster[], selectedId: string | null) {
  return {
    type: "FeatureCollection" as const,
    features: roasters.map((roaster) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [roaster.lng, roaster.lat] as [number, number],
      },
      properties: {
        id: roaster.id,
        category: "roastery" as const,
        verified: false,
        selected: roaster.id === selectedId,
        // Directory pins all use the fire mark — every entry is a roaster.
        icon: PIN_ROASTER,
      },
    })),
  };
}

/**
 * Repaint the basemap's own layers in the app's palette.
 *
 * Positron and OpenFreeMap's dark style are both deliberately colourless —
 * parks arrive as rgb(230,233,229), water as rgb(194,200,202), and dark paints
 * nearly everything within a few points of black. Handsome as a backdrop for
 * someone else's data, lifeless as the canvas of a map that IS the product.
 *
 * The obvious fix — switch to a colourful style — is the wrong one. `bright`
 * is 119 layers against Positron's 55, more even than the Liberty style that
 * was dropped for stalling Mobile Safari (see LIGHT_STYLE above). Recolouring
 * costs no extra layers at all, so phones keep the fix they were given.
 *
 * Every layer is looked up before it is touched: these ids belong to a style
 * we don't control, and if OpenFreeMap renames one the map must come out
 * merely untinted rather than broken.
 */
const BASEMAP_TINT: Record<"light" | "dark", Record<string, string>> = {
  light: {
    background: "#f7f2ea", // warm paper, not the stock grey
    water: "#a7cbdb",
    waterway: "#a7cbdb",
    park: "#cfe2c4",
    landuse_park: "#cfe2c4",
    landcover_wood: "#c2d9b6",
    landcover_grass: "#d7e6cc",
    landuse_residential: "#f1eae0",
    building: "#e6dbcc",
  },
  dark: {
    background: "#141110", // matches --bg so the map reads as part of the app
    water: "#16272f",
    waterway: "#16272f",
    park: "#16241a",
    landuse_park: "#16241a",
    landcover_wood: "#182a1c",
    landcover_grass: "#152218",
    landuse_residential: "#1b1614",
    building: "#221b18",
  },
};

function tintBasemap(map: MapLibreMap) {
  const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  for (const [id, color] of Object.entries(BASEMAP_TINT[theme])) {
    const layer = map.getLayer(id);
    if (!layer) continue;
    // The paint property is named after the layer type: a background layer has
    // no fill-color and setting one throws.
    const property =
      layer.type === "background"
        ? "background-color"
        : layer.type === "line"
          ? "line-color"
          : layer.type === "fill"
            ? "fill-color"
            : null;
    if (!property) continue;
    try {
      map.setPaintProperty(id, property, color);
    } catch {
      // An upstream style change is a cosmetic loss, never a broken map.
    }
  }
}

/**
 * Adds the café data after every basemap style load. MapLibre removes custom
 * sources and layers when the light/dark style changes, so this is deliberately
 * safe to run more than once.
 */
function addCoffeeLayers(
  map: MapLibreMap,
  data: ReturnType<typeof placeFeatureCollection>,
) {
  if (map.getSource(SOURCE_ID)) return;

  map.addSource(SOURCE_ID, {
    type: "geojson",
    data,
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 52,
  });

  // European Coffee Trip's biggest readability win is the cluster: at a city
  // or country scale, overlapping pins become one calm, numbered marker.
  map.addLayer({
    id: CLUSTER_LAYER,
    type: "circle",
    source: SOURCE_ID,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#211a17",
      "circle-radius": ["step", ["get", "point_count"], 19, 10, 23, 30, 27],
      "circle-stroke-color": "#fffaf4",
      "circle-stroke-width": 3,
      "circle-opacity": 0.96,
    },
  });

  map.addLayer({
    id: CLUSTER_COUNT_LAYER,
    type: "symbol",
    source: SOURCE_ID,
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-size": 12,
      "text-allow-overlap": true,
    },
    paint: {
      "text-color": "#ffffff",
    },
  });

  map.addLayer({
    id: SELECTED_LAYER,
    type: "circle",
    source: SOURCE_ID,
    filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "selected"], true]],
    paint: {
      "circle-radius": 24,
      "circle-color": "rgba(169, 104, 44, 0.18)",
      "circle-stroke-color": "#a9682c",
      "circle-stroke-width": 2,
    },
  });

  // Bean / roaster sprites (registered in ensureMapPins). Circles were clear but
  // generic; the icon is what makes "coffee map" read at a glance, and the
  // flame on roasteries answers "do they toast?" without opening the sheet.
  map.addLayer({
    id: POINT_LAYER,
    type: "symbol",
    source: SOURCE_ID,
    filter: ["!", ["has", "point_count"]],
    layout: {
      "icon-image": ["get", "icon"],
      "icon-size": 0.5,
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "icon-padding": 2,
    },
  });
}

function fitPoints(map: MapLibreMap, points: MapPoint[], animate: boolean) {
  if (!points.length) return;
  const bounds = points.reduce(
    (next, point) => next.extend([point.lng, point.lat]),
    new LngLatBounds(),
  );
  map.fitBounds(bounds, {
    padding: 48,
    maxZoom: 15,
    duration: animate ? 600 : 0,
  });
}

export function MapView() {
  const section = useStore((state) => state.section);
  const places = useStore((state) => state.places);
  const roasters = useStore((state) => state.roasters);
  const filters = useStore((state) => state.filters);
  const roasterFilters = useStore((state) => state.roasterFilters);
  const select = useStore((state) => state.select);
  const selectRoaster = useStore((state) => state.selectRoaster);
  const selectedId = useStore((state) => state.selectedId);
  const selectedRoasterId = useStore((state) => state.selectedRoasterId);
  const favorites = useStore((state) => state.favorites);
  const near = useStore((s) => s.near);
  const { t } = useT();

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const firstFitRef = useRef(true);
  const sectionRef = useRef(section);
  sectionRef.current = section;
  const selectRef = useRef(select);
  selectRef.current = select;
  const selectRoasterRef = useRef(selectRoaster);
  selectRoasterRef.current = selectRoaster;

  const visiblePlaces = useMemo(
    () => applyFilters(places, filters, favorites),
    [places, filters, favorites],
  );
  const visibleRoasters = useMemo(
    () => applyRoasterFilters(roasters, roasterFilters),
    [roasters, roasterFilters],
  );
  const visible: MapPoint[] =
    section === "roasters" ? visibleRoasters : visiblePlaces;
  const totalCount = section === "roasters" ? roasters.length : places.length;
  const activeSelectedId = section === "roasters" ? selectedRoasterId : selectedId;

  const data = useMemo(
    () =>
      section === "roasters"
        ? roasterFeatureCollection(visibleRoasters, selectedRoasterId)
        : placeFeatureCollection(visiblePlaces, selectedId),
    [section, visiblePlaces, visibleRoasters, selectedId, selectedRoasterId],
  );
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: currentStyle(),
      center: SANTIAGO,
      zoom: 13,
    });
    mapRef.current = map;

    map.on("error", (event) => {
      console.error("Coffee Finder map:", event.error);
    });

    map.on("style.load", () => {
      // Tint first: the café layers sit on top and must not be repainted.
      tintBasemap(map);
      // Images are wiped with the style (light/dark swap), so re-register before
      // layers that reference them — otherwise MapLibre draws missing-icon boxes.
      void ensureMapPins(map).then(() => {
        addCoffeeLayers(map, dataRef.current);
      });
    });

    const openCluster = async (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const clusterId = Number(feature?.properties?.cluster_id);
      if (!feature || !Number.isFinite(clusterId)) return;
      const source = map.getSource(SOURCE_ID) as GeoJSONSource;
      const zoom = await source.getClusterExpansionZoom(clusterId);
      const coordinates = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
      map.easeTo({ center: coordinates, zoom, duration: 450 });
    };

    const openPoint = (event: MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.id;
      if (typeof id !== "string") return;
      if (sectionRef.current === "roasters") selectRoasterRef.current(id);
      else selectRef.current(id);
    };

    map.on("click", CLUSTER_LAYER, openCluster);
    map.on("click", POINT_LAYER, openPoint);
    for (const layer of [CLUSTER_LAYER, POINT_LAYER]) {
      map.on("mouseenter", layer, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layer, () => {
        map.getCanvas().style.cursor = "";
      });
    }

    const themeObserver = new MutationObserver(() => {
      map.setStyle(currentStyle());
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      themeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const source = mapRef.current?.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(data);
  }, [data]);

  // `near` belongs in this key: turning on "cerca de mí" CLEARS the country and
  // city, which used to leave the camera fitting every place on earth — asking
  // to be shown what is nearby zoomed you out to the whole planet, which is
  // exactly the opposite, and read as the feature simply not working.
  // Section is included so switching to the global roasters map re-frames.
  const locationKey =
    section === "roasters"
      ? `roasters|${roasterFilters.countryCode ?? ""}|${roasterFilters.city ?? ""}|${roasterFilters.region ?? ""}`
      : `cafes|${filters.countryCode ?? ""}|${filters.city ?? ""}|${[...filters.comunas]
          .sort()
          .join(",")}|${near ? `${near.lat},${near.lng}` : ""}`;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !visible.length) return;
    const apply = () => {
      if (section === "cafes" && near) {
        // Where you are, at a zoom where the cafés around you are legible.
        map.flyTo({ center: [near.lng, near.lat], zoom: 14, duration: 800 });
      } else {
        fitPoints(map, visible, !firstFitRef.current);
      }
      firstFitRef.current = false;
    };
    // Camera updates do not depend on the basemap's tiles being idle. Waiting
    // on `load` here is a trap: that event fires only once, so choosing another
    // country while tiles are still streaming could leave the list in
    // Copenhagen and the camera over Chile forever.
    apply();
    // Fitting on every claim filter change would fight the user; locationKey is
    // intentionally the only trigger apart from the map becoming available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationKey]);

  /**
   * A dot for where you are, so "cerca de mí" visibly lands somewhere rather
   * than just rearranging the list. A Marker rather than a layer: markers are
   * DOM overlays and survive the light/dark style swap, which wipes every
   * custom source and layer.
   */
  const meRef = useRef<Marker | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!near) {
      meRef.current?.remove();
      meRef.current = null;
      return;
    }
    if (!meRef.current) {
      const el = document.createElement("div");
      el.className = "me-dot";
      meRef.current = new Marker({ element: el });
    }
    meRef.current.setLngLat([near.lng, near.lat]).addTo(map);
  }, [near]);

  useEffect(() => {
    if (!activeSelectedId) return;
    const point =
      section === "roasters"
        ? roasters.find((candidate) => candidate.id === activeSelectedId)
        : places.find((candidate) => candidate.id === activeSelectedId);
    const map = mapRef.current;
    if (!point || !map) return;
    map.flyTo({
      center: [point.lng, point.lat],
      zoom: Math.max(map.getZoom(), 15),
      duration: 600,
    });
  }, [activeSelectedId, section, places, roasters]);

  const locate = () => {
    navigator.geolocation?.getCurrentPosition((position) => {
      mapRef.current?.flyTo({
        center: [position.coords.longitude, position.coords.latitude],
        zoom: 15,
        duration: 700,
      });
    });
  };

  const unitOne = section === "roasters" ? t("map.roaster") : t("map.place");
  const unitMany = section === "roasters" ? t("map.roasters") : t("map.places");

  return (
    <div className="map">
      <div ref={containerRef} className="map__canvas" />

      <button className="locate" title={t("map.locate")} onClick={locate}>
        ◎
      </button>

      <div className="map__count">
        {visible.length} {visible.length === 1 ? unitOne : unitMany}
        {visible.length !== totalCount && ` ${t("map.ofTotal", { n: totalCount })}`}
      </div>
    </div>
  );
}
