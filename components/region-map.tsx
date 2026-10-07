'use client';
import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { mapStyle } from '@/lib/map-style';
import type { MapRegion } from '@/lib/offline-maps';
export default function RegionMap({ region }: { region: MapRegion }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!element.current) return;
    const [west, south, east, north] = region.bounds;
    const map = new maplibregl.Map({ container: element.current, style: mapStyle(false, region), center: region.center as [number, number], zoom: 12, maxBounds: [[west - .1, south - .1], [east + .1, north + .1]], attributionControl: { compact: true }, cooperativeGestures: true });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.on('load', () => {
      map.addSource('coverage', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] } } });
      map.addLayer({ id: 'coverage-line', type: 'line', source: 'coverage', paint: { 'line-color': '#247955', 'line-width': 2, 'line-dasharray': [3, 2] } });
    });
    return () => map.remove();
  }, [region]);
  return <div className="region-map" ref={element} aria-label={`Mapa de ${region.name}`}/>;
}
