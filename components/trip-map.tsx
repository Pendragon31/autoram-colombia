// AUTORAM · TripMap
//
// Mapa del recorrido con MapLibre GL (open source, sin llave).
// Tiles: CARTO Dark Matter (gratis con atribución) — combina con el panel carbón.
// Si más adelante quieres tiles vectoriales, cambia STYLE por un estilo de
// MapTiler u OpenFreeMap; el resto del componente no cambia.
//
// Los estilos (maplibre-gl.css y app/trip-map.css) se importan en app/layout.tsx.
//
// Uso — viaje guardado:
//   <TripMap points={trip.route_points} />
// Uso — viaje en curso (sigue al conductor):
//   <TripMap points={tracker.points} live />

'use client';

import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MLMap, type GeoJSONSource, type StyleSpecification } from 'maplibre-gl';

import { routeBounds, type TrackPoint } from "@/lib/geo";


const BRAND_LIME = '#B8FF2C';
const BRAND_CARBON = '#080B0A';

const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · © <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': BRAND_CARBON } },
    { id: 'carto', type: 'raster', source: 'carto', paint: { 'raster-saturation': -0.2, 'raster-brightness-max': 0.9 } },
  ],
};

// Villavicencio como centro por defecto cuando aún no hay puntos.
// Sin puntos: se usa fallbackCenter (p. ej. el fin del último recorrido) o Colombia completa.
const COLOMBIA_CENTER: [number, number] = [-73.5, 4.6];

type Props = {
  points: TrackPoint[];
  live?: boolean;
  className?: string;
  /** Alto del mapa. Default 280px; en pantalla de viaje usa '60vh'. */
  height?: string;
  /** Centro inicial cuando aún no hay puntos: [lng, lat]. */
  fallbackCenter?: [number, number];
};

function toLineGeoJSON(points: TrackPoint[]): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: points.map(([lat, lng]) => [lng, lat]) },
  };
}

function toMarkersGeoJSON(points: TrackPoint[], live: boolean): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  if (points.length) {
    const [slat, slng] = points[0];
    features.push({ type: 'Feature', properties: { kind: 'start' }, geometry: { type: 'Point', coordinates: [slng, slat] } });
    if (points.length > 1) {
      const [elat, elng] = points[points.length - 1];
      features.push({ type: 'Feature', properties: { kind: live ? 'me' : 'end' }, geometry: { type: 'Point', coordinates: [elng, elat] } });
    }
  }
  return { type: 'FeatureCollection', features };
}

export default function TripMap({ points, live = false, className = '', height = '280px', fallbackCenter }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const userMoved = useRef(false);

  // Crear el mapa una sola vez
  useEffect(() => {
    if (!container.current || map.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: STYLE,
      center: fallbackCenter ?? COLOMBIA_CENTER,
      zoom: fallbackCenter ? 13 : 5,
      attributionControl: { compact: true },
      cooperativeGestures: !live, // en listado no secuestra el scroll del dedo
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    if (live) {
      m.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false, showUserLocation: false }), 'top-right');
      m.on('dragstart', () => { userMoved.current = true; });
    }

    m.on('load', () => {
      m.addSource('route', { type: 'geojson', data: toLineGeoJSON([]) });
      m.addSource('markers', { type: 'geojson', data: toMarkersGeoJSON([], live) });

      // Halo debajo de la línea para que se lea sobre calles oscuras
      m.addLayer({
        id: 'route-halo', type: 'line', source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': BRAND_CARBON, 'line-width': 8, 'line-opacity': 0.7 },
      });
      m.addLayer({
        id: 'route-line', type: 'line', source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': BRAND_LIME, 'line-width': 4 },
      });
      m.addLayer({
        id: 'marker-start', type: 'circle', source: 'markers', filter: ['==', ['get', 'kind'], 'start'],
        paint: { 'circle-radius': 6, 'circle-color': '#F5F7F5', 'circle-stroke-color': BRAND_CARBON, 'circle-stroke-width': 2 },
      });
      m.addLayer({
        id: 'marker-end', type: 'circle', source: 'markers', filter: ['==', ['get', 'kind'], 'end'],
        paint: { 'circle-radius': 7, 'circle-color': BRAND_LIME, 'circle-stroke-color': BRAND_CARBON, 'circle-stroke-width': 2 },
      });
      m.addLayer({
        id: 'marker-me-pulse', type: 'circle', source: 'markers', filter: ['==', ['get', 'kind'], 'me'],
        paint: { 'circle-radius': 18, 'circle-color': BRAND_LIME, 'circle-opacity': 0.18 },
      });
      m.addLayer({
        id: 'marker-me', type: 'circle', source: 'markers', filter: ['==', ['get', 'kind'], 'me'],
        paint: { 'circle-radius': 7, 'circle-color': BRAND_LIME, 'circle-stroke-color': '#F5F7F5', 'circle-stroke-width': 2 },
      });
      ready.current = true;
      applyPoints(m, points, live, userMoved.current, true);
    });

    map.current = m;
    return () => { m.remove(); map.current = null; ready.current = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Actualizar datos cuando cambian los puntos
  useEffect(() => {
    if (!map.current || !ready.current) return;
    applyPoints(map.current, points, live, userMoved.current, false);
  }, [points, live]);

  return (
    <div className={`trip-map ${live ? 'trip-map--live' : ''} ${className}`} style={{ height }}>
      <div ref={container} className="trip-map__canvas" />
      {points.length === 0 && (
        <div className="trip-map__empty">
          {live ? 'Buscando señal de GPS…' : 'Este viaje no tiene ruta guardada.'}
        </div>
      )}
    </div>
  );
}

function applyPoints(m: MLMap, points: TrackPoint[], live: boolean, userMoved: boolean, first: boolean) {
  (m.getSource('route') as GeoJSONSource | undefined)?.setData(toLineGeoJSON(points));
  (m.getSource('markers') as GeoJSONSource | undefined)?.setData(toMarkersGeoJSON(points, live));

  if (!points.length) return;

  if (live) {
    const [lat, lng] = points[points.length - 1];
    if (first) m.jumpTo({ center: [lng, lat], zoom: 16 });
    else if (!userMoved) m.easeTo({ center: [lng, lat], zoom: Math.max(m.getZoom(), 15), duration: 600 });
    return;
  }

  const b = routeBounds(points);
  if (b) m.fitBounds(b, { padding: 36, maxZoom: 16, duration: first ? 0 : 500 });
}
