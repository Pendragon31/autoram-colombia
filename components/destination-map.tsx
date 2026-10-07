"use client";

// Mapa para elegir el destino en el cotizador. Reemplaza los tiles manuales.
//  · Toca el mapa para fijar el destino (o arrastra el marcador).
//  · Muestra tu ubicación, el destino y la ruta real por carretera cuando OSRM responde.
//  · Estilo claro: aquí el conductor necesita leer nombres de calles.

import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MLMap, type GeoJSONSource } from "maplibre-gl";

import CanvasMap from "@/components/canvas-map";
import { canUseWebGL } from "@/lib/map-capabilities";
import { mapStyle } from "@/lib/map-style";

export type LatLng = { lat: number; lng: number };

const COLOMBIA_CENTER: [number, number] = [-73.5, 4.6];

type Props = {
  origin: LatLng | null;
  destination: LatLng | null;
  /** Geometría de la ruta [lng, lat][] devuelta por OSRM; opcional. */
  route?: [number, number][] | null;
  onSelect: (point: LatLng) => void;
  height?: string;
  fallbackCenter?: [number, number];
  selectionHint?: string;
};

const lineOf = (coords: [number, number][]): GeoJSON.Feature<GeoJSON.LineString> => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });

export default function DestinationMap({ origin, destination, route, onSelect, height = "285px", fallbackCenter, selectionHint = 'Toca el lugar de destino' }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const [fallback,setFallback] = useState(false);
  const originMarker = useRef<maplibregl.Marker | null>(null);
  const destMarker = useRef<maplibregl.Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    if (!container.current || map.current) return;
    if(!canUseWebGL()){const timer=setTimeout(()=>setFallback(true),0);return()=>clearTimeout(timer);}
    const start = destination ?? origin;
    let m: MLMap;
    try { m = new maplibregl.Map({
      container: container.current, style: mapStyle(false),
      center: start ? [start.lng, start.lat] : fallbackCenter ?? COLOMBIA_CENTER, zoom: start || fallbackCenter ? 14 : 5,
      attributionControl: { compact: true }, cooperativeGestures: true,
    });
    } catch {container.current.replaceChildren();const timer=setTimeout(()=>setFallback(true),0);return()=>clearTimeout(timer);}
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      m.addSource("route", { type: "geojson", data: lineOf([]) });
      m.addLayer({ id: "route-halo", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 8, "line-opacity": 0.9 } });
      m.addLayer({ id: "route-line", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#0c3f8f", "line-width": 4.5 } });
      ready.current = true;
      sync(m, originMarker, destMarker, origin, destination, route ?? null, onSelectRef, true);
    });
    m.on("click", (e) => onSelectRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
    map.current = m;
    return () => { m.remove(); map.current = null; ready.current = false; originMarker.current = null; destMarker.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!map.current || !ready.current) return;
    sync(map.current, originMarker, destMarker, origin, destination, route ?? null, onSelectRef, false);
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng, route]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="destination-map" style={{ height }}>
      {fallback&&<CanvasMap center={destination?[destination.lng,destination.lat]:origin?[origin.lng,origin.lat]:fallbackCenter??COLOMBIA_CENTER} zoom={fallbackCenter||origin||destination?14:8} origin={origin} destination={destination} route={route??undefined} onSelect={onSelect}/>}
      {!fallback&&<div ref={container} className="destination-map__canvas" />}
      {!destination && <div className="destination-map__hint">{selectionHint}</div>}
    </div>
  );
}

function pin(color: string, size: number) {
  const el = document.createElement("div");
  el.className = "destination-map__pin";
  el.style.cssText = `width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.35)`;
  return el;
}

function sync(
  m: MLMap,
  originMarker: React.MutableRefObject<maplibregl.Marker | null>,
  destMarker: React.MutableRefObject<maplibregl.Marker | null>,
  origin: LatLng | null, destination: LatLng | null, route: [number, number][] | null,
  onSelectRef: React.MutableRefObject<(p: LatLng) => void>, first: boolean,
) {
  if (origin) {
    if (!originMarker.current) originMarker.current = new maplibregl.Marker({ element: pin("#487aa7", 22), anchor: "bottom" }).setLngLat([origin.lng, origin.lat]).addTo(m);
    else originMarker.current.setLngLat([origin.lng, origin.lat]);
  }
  if (destination) {
    if (!destMarker.current) {
      destMarker.current = new maplibregl.Marker({ element: pin("#ce1126", 28), anchor: "bottom", draggable: true }).setLngLat([destination.lng, destination.lat]).addTo(m);
      destMarker.current.on("dragend", () => { const p = destMarker.current!.getLngLat(); onSelectRef.current({ lat: p.lat, lng: p.lng }); });
    } else destMarker.current.setLngLat([destination.lng, destination.lat]);
  } else if (destMarker.current) { destMarker.current.remove(); destMarker.current = null; }

  (m.getSource("route") as GeoJSONSource | undefined)?.setData(lineOf(route ?? []));

  const pts: [number, number][] = route?.length ? route : [origin, destination].filter(Boolean).map((p) => [p!.lng, p!.lat]);
  if (!pts.length) return;
  if (pts.length === 1) { m.easeTo({ center: pts[0], zoom: Math.max(m.getZoom(), 14), duration: first ? 0 : 400 }); return; }
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  for (const [x, y] of pts) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  m.fitBounds([[minX, minY], [maxX, maxY]], { padding: 48, maxZoom: 15, duration: first ? 0 : 500 });
}
