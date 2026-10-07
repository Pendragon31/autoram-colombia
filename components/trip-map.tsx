'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MLMap, type GeoJSONSource } from 'maplibre-gl';

import { LocateFixed } from "lucide-react";
import { mapStyle } from "@/lib/map-style";
import { routeBounds, type TrackPoint } from "@/lib/geo";


const BRAND_LIME = '#B8FF2C';
const BRAND_CARBON = '#080B0A';

// Villavicencio como centro por defecto cuando aún no hay puntos.
// Sin puntos: se usa fallbackCenter (p. ej. el fin del último recorrido) o Colombia completa.
const COLOMBIA_CENTER: [number, number] = [-73.5, 4.6];

type Props = {
  points: TrackPoint[];
  plannedRoute?: [number, number][];
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
    if (points.length > 1 || live) {
      const [elat, elng] = points[points.length - 1];
      features.push({ type: 'Feature', properties: { kind: live ? 'me' : 'end' }, geometry: { type: 'Point', coordinates: [elng, elat] } });
    }
  }
  return { type: 'FeatureCollection', features };
}

export default function TripMap({ points, live = false, className = '', height = '280px', fallbackCenter, plannedRoute }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const userMoved = useRef(false);
  const [following,setFollowing] = useState(true);
  const latest = useRef({points,plannedRoute});
  useEffect(()=>{latest.current={points,plannedRoute};},[points,plannedRoute]);

  // Crear el mapa una sola vez
  useEffect(() => {
    if (!container.current || map.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: mapStyle(true),
      center: fallbackCenter ?? (live ? [-73.635,4.105] : COLOMBIA_CENTER),
      zoom: fallbackCenter || live ? 13 : 5,
      attributionControl: { compact: true },
      cooperativeGestures: !live, // en listado no secuestra el scroll del dedo
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    if (live) {
      m.on('dragstart', () => { userMoved.current = true; setFollowing(false); });
    }

    m.on('load', () => {
      m.addSource('route', { type: 'geojson', data: toLineGeoJSON([]) });
      m.addSource('planned', {type:'geojson',data:toLineGeoJSON([])});
      m.addLayer({id:'planned-halo',type:'line',source:'planned',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':BRAND_CARBON,'line-width':10}});
      m.addLayer({id:'planned-line',type:'line',source:'planned',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#76c5f5','line-width':6}});
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
      applyPoints(m, latest.current.points, live, userMoved.current, true, latest.current.plannedRoute);
    });

    map.current = m;
    return () => { m.remove(); map.current = null; ready.current = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Actualizar datos cuando cambian los puntos
  useEffect(() => {
    if (!map.current || !ready.current) return;
    applyPoints(map.current, points, live, userMoved.current, !points.length && !!plannedRoute?.length, plannedRoute);
  }, [points, live, plannedRoute]);

  return (
    <div className={`trip-map ${live ? 'trip-map--live' : ''} ${className}`} style={{ height }}>
      <div ref={container} className="trip-map__canvas" />
      {live && <button type="button" className={`trip-map__recenter ${following?'is-following':''}`} aria-label="Centrar mi ubicación y seguir el recorrido" aria-pressed={following} disabled={!points.length} onClick={()=>{userMoved.current=false;setFollowing(true);if(map.current&&ready.current)applyPoints(map.current,points,live,false,false,plannedRoute);}}><LocateFixed size={21}/></button>}
      {points.length === 0 && !plannedRoute?.length && !live && (
        <div className="trip-map__empty">
          {live ? 'Buscando señal de GPS…' : 'Este viaje no tiene ruta guardada.'}
        </div>
      )}
    </div>
  );
}

function applyPoints(m: MLMap, points: TrackPoint[], live: boolean, userMoved: boolean, first: boolean, planned?: [number,number][]) {
  (m.getSource('planned') as GeoJSONSource | undefined)?.setData(toLineGeoJSON((planned??[]).map(([lng,lat])=>[lat,lng,0])));
  (m.getSource('route') as GeoJSONSource | undefined)?.setData(toLineGeoJSON(points));
  (m.getSource('markers') as GeoJSONSource | undefined)?.setData(toMarkersGeoJSON(points, live));

  if (!points.length) { if(first&&planned?.length){const b=routeBounds(planned.map(([lng,lat])=>[lat,lng,0]));if(b)m.fitBounds(b,{padding:45,maxZoom:15,duration:0});} return; }

  if (live) {
    const [lat, lng] = points[points.length - 1];
    let bearing=m.getBearing();
    if(points.length>1){const [aLat,aLng]=points[points.length-2],dx=(lng-aLng)*Math.cos(lat*Math.PI/180),dy=lat-aLat;if(Math.hypot(dx,dy)*111320>4)bearing=Math.atan2(dx,dy)*180/Math.PI;}
    if (first || !userMoved) m.easeTo({ center: [lng, lat], zoom: Math.max(m.getZoom(), 15), bearing, pitch:35, duration: first?0:600 });
    return;
  }

  const b = routeBounds(points);
  if (b) m.fitBounds(b, { padding: 36, maxZoom: 16, duration: first ? 0 : 500 });
}
