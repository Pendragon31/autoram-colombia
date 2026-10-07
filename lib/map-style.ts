import maplibregl, { type StyleSpecification, type LayerSpecification } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { MAP_REGIONS, type MapRegion } from '@/lib/offline-maps';

import { mapArchive } from '@/lib/map-archive';
let registered = false;
export function prepareMapProtocol() {
  if (registered) return;
  const protocol = new Protocol();
  for (const region of MAP_REGIONS) {
    protocol.add(mapArchive(region));
  }
  maplibregl.addProtocol('pmtiles', protocol.tile);
  maplibregl.addProtocol('autoram-font', async (request, abort) => {
    const url = request.url.replace(/^autoram-font:\/\//, '');
    const parsed = new URL(url);
    if (parsed.origin !== window.location.origin || !parsed.pathname.startsWith('/maps/fonts/')) throw new Error('Fuente de mapa no válida');
    const cache = await caches.open('autoram-map-fonts-v1');
    let response = await cache.match(url);
    if (!response) {
      response = await fetch(url, { signal: abort.signal });
      if (!response.ok || (response.headers.get('content-type') ?? '').includes('html')) throw new Error('No se pudieron cargar los nombres de calles');
      await cache.put(url, response.clone());
    }
    return { data: await response.arrayBuffer() };
  });
  registered = true;
}

export function mapStyle(dark = true, onlyRegion?: MapRegion): StyleSpecification {
  prepareMapProtocol();
  const sources: StyleSpecification['sources'] = {};
  const layers: LayerSpecification[] = [{ id: 'bm-background', type: 'background', paint: { 'background-color': dark ? '#171f1b' : '#edece5' } }];
  if (!onlyRegion && navigator.onLine) {
    sources.online = { type: 'raster', tiles: [`https://a.basemaps.cartocdn.com/${dark ? 'dark_all' : 'light_all'}/{z}/{x}/{y}.png`], tileSize: 256, attribution: '© OpenStreetMap contributors · © CARTO' };
    layers.push({ id: 'bm-online', type: 'raster', source: 'online' });
  }
  for (const region of onlyRegion ? [onlyRegion] : MAP_REGIONS) {
    const source = `bm-${region.id}`;
    sources[source] = { type: 'vector', url: `pmtiles://${new URL(region.path, window.location.origin).href}`, bounds: region.bounds as [number, number, number, number], attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Protomaps' };
    const minzoom = onlyRegion ? 0 : 10;
    const add = (layer: Record<string, unknown>) => layers.push({ source, minzoom, ...layer, id: `${source}-${layer.id}` } as LayerSpecification);
    add({ id: 'earth', type: 'fill', 'source-layer': 'earth', paint: { 'fill-color': dark ? '#17211c' : '#eeeee8' } });
    add({ id: 'landuse', type: 'fill', 'source-layer': 'landuse', paint: { 'fill-color': dark ? '#24362a' : '#dbe8d0', 'fill-opacity': 0.7 } });
    add({ id: 'water', type: 'fill', 'source-layer': 'water', paint: { 'fill-color': dark ? '#204c58' : '#add6e4' } });
    add({ id: 'buildings', type: 'fill', 'source-layer': 'buildings', minzoom: 14, paint: { 'fill-color': dark ? '#35453b' : '#d4d0c8', 'fill-outline-color': dark ? '#415246' : '#c3bfb7' } });
    add({ id: 'roads-halo', type: 'line', 'source-layer': 'roads', filter: ['!=', ['get', 'kind'], 'rail'], paint: { 'line-color': dark ? '#111915' : '#c5beb0', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 15, 6, 18, 16] }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    add({ id: 'roads', type: 'line', 'source-layer': 'roads', filter: ['!=', ['get', 'kind'], 'rail'], paint: { 'line-color': ['match', ['get', 'kind'], ['highway', 'major_road'], dark ? '#d0c48d' : '#fff3c0', dark ? '#607168' : '#ffffff'], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 15, 3.5, 18, 12] }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    const labelPaint = { 'text-color': dark ? '#eef4ed' : '#364b41', 'text-halo-color': dark ? '#17211c' : '#f8f7ef', 'text-halo-width': 1.5 };
    const label = ['coalesce', ['get', 'name:es'], ['get', 'name']];
    add({ id: 'road-names', type: 'symbol', 'source-layer': 'roads', minzoom: 13, layout: { 'symbol-placement': 'line', 'text-field': label, 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-max-angle': 35 }, paint: labelPaint });
    add({ id: 'places', type: 'symbol', 'source-layer': 'places', layout: { 'text-field': label, 'text-font': ['Noto Sans Regular'], 'text-size': 14, 'text-padding': 8, 'text-max-width': 9 }, paint: labelPaint });
  }
  return { version: 8, glyphs: `autoram-font://${window.location.origin}/maps/fonts/{fontstack}/{range}.pbf`, sources, layers };
}
