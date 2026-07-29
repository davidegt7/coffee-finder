import { useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { useStore } from "../store";
import { applyFilters } from "../lib/filters";
import { useT } from "../lib/useT";
import { CATEGORY_LABELS, type Place } from "../types";

/** Santiago, roughly Plaza Baquedano. */
const SANTIAGO: [number, number] = [-33.4372, -70.6344];

/**
 * Leaflet's default marker is a PNG resolved by relative URL, which breaks under
 * a bundler and under a GitHub Pages base path. A divIcon is pure DOM: no asset
 * pipeline, no broken image, and it can carry state — here, whether anything
 * about the place has actually been verified.
 */
function iconFor(place: Place): L.DivIcon {
  const verified = Object.values(place.claims).some((c) => c.confidence === "verified");
  return L.divIcon({
    className: "pin-wrap",
    html: `<div class="pin ${verified ? "pin--verified" : ""}"><span>${
      CATEGORY_LABELS[place.category].icon
    }</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function FlyToSelected() {
  const map = useMap();
  const selectedId = useStore((s) => s.selectedId);
  const places = useStore((s) => s.places);

  useEffect(() => {
    if (!selectedId) return;
    const place = places.find((p) => p.id === selectedId);
    if (!place) return;
    map.flyTo([place.lat, place.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
  }, [selectedId, places, map]);

  return null;
}

function LocateButton() {
  const map = useMap();
  const { t } = useT();
  return (
    <button
      className="locate"
      title={t("map.locate")}
      onClick={() => {
        map.locate({ setView: true, maxZoom: 15 });
      }}
    >
      ◎
    </button>
  );
}

export function MapView() {
  const places = useStore((s) => s.places);
  const filters = useStore((s) => s.filters);
  const select = useStore((s) => s.select);
  const { t } = useT();
  const favorites = useStore((s) => s.favorites);
  const visible = useMemo(
    () => applyFilters(places, filters, favorites),
    [places, filters, favorites],
  );

  return (
    <div className="map">
      <MapContainer center={SANTIAGO} zoom={13} zoomControl={false} className="map__canvas">
        <TileLayer
          // OSM's tile server: free, no API key, no billing card. Their usage
          // policy expects a real referrer and low volume — fine at this size,
          // but it's the first thing to outgrow if the map ever gets busy.
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        {visible.map((place) => (
          <Marker
            key={place.id}
            position={[place.lat, place.lng]}
            icon={iconFor(place)}
            eventHandlers={{ click: () => select(place.id) }}
          />
        ))}
        <FlyToSelected />
        <LocateButton />
      </MapContainer>

      <div className="map__count">
        {visible.length} {visible.length === 1 ? t("map.place") : t("map.places")}
        {visible.length !== places.length && ` ${t("map.ofTotal", { n: places.length })}`}
      </div>
    </div>
  );
}
