import { useEffect, useMemo, useRef } from "react";
import {
  type GeoJSONSource,
  LngLatBounds,
  Map as MapLibreMap,
  type MapLayerMouseEvent,
  setWorkerUrl,
} from "maplibre-gl";
import { useStore } from "../store";
import { applyFilters } from "../lib/filters";
import { useT } from "../lib/useT";
import type { Place } from "../types";

/** Santiago, roughly Plaza Baquedano. MapLibre coordinates are longitude first. */
const SANTIAGO: [number, number] = [-70.6344, -33.4372];
const SOURCE_ID = "coffee-places";
const CLUSTER_LAYER = "coffee-clusters";
const CLUSTER_COUNT_LAYER = "coffee-cluster-count";
const SELECTED_LAYER = "coffee-selected";
const POINT_LAYER = "coffee-points";
const POINT_CENTRE_LAYER = "coffee-point-centres";

const LIGHT_STYLE = "https://tiles.openfreemap.org/styles/liberty";
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

function featureCollection(places: Place[], selectedId: string | null) {
  return {
    type: "FeatureCollection" as const,
    features: places.map((place) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [place.lng, place.lat] as [number, number],
      },
      properties: {
        id: place.id,
        verified: Object.values(place.claims).some((claim) => claim.confidence === "verified"),
        selected: place.id === selectedId,
      },
    })),
  };
}

/**
 * Adds the café data after every basemap style load. MapLibre removes custom
 * sources and layers when the light/dark style changes, so this is deliberately
 * safe to run more than once.
 */
function addCoffeeLayers(
  map: MapLibreMap,
  data: ReturnType<typeof featureCollection>,
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
      "circle-radius": 22,
      "circle-color": "rgba(169, 104, 44, 0.16)",
      "circle-stroke-color": "#a9682c",
      "circle-stroke-width": 2,
    },
  });

  map.addLayer({
    id: POINT_LAYER,
    type: "circle",
    source: SOURCE_ID,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": 14,
      "circle-color": "#fffaf4",
      "circle-stroke-color": [
        "case",
        ["==", ["get", "verified"], true],
        "#3f8a48",
        "#a9682c",
      ],
      "circle-stroke-width": ["case", ["==", ["get", "verified"], true], 3, 2],
    },
  });

  // A small coffee-coloured centre reads crisply at every resolution without
  // relying on emoji fonts or marker image files.
  map.addLayer({
    id: POINT_CENTRE_LAYER,
    type: "circle",
    source: SOURCE_ID,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": 4,
      "circle-color": "#a9682c",
    },
  });
}

function fitPlaces(map: MapLibreMap, places: Place[], animate: boolean) {
  if (!places.length) return;
  const bounds = places.reduce(
    (next, place) => next.extend([place.lng, place.lat]),
    new LngLatBounds(),
  );
  map.fitBounds(bounds, {
    padding: 48,
    maxZoom: 15,
    duration: animate ? 600 : 0,
  });
}

export function MapView() {
  const places = useStore((state) => state.places);
  const filters = useStore((state) => state.filters);
  const select = useStore((state) => state.select);
  const selectedId = useStore((state) => state.selectedId);
  const favorites = useStore((state) => state.favorites);
  const { t } = useT();

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const firstFitRef = useRef(true);
  const selectRef = useRef(select);
  selectRef.current = select;

  const visible = useMemo(
    () => applyFilters(places, filters, favorites),
    [places, filters, favorites],
  );
  const data = useMemo(() => featureCollection(visible, selectedId), [visible, selectedId]);
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

    map.on("style.load", () => addCoffeeLayers(map, dataRef.current));

    const openCluster = async (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const clusterId = Number(feature?.properties?.cluster_id);
      if (!feature || !Number.isFinite(clusterId)) return;
      const source = map.getSource(SOURCE_ID) as GeoJSONSource;
      const zoom = await source.getClusterExpansionZoom(clusterId);
      const coordinates = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
      map.easeTo({ center: coordinates, zoom, duration: 450 });
    };

    const openPlace = (event: MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.id;
      if (typeof id === "string") selectRef.current(id);
    };

    map.on("click", CLUSTER_LAYER, openCluster);
    map.on("click", POINT_LAYER, openPlace);
    map.on("click", POINT_CENTRE_LAYER, openPlace);
    for (const layer of [CLUSTER_LAYER, POINT_LAYER, POINT_CENTRE_LAYER]) {
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

  const locationKey = `${filters.city ?? ""}|${[...filters.comunas].sort().join(",")}`;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !visible.length) return;
    const apply = () => {
      fitPlaces(map, visible, !firstFitRef.current);
      firstFitRef.current = false;
    };
    if (map.loaded()) apply();
    else map.once("load", apply);
    // Fitting on every claim filter change would fight the user; locationKey is
    // intentionally the only trigger apart from the map becoming available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationKey]);

  useEffect(() => {
    if (!selectedId) return;
    const place = places.find((candidate) => candidate.id === selectedId);
    const map = mapRef.current;
    if (!place || !map) return;
    map.flyTo({
      center: [place.lng, place.lat],
      zoom: Math.max(map.getZoom(), 15),
      duration: 600,
    });
  }, [selectedId, places]);

  const locate = () => {
    navigator.geolocation?.getCurrentPosition((position) => {
      mapRef.current?.flyTo({
        center: [position.coords.longitude, position.coords.latitude],
        zoom: 15,
        duration: 700,
      });
    });
  };

  return (
    <div className="map">
      <div ref={containerRef} className="map__canvas" />

      <button className="locate" title={t("map.locate")} onClick={locate}>
        ◎
      </button>

      <div className="map__count">
        {visible.length} {visible.length === 1 ? t("map.place") : t("map.places")}
        {visible.length !== places.length && ` ${t("map.ofTotal", { n: places.length })}`}
      </div>
    </div>
  );
}
