'use client';
import { useEffect, useRef, useState } from 'react';
import { LocateFixed, Minus, Plus } from 'lucide-react';
import { mapArchive } from '@/lib/map-archive';
import { regionAt, type MapRegion } from '@/lib/offline-maps';
import { fitView, paintLabels, paintVectorTile, worldLocation, worldPoint, type MapView } from '@/lib/canvas-map';
import type { LatLng, TrackPoint } from '@/lib/geo';
type Props = { center: [number, number]; zoom?: number; dark?: boolean; region?: MapRegion; points?: TrackPoint[]; live?: boolean; route?: [number, number][]; origin?: LatLng | null; destination?: LatLng | null; onSelect?: (point: LatLng) => void; coverage?: number[] };
const tiles = new Map<string, ArrayBuffer>();
export default function CanvasMap({ center, zoom = 13, dark = false, region, points = [], live = false, route, origin, destination, onSelect, coverage }: Props) {
  const container = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<MapView>({ lng: center[0], lat: center[1], zoom });
  const [size, setSize] = useState<[number, number]>([0, 0]);
  const [error, setError] = useState('');
  const [following, setFollowing] = useState(live);
  const drag = useRef<{ x: number; y: number; view: MapView; moved: boolean } | null>(null);
  const alive = useRef(true);
  const fitting = useRef('');
  useEffect(() => {
    alive.current = true;
    if (!container.current) return;
    const observer = new ResizeObserver(entries => { const box = entries[0].contentRect; setSize([Math.round(box.width), Math.round(box.height)]); });
    observer.observe(container.current);
    return () => { alive.current = false; observer.disconnect(); };
  }, []);
  useEffect(() => {
    const last = points.at(-1);
    if (live && following && last) { const timer = setTimeout(() => setView(current => ({ lng: last[1], lat: last[0], zoom: Math.max(15, current.zoom) })), 0); return () => clearTimeout(timer); }
    const coordinates = route?.length ? route : !live && points.length ? points.map(([lat, lng]) => [lng, lat] as [number, number]) : [origin, destination].filter(Boolean).map(point => [point!.lng, point!.lat] as [number, number]);
    const key = JSON.stringify([coordinates.at(0), coordinates.at(-1), coordinates.length]);
    if (!coordinates.length || fitting.current === key) return;
    const result = fitView(coordinates, size[0], size[1]);
    if (result) { fitting.current = key; const timer = setTimeout(() => setView(result), 0); return () => clearTimeout(timer); }
  }, [points, live, following, route, origin, destination, size]);
  useEffect(() => {
    if (!canvas.current || !size[0] || !size[1]) return;
    const element = canvas.current, context = element.getContext('2d'); if (!context) return;
    let current = true;
    const controller = new AbortController();
    const ratio = Math.min(2, window.devicePixelRatio || 1), [width, height] = size;
    element.width = width * ratio; element.height = height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const [cx, cy] = worldPoint(view.lng, view.lat, view.zoom), left = cx - width / 2, top = cy - height / 2;
    const z = Math.min(15, view.zoom), tileSize = 256 * 2 ** (view.zoom - z);
    const area = region ?? regionAt(view.lng, view.lat);
    async function draw() {
      context!.fillStyle = dark ? '#17211c' : '#eeeee7'; context!.fillRect(0, 0, width, height);
      const labels: ReturnType<typeof paintVectorTile> = [];
      const requested: { x: number; y: number; tile: ArrayBuffer }[] = [];
      if (area) {
        const tasks: Promise<void>[] = [];
        for (let x = Math.floor(left / tileSize); x <= Math.floor((left + width) / tileSize); x++) {
          for (let y = Math.floor(top / tileSize); y <= Math.floor((top + height) / tileSize); y++) {
            if (x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) continue;
            tasks.push((async () => {
              const key = `${area.id}/${z}/${x}/${y}`;
              let data = tiles.get(key);
              if (!data) { const response = await mapArchive(area).getZxy(z, x, y, controller.signal); data = response?.data; if (data && current) { if (tiles.size > 160) tiles.delete(tiles.keys().next().value!); tiles.set(key, data); } }
              if (data) requested.push({ x, y, tile: data });
            })());
          }
        }
        await Promise.all(tasks);
        if (!current) return;
        requested.sort((a, b) => a.y - b.y || a.x - b.x);
        for (const tile of requested) labels.push(...paintVectorTile(context!, tile.tile, tile.x * tileSize - left, tile.y * tileSize - top, tileSize, view.zoom, dark));
        paintLabels(context!, labels, width, height, dark);
      } else if (navigator.onLine) {
        const images: Promise<void>[] = [];
        for (let x = Math.floor(left / tileSize); x <= Math.floor((left + width) / tileSize); x++) for (let y = Math.floor(top / tileSize); y <= Math.floor((top + height) / tileSize); y++) {
          images.push(new Promise(resolve => { const image = new Image(); image.onload = () => { if (current) context!.drawImage(image, x * tileSize - left, y * tileSize - top, tileSize, tileSize); resolve(); }; image.onerror = () => resolve(); image.src = `https://a.basemaps.cartocdn.com/${dark ? 'dark_all' : 'light_all'}/${z}/${x}/${y}.png`; }));
        }
        await Promise.all(images); if (!current) return;
      }
      const position = (lng: number, lat: number) => { const [x, y] = worldPoint(lng, lat, view.zoom); return [x - left, y - top]; };
      function path(coordinates: [number, number][], color: string, lineWidth: number, dash: number[] = []) {
        if (!coordinates.length) return;
        context!.beginPath(); coordinates.forEach(([lng, lat], index) => { const [x, y] = position(lng, lat); if (!index) context!.moveTo(x, y); else context!.lineTo(x, y); });
        context!.strokeStyle = color; context!.lineWidth = lineWidth; context!.lineJoin = 'round'; context!.lineCap = 'round'; context!.setLineDash(dash); context!.stroke(); context!.setLineDash([]);
      }
      if (coverage) { const [w, s, e, n] = coverage; path([[w,s],[e,s],[e,n],[w,n],[w,s]], '#247955', 2, [7,4]); }
      if (route?.length) { path(route, dark ? '#122017' : '#ffffff', 9); path(route, dark ? '#76c5f5' : '#155b9b', 5); }
      if (points.length) { const coordinates = points.map(([lat,lng]) => [lng,lat] as [number,number]); path(coordinates, '#172219', 6); path(coordinates, '#b8ff2c', 3); }
      function marker(point: LatLng, color: string, radius = 7) {
        const [x,y] = position(point.lng,point.lat); context!.beginPath();context!.arc(x,y,radius,0,2*Math.PI);context!.fillStyle=color;context!.fill();context!.lineWidth=3;context!.strokeStyle='#ffffff';context!.stroke();
      }
      if (origin) marker(origin,'#317fc1');
      if (destination) marker(destination,'#ce1126',9);
      if (route?.length) { const last=route.at(-1)!;marker({lng:last[0],lat:last[1]},'#df653a',8); }
      if (points.length) { const last=points.at(-1)!;marker({lng:last[1],lat:last[0]},live?'#54b8f5':'#b8ff2c',live?9:7); }
      if (current) setError(!area && !navigator.onLine ? 'Esta zona no está descargada. Las indicaciones de tu ruta guardada siguen disponibles.' : '');
    }
    void draw().catch(error => { if (current && alive.current && !controller.signal.aborted) setError(error instanceof Error ? error.message : 'No pudimos mostrar las calles. Conéctate y descarga esta zona.'); });
    return () => { current = false; controller.abort(); };
  }, [view, size, dark, region, points, route, origin, destination, coverage, live]);
  return <div className="canvas-map" ref={container}>
    <canvas ref={canvas} aria-label="Mapa con calles, ubicación y ruta" onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); drag.current={x:event.clientX,y:event.clientY,view,moved:false}; }} onPointerMove={event => { const prior=drag.current;if(!prior)return;const dx=event.clientX-prior.x,dy=event.clientY-prior.y;if(Math.hypot(dx,dy)<4)return;prior.moved=true;setFollowing(false);const [cx,cy]=worldPoint(prior.view.lng,prior.view.lat,prior.view.zoom);const [lng,lat]=worldLocation(cx-dx,cy-dy,prior.view.zoom);setView({...prior.view,lng,lat}); }} onPointerUp={event => { const prior=drag.current;drag.current=null;if(prior&&!prior.moved&&onSelect){const box=event.currentTarget.getBoundingClientRect();const [cx,cy]=worldPoint(view.lng,view.lat,view.zoom);const [lng,lat]=worldLocation(cx+event.clientX-box.left-size[0]/2,cy+event.clientY-box.top-size[1]/2,view.zoom);onSelect({lng,lat});} }} onPointerCancel={()=>{drag.current=null;}}/>
    <span className="canvas-map__mode">Modo ligero</span><div className="canvas-map__controls"><button type="button" aria-label="Acercar mapa" onClick={()=>setView(view=>({...view,zoom:Math.min(17,view.zoom+1)}))}><Plus size={19}/></button><button type="button" aria-label="Alejar mapa" onClick={()=>setView(view=>({...view,zoom:Math.max(8,view.zoom-1)}))}><Minus size={19}/></button>{live&&<button type="button" aria-label="Centrar mi ubicación" disabled={!points.length} onClick={()=>setFollowing(true)}><LocateFixed size={19}/></button>}</div>
    {error&&<p className="canvas-map__error" role="status">{error}</p>}<a className="canvas-map__attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap · {region||regionAt(view.lng,view.lat)?'Protomaps':'CARTO'}</a>
  </div>;
}
