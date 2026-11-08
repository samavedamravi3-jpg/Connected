"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import { Plus, Minus, LocateFixed, Layers } from "lucide-react";
import type { Person, LocalEvent, Hotspot } from "@/lib/network";
import { initials } from "@/lib/network";
import "leaflet/dist/leaflet.css";
export type MapItem =
  | { kind: "person"; item: Person }
  | { kind: "event"; item: LocalEvent }
  | { kind: "hotspot"; item: Hotspot };
const safe = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export default function NearbyMap({
  center,
  people,
  events,
  hotspots,
  onSelect,
  onLocate,
  selected,
}: {
  center: [number, number];
  people: Person[];
  events: LocalEvent[];
  hotspots: Hotspot[];
  onSelect: (i: MapItem) => void;
  onLocate: () => void;
  selected: MapItem | null;
}) {
  const node = useRef<HTMLDivElement>(null),
    map = useRef<LeafletMap | null>(null),
    layer = useRef<LayerGroup | null>(null),
    callback = useRef(onSelect);
  callback.current = onSelect;
  const [ready, setReady] = useState(false),
    [tileError, setTileError] = useState(false);
  useEffect(() => {
    let disposed = false;
    let resize: ResizeObserver;
    import("leaflet").then((L) => {
      if (disposed || !node.current) return;
      map.current = L.map(node.current, {
        center,
        zoom: 15,
        zoomControl: false,
        scrollWheelZoom: true,
      });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
        maxZoom: 19,
      })
        .on("tileerror", () => setTileError(true))
        .on("load", () => setTileError(false))
        .addTo(map.current);
      layer.current = L.layerGroup().addTo(map.current);
      resize = new ResizeObserver(() => map.current?.invalidateSize());
      resize.observe(node.current);
      setReady(true);
    });
    return () => {
      disposed = true;
      resize?.disconnect();
      map.current?.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    if (ready) map.current?.flyTo(center, 15, { duration: 0.7 });
  }, [center, ready]);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !layer.current) return;
      layer.current.clearLayers();
      hotspots.forEach((h) => {
        L.circle([h.lat, h.lng], {
          radius: 200,
          color: h.color,
          fillColor: h.color,
          weight: 1,
          opacity: 0.3,
          fillOpacity: 0.17,
          interactive: false,
        }).addTo(layer.current!);
        L.marker([h.lat + 0.0013, h.lng], {
          icon: L.divIcon({
            className: "hotspot-marker",
            html: `<span>✦ ${h.people} people</span>`,
            iconSize: [112, 30],
            iconAnchor: [56, 15],
          }),
          title: h.title,
        })
          .on("click", () => callback.current({ kind: "hotspot", item: h }))
          .addTo(layer.current!);
      });
      people.forEach((p) => {
        L.marker([p.lat, p.lng], {
          icon: L.divIcon({
            className: "person-marker",
            html: `<div class="map-avatar ${selected?.item.id === p.id ? "chosen" : ""}" style="--avatar:${safe(p.color)}">${safe(initials(p.name))}${p.available ? "<i></i>" : ""}</div><span class="pin-company">${safe(p.company || p.role)}</span>`,
            iconSize: [90, 78],
            iconAnchor: [45, 35],
          }),
          title: `${p.name}, ${p.company}`,
          keyboard: true,
        })
          .on("click", () => callback.current({ kind: "person", item: p }))
          .addTo(layer.current!);
      });
      events.forEach((e) =>
        L.marker([e.lat, e.lng], {
          icon: L.divIcon({
            className: "event-marker",
            html: "<span>▦</span>",
            iconSize: [38, 38],
            iconAnchor: [19, 19],
          }),
          title: e.title,
        })
          .on("click", () => callback.current({ kind: "event", item: e }))
          .addTo(layer.current!),
      );
      L.circleMarker(center, {
        radius: 8,
        color: "#fff",
        weight: 3,
        fillColor: "#7357bd",
        fillOpacity: 1,
      })
        .bindTooltip("Your search area")
        .addTo(layer.current!);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, people, events, hotspots, selected, center]);
  return (
    <div className="map-shell">
      <div
        className="map-canvas"
        ref={node}
        role="region"
        aria-label="Interactive map of nearby people and events"
      />
      <div className="map-top">
        <span className="map-location">
          <span className="pulse-dot" />{" "}
          {Math.abs(center[0] - 40.7415) < 0.02
            ? "Flatiron, New York"
            : "Your search area"}{" "}
          <span className="map-live">NEARBY</span>
        </span>
        <span className="map-layer">
          <Layers size={15} /> Explore map
        </span>
      </div>
      <div className="map-controls">
        <button aria-label="Zoom in" onClick={() => map.current?.zoomIn()}>
          <Plus size={19} />
        </button>
        <button aria-label="Zoom out" onClick={() => map.current?.zoomOut()}>
          <Minus size={19} />
        </button>
        <button aria-label="Use my location" onClick={onLocate}>
          <LocateFixed size={19} />
        </button>
      </div>
      <div className="map-legend">
        <span>
          <i className="legend-person" />
          People
        </span>
        <span>
          <i className="legend-event" />
          Events
        </span>
        <span>
          <i className="legend-hot" />
          Hotspots
        </span>
      </div>
      {tileError && (
        <div className="map-error">
          Map tiles couldn’t load. Nearby results are still available in the
          list.
        </div>
      )}
      <div className="map-note">Approximate locations. Real possibilities.</div>
    </div>
  );
}
