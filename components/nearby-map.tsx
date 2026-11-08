"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as GLMap, Marker } from "maplibre-gl";
import {
  Plus,
  Minus,
  LocateFixed,
  RotateCw,
  Compass,
  Layers,
} from "lucide-react";
import {
  initials,
  type Person,
  type LocalEvent,
  type Hotspot,
} from "@/lib/network";
import FlatMap from "./flat-map";
import "maplibre-gl/dist/maplibre-gl.css";
export type MapItem =
  | { kind: "person"; item: Person }
  | { kind: "event"; item: LocalEvent }
  | { kind: "hotspot"; item: Hotspot };
type Props = {
  center: [number, number];
  people: Person[];
  events: LocalEvent[];
  hotspots: Hotspot[];
  onSelect: (i: MapItem) => void;
  onLocate: () => void;
  selected: MapItem | null;
};
export default function NearbyMap(props: Props) {
  const { center, people, events, hotspots, onSelect, onLocate, selected } =
    props;
  const node = useRef<HTMLDivElement>(null),
    map = useRef<GLMap | null>(null),
    markers = useRef<Marker[]>([]),
    callback = useRef(onSelect);
  callback.current = onSelect;
  const [ready, setReady] = useState(false),
    [fallback, setFallback] = useState(false),
    [error, setError] = useState(false),
    [tilted, setTilted] = useState(true),
    [bearing, setBearing] = useState(0),
    [orbit, setOrbit] = useState(false);
  useEffect(() => {
    let disposed = false;
    let resize: ResizeObserver | undefined;
    import("maplibre-gl")
      .then((GL) => {
        if (disposed || !node.current) return;
        try {
          const m = new GL.Map({
            container: node.current,
            center: [center[1], center[0]],
            zoom: 13.8,
            pitch: 45,
            bearing: -18,
            maxPitch: 60,
            attributionControl: { compact: true },
            style: {
              version: 8,
              sources: {
                osm: {
                  type: "raster",
                  tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                  tileSize: 256,
                  maxzoom: 19,
                  attribution:
                    '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                },
              },
              layers: [
                {
                  id: "base",
                  type: "raster",
                  source: "osm",
                  paint: { "raster-saturation": -0.4, "raster-opacity": 0.9 },
                },
              ],
            },
          });
          map.current = m;
          m.on("load", () => setReady(true));
          m.on("error", () => setError(true));
          m.on("sourcedata", () => {
            if (m.areTilesLoaded()) setError(false);
          });
          m.on("rotate", () => setBearing(Math.round(m.getBearing())));
          m.on("pitch", () => setTilted(m.getPitch() > 10));
          m.on("dragstart", () => setOrbit(false));
          m.on("zoomstart", (e) => {
            if (e.originalEvent) setOrbit(false);
          });
          m.on("rotatestart", (e) => {
            if (e.originalEvent) setOrbit(false);
          });
          m.on("webglcontextlost", () => setFallback(true));
          resize = new ResizeObserver(() => m.resize());
          resize.observe(node.current);
          setReady(true);
        } catch {
          setFallback(true);
        }
      })
      .catch(() => setFallback(true));
    return () => {
      disposed = true;
      resize?.disconnect();
      map.current?.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    if (ready)
      map.current?.easeTo({
        center: [center[1], center[0]],
        zoom: 13.8,
        duration: 700,
      });
    setOrbit(false);
  }, [center, ready]);
  useEffect(() => {
    if (!orbit || !map.current) return;
    let frame = 0,
      last = 0;
    const tick = (t: number) => {
      if (
        !document.hidden &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        if (last)
          map.current?.setBearing(
            map.current.getBearing() + (t - last) * 0.004,
          );
        last = t;
      } else last = 0;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [orbit]);
  useEffect(() => {
    if (!ready || fallback) return;
    let cancelled = false;
    import("maplibre-gl").then((GL) => {
      if (cancelled || !map.current) return;
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      const add = (item: MapItem) => {
        const el = document.createElement("button");
        el.type = "button";
        el.className = `gl-pin ${item.kind}-marker`;
        el.setAttribute(
          "aria-label",
          item.kind === "person"
            ? `${item.item.name}, ${item.item.company}`
            : item.item.title,
        );
        el.onclick = () => {
          setOrbit(false);
          callback.current(item);
        };
        if (item.kind === "person") {
          const p = item.item,
            avatar = document.createElement("span");
          avatar.className = `map-avatar ${selected?.item.id === p.id ? "chosen" : ""}`;
          avatar.style.setProperty("--avatar", p.color);
          avatar.textContent = initials(p.name);
          if (p.photoUrl) {
            const img = document.createElement("img");
            img.src = p.photoUrl;
            img.alt = "";
            img.referrerPolicy = "no-referrer";
            img.onerror = () => img.remove();
            avatar.appendChild(img);
          }
          if (p.available) avatar.appendChild(document.createElement("i"));
          el.appendChild(avatar);
          const label = document.createElement("span");
          label.className = "pin-company";
          label.textContent = p.company || p.role;
          el.appendChild(label);
        } else {
          const label = document.createElement("span");
          label.textContent =
            item.kind === "event" ? "▦" : `✦ ${item.item.title}`;
          el.appendChild(label);
        }
        markers.current.push(
          new GL.Marker({ element: el })
            .setLngLat([item.item.lng, item.item.lat])
            .addTo(map.current!),
        );
      };
      hotspots.forEach((item) => add({ kind: "hotspot", item }));
      events.forEach((item) => add({ kind: "event", item }));
      people.forEach((item) => add({ kind: "person", item }));
      const dot = document.createElement("div");
      dot.className = "search-center";
      dot.title = "Search area center";
      markers.current.push(
        new GL.Marker({ element: dot })
          .setLngLat([center[1], center[0]])
          .addTo(map.current),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [ready, fallback, people, events, hotspots, selected, center]);
  if (fallback)
    return (
      <div className="flat-map-wrapper">
        <FlatMap {...props} />
        <span className="map-fallback-label">
          2D map · rotation unavailable on this device
        </span>
      </div>
    );
  const move = (options: { bearing?: number; pitch?: number }) => {
    setOrbit(false);
    map.current?.easeTo({ ...options, duration: 600 });
  };
  return (
    <div className="map-shell map-360">
      <div
        ref={node}
        className="map-canvas"
        role="region"
        aria-label="Rotatable map of nearby people and events"
      />
      <div className="map-top">
        <span className="map-location">
          <span className="pulse-dot" />
          {Math.abs(center[0] - 35.2271) < 0.1
            ? "Charlotte, NC"
            : Math.abs(center[0] - 40.7415) < 0.1
              ? "New York, NY"
              : "Your search area"}
          <span className="map-live">EXPLORE</span>
        </span>
      </div>
      <div className="map-view-tools">
        <button
          className={tilted ? "active" : ""}
          aria-pressed={tilted}
          onClick={() => move({ pitch: tilted ? 0 : 50 })}
        >
          <Layers size={15} />
          {tilted ? "Tilted view" : "Flat view"}
        </button>
        <button
          className={orbit ? "active" : ""}
          aria-pressed={orbit}
          onClick={() => setOrbit(!orbit)}
        >
          <RotateCw size={15} />
          {orbit ? "Pause orbit" : "360° orbit"}
        </button>
      </div>
      <div className="map-controls">
        <button
          aria-label="Zoom in"
          onClick={() => {
            setOrbit(false);
            map.current?.zoomIn();
          }}
        >
          <Plus size={19} />
        </button>
        <button
          aria-label="Zoom out"
          onClick={() => {
            setOrbit(false);
            map.current?.zoomOut();
          }}
        >
          <Minus size={19} />
        </button>
        <button
          aria-label="Rotate map clockwise"
          onClick={() =>
            move({ bearing: (map.current?.getBearing() || 0) + 45 })
          }
        >
          <RotateCw size={18} />
        </button>
        <button
          aria-label="Reset map north"
          onClick={() => move({ bearing: 0 })}
        >
          <Compass size={19} style={{ transform: `rotate(${-bearing}deg)` }} />
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
          Demo hotspots
        </span>
      </div>
      {error && (
        <div className="map-error">
          Some map tiles couldn’t load. Results remain available in the list.
        </div>
      )}
      <div className="map-note">
        Drag to explore · right-drag to rotate & tilt · approximate pins
      </div>
    </div>
  );
}
