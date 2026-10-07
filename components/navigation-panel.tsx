'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowRight, LocateFixed, MapPin, Navigation, Route, Search, Volume2, VolumeX, X, WifiOff } from 'lucide-react';
import { searchAddress, type GeoResult } from '@/lib/geocoding';
import { type LatLng, type TrackPoint } from '@/lib/geo';
import { cumulativeDistances, distanceLabel, guidanceAt, loadPlannedRoute, projectRoute, requestRoute, savePlannedRoute, type PlannedRoute } from '@/lib/navigation';
import { MAP_REGIONS, listSavedMaps, regionAt, type MapRegion } from '@/lib/offline-maps';
import type { useTripTracker } from '@/hooks/use-trip-tracker';
import OfflineMapManager from '@/components/offline-map-manager';
const DestinationMap = dynamic(() => import('@/components/destination-map'), { ssr: false, loading: () => <div className="maps-loading">Preparando mapa…</div> });
const TripMap = dynamic(() => import('@/components/trip-map'), { ssr: false, loading: () => <div className="maps-loading">Preparando mapa…</div> });
type Props = { userId?: string | null; tracker?: ReturnType<typeof useTripTracker>; onRouteChange?: (route: PlannedRoute | null) => void; standalone?: boolean; showDownloads?: boolean };

export default function NavigationPanel({ userId, tracker, onRouteChange, standalone = false, showDownloads = true }: Props) {
  const owner = userId || 'guest';
  const [route, setRoute] = useState<PlannedRoute | null>(() => typeof window === 'undefined' ? null : loadPlannedRoute(owner));
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [destinationName, setDestinationName] = useState('Destino en el mapa');
  const [selection, setSelection] = useState<'origin' | 'destination'>('destination');
  const [region, setRegion] = useState<MapRegion>(MAP_REGIONS[0]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [localPoints, setLocalPoints] = useState<TrackPoint[]>([]);
  const [localAccuracy, setLocalAccuracy] = useState<number | null>(null);
  const [localRunning, setLocalRunning] = useState(false);
  const [alongM, setAlongM] = useState(0);
  const [offRoute, setOffRoute] = useState(false);
  const [voice, setVoice] = useState(false);
  const [now, setNow] = useState(Date.now);
  const alive = useRef(true);
  const abortRoute = useRef<AbortController | null>(null);
  const gpsWatch = useRef<number | null>(null);
  const generation = useRef(0);
  const originGeneration = useRef(0);
  const progress = useRef<{ alongM: number; timestamp: number } | null>(null);
  const awayCount = useRef(0);
  const announced = useRef('');
  const points = tracker?.points ?? localPoints;
  const accuracy = tracker?.accuracyM ?? localAccuracy;
  const running = tracker ? tracker.state === 'tracking' || tracker.state === 'locating' : localRunning;
  const latest = points.at(-1);
  const fresh = !!latest && now - latest[2] < 30_000 && (accuracy ?? Infinity) <= 60;
  const geometryDistances = useMemo(() => route ? cumulativeDistances(route.coordinates) : [], [route]);
  const guidance = useMemo(() => route ? guidanceAt(route, alongM) : null, [route, alongM]);

  const stopLocal = useCallback(() => {
    if (gpsWatch.current !== null) navigator.geolocation.clearWatch(gpsWatch.current);
    gpsWatch.current = null; setLocalRunning(false);
    window.speechSynthesis?.cancel();
  }, []);
  useEffect(() => {
    alive.current = true;
    const requests = generation, origins = originGeneration;
    const refresh = () => { void listSavedMaps().then(items => { if (alive.current) setSavedIds(items.map(item => item.id)); }).catch(() => {}); };
    refresh(); window.addEventListener('autoram-maps-changed', refresh);
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => {
      alive.current = false; requests.current++; origins.current++;
      abortRoute.current?.abort();
      if (gpsWatch.current !== null) navigator.geolocation.clearWatch(gpsWatch.current);
      window.speechSynthesis?.cancel();
      clearInterval(timer); window.removeEventListener('autoram-maps-changed', refresh);
    };
  }, []);
  useEffect(() => { onRouteChange?.(route); }, [route, onRouteChange]);

  useEffect(() => {
    if (!route || !running || !latest || !fresh) return;
    const prior = progress.current;
    if (prior && latest[2] <= prior.timestamp) return;
    const elapsedS = prior ? Math.max(1, (latest[2] - prior.timestamp) / 1000) : 0;
    // A bounded forward window prevents jumps to a later leg at a crossing.
    const projected = projectRoute(route.coordinates, geometryDistances, { lat: latest[0], lng: latest[1] }, prior?.alongM ?? 0, prior ? prior.alongM + Math.max(250, elapsedS * 45) : Infinity);
    const away = projected.awayM > Math.max(70, (accuracy ?? 0) + 40);
    awayCount.current = away ? awayCount.current + 1 : 0;
    const newAlong = away ? prior?.alongM ?? 0 : Math.max(prior?.alongM ?? 0, projected.alongM);
    progress.current = { alongM: newAlong, timestamp: latest[2] };
    const timer = setTimeout(() => { setAlongM(newAlong); setOffRoute(awayCount.current >= 3); }, 0);
    return () => clearTimeout(timer);
  }, [route, running, latest, fresh, accuracy, geometryDistances]);

  useEffect(() => {
    if (!voice || !guidance || !running || !fresh || offRoute || !window.speechSynthesis) return;
    const band = guidance.arrived ? 'arrived' : guidance.nextInM < 25 ? 'now' : guidance.nextInM < 80 ? 'near' : guidance.nextInM < 250 ? 'soon' : 'far';
    const key = `${guidance.stepIndex}:${band}`;
    if (announced.current === key) return;
    announced.current = key;
    const speech = new SpeechSynthesisUtterance(guidance.arrived ? 'Llegaste a tu destino' : `${guidance.nextInM >= 25 ? `En ${distanceLabel(guidance.nextInM)}, ` : ''}${guidance.next.instruction}`);
    speech.lang = 'es-CO'; speech.rate = 1;
    const localVoice = window.speechSynthesis.getVoices().find(item => item.localService && item.lang.startsWith('es'));
    if (localVoice) speech.voice = localVoice;
    speech.onerror = event => { if (alive.current && event.error !== 'interrupted' && event.error !== 'canceled') setError('La voz no está disponible. Puedes seguir las indicaciones en pantalla.'); };
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(speech);
  }, [voice, guidance, running, fresh, offRoute]);
  useEffect(() => { if (!running || !voice) window.speechSynthesis?.cancel(); }, [running, voice]);

  function selectRegion(selected: MapRegion) { setRegion(selected); setError(''); }
  function choosePoint(point: LatLng) {
    originGeneration.current++; setLocating(false);
    if (selection === 'origin') { setOrigin(point); setSelection('destination'); }
    else { setDestination(point); setDestinationName('Destino en el mapa'); }
    setError('');
  }
  function locate() {
    if (!navigator.geolocation) { setError('Este navegador no permite usar GPS. Elige la salida en el mapa.'); return; }
    const attempt = ++originGeneration.current;
    setLocating(true); setError('');
    navigator.geolocation.getCurrentPosition(position => {
      if (!alive.current || attempt !== originGeneration.current) return;
      const point = { lat: position.coords.latitude, lng: position.coords.longitude };
      setOrigin(point); setLocating(false); setSelection('destination');
      const nearby = regionAt(point.lng, point.lat); if (nearby) setRegion(nearby);
    }, error => {
      if (!alive.current || attempt !== originGeneration.current) return;
      setLocating(false); setError(error.code === 1 ? 'Permite la ubicación o elige la salida en el mapa.' : 'No pudimos obtener tu ubicación. Elige la salida en el mapa.');
    }, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 15_000 });
  }
  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (searching || query.trim().length < 3) return;
    if (!navigator.onLine) { setError('Sin internet puedes elegir el destino tocando el mapa descargado. Para buscar una dirección nueva, conéctate.'); return; }
    const attempt = ++generation.current;
    setSearching(true); setError('');
    try { const items = await searchAddress(query, origin); if (alive.current && attempt === generation.current) { setResults(items); if (!items.length) setError('No encontramos esa dirección. Prueba con el nombre y la ciudad.'); } }
    catch { if (alive.current && attempt === generation.current) setError('No se pudo buscar la dirección. Puedes elegir el destino en el mapa.'); }
    finally { if (alive.current) setSearching(false); }
  }
  async function plan(recalculate = false) {
    if (busy) return;
    const start = recalculate && latest && fresh ? { lat: latest[0], lng: latest[1] } : origin;
    const end = recalculate && route ? { lng: route.coordinates.at(-1)![0], lat: route.coordinates.at(-1)![1] } : destination;
    if (!start || !end) { setError('Elige la salida y el destino en el mapa.'); return; }
    const controller = new AbortController(); abortRoute.current?.abort(); abortRoute.current = controller;
    const attempt = ++generation.current;
    setBusy(true); setError('');
    try {
      const planned = await requestRoute(start, end, recalculate && route ? route.destinationName : destinationName, controller.signal);
      if (!alive.current || attempt !== generation.current) return;
      progress.current = null; awayCount.current = 0; announced.current = ''; setAlongM(0); setOffRoute(false); setRoute(planned);
      if (!savePlannedRoute(owner, planned)) setError('Puedes navegar ahora, pero el teléfono no permitió guardar la ruta para después. Libera espacio e intenta de nuevo.');
    } catch (error) { if (alive.current && !controller.signal.aborted && attempt === generation.current) setError(error instanceof Error ? error.message : 'No se pudo calcular la ruta.'); }
    finally { if (alive.current) setBusy(false); }
  }
  function clearRoute() {
    abortRoute.current?.abort(); generation.current++;
    setRoute(null); savePlannedRoute(owner, null); setAlongM(0); setOffRoute(false); progress.current = null; announced.current = ''; setError('');
    window.speechSynthesis?.cancel(); if (standalone) stopLocal();
  }
  function start() {
    setError('');
    if (tracker) { tracker.start(); return; }
    if (!navigator.geolocation) { setError('Este navegador no permite usar GPS.'); return; }
    if (gpsWatch.current !== null) return;
    setLocalRunning(true); progress.current = null;
    gpsWatch.current = navigator.geolocation.watchPosition(position => {
      if (!alive.current) return;
      const point: TrackPoint = [position.coords.latitude, position.coords.longitude, position.timestamp];
      setLocalAccuracy(position.coords.accuracy); setNow(Date.now()); setLocalPoints(previous => [...previous.slice(-19), point]);
    }, error => { stopLocal(); setError(error.code === 1 ? 'Activa el permiso de ubicación para navegar.' : 'GPS sin señal. Acércate a un lugar abierto y vuelve a iniciar.'); }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20_000 });
  }
  const covered = route?.coordinates.every(([lng, lat]) => { const area = regionAt(lng, lat); return area && savedIds.includes(area.id); });
  return <div className="navigation-panel">
    {showDownloads && <details className="maps-download-details"><summary><WifiOff size={18}/>Mapas sin internet <span>{savedIds.length ? `${savedIds.length} guardado${savedIds.length === 1 ? '' : 's'}` : 'Descargar zonas'}</span></summary><OfflineMapManager compact onSelect={selectRegion}/></details>}
    {!route ? <section className="route-planner" aria-label="Preparar navegación">
      <div className="maps-section-title"><Route size={23}/><div><h2>¿A dónde vamos?</h2><p>Elige el destino y guarda la ruta antes de salir.</p></div></div>
      <div className="route-planner__origin"><button type="button" onClick={locate} disabled={locating}><LocateFixed size={17}/>{locating ? 'Buscando ubicación…' : 'Usar mi ubicación'}</button><button type="button" onClick={() => setSelection('origin')} className={selection === 'origin' ? 'is-selected' : ''}>Elegir salida en el mapa</button></div>
      <div className="route-search"><form onSubmit={search}><label className="sr-only" htmlFor="navigation-search">Dirección de destino</label><input id="navigation-search" placeholder="Dirección, lugar y ciudad" value={query} onChange={event => setQuery(event.target.value)} maxLength={180}/><button type="submit" disabled={searching || query.trim().length < 3} aria-label="Buscar destino"><Search size={18}/>{searching ? 'Buscando…' : 'Buscar'}</button></form>
      {!!results.length && <ul className="route-search__results">{results.map((result, index) => <li key={`${result.lat}-${index}`}><button type="button" onClick={() => { setDestination(result); setDestinationName(result.label); setResults([]); const nearby = regionAt(result.lng, result.lat); if (nearby) setRegion(nearby); }}><MapPin size={16}/>{result.label}</button></li>)}</ul>}</div>
      <div className="route-map-tools"><label>Zona <select value={region.id} onChange={event => selectRegion(MAP_REGIONS.find(item => item.id === event.target.value)!)}>{MAP_REGIONS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><span>{selection === 'origin' ? 'Toca tu punto de salida' : 'Toca tu destino'}</span></div>
      <DestinationMap key={region.id} origin={origin} destination={destination} onSelect={choosePoint} fallbackCenter={region.center as [number, number]} height="300px"/>
      <div className="route-selection"><span><i className={origin ? 'selected' : ''}/>{origin ? 'Salida lista' : 'Elige tu salida'}</span><ArrowRight size={15}/><span><i className={destination ? 'selected' : ''}/>{destination ? destinationName : 'Elige tu destino'}</span></div>
      <button type="button" className="maps-primary route-plan-button" onClick={() => void plan()} disabled={busy || !origin || !destination}><Route size={19}/>{busy ? 'Calculando ruta…' : 'Calcular y guardar ruta'}</button>
      <p className="maps-footnote">La ruta se calcula por carretera. El tiempo es una estimación y no incluye tráfico en vivo.</p>
    </section> : <section className="navigation-guide" aria-label="Indicaciones de navegación">
      <div className="navigation-guide__top"><span><Navigation size={17}/>HACIA {route.destinationName}</span><button type="button" className="maps-icon-button" aria-label="Cambiar destino" onClick={clearRoute}><X size={19}/></button></div>
      <div className="navigation-guide__instruction"><span className="navigation-guide__distance">{offRoute ? 'Fuera de ruta' : running && !fresh ? 'Esperando GPS' : guidance?.arrived ? 'Llegaste' : `En ${distanceLabel(guidance?.nextInM ?? 0)}`}</span><h2>{offRoute ? 'Detente y revisa el camino' : guidance?.arrived ? 'Tu destino está aquí' : guidance?.next.instruction}</h2></div>
      <div className="navigation-guide__remaining"><span><b>{distanceLabel(guidance?.remainingM ?? route.distanceM)}</b> restantes</span><span><b>{Math.max(1, Math.round((guidance?.remainingS ?? route.durationS) / 60))} min</b> estimados</span><button type="button" aria-label={voice ? 'Desactivar voz' : 'Activar voz'} aria-pressed={voice} onClick={() => { if (!window.speechSynthesis) { setError('Tu navegador no dispone de voz. Sigue las indicaciones en pantalla.'); return; } announced.current = ''; setVoice(value => !value); }}>{voice ? <Volume2 size={19}/> : <VolumeX size={19}/>}Voz {voice ? 'activa' : 'apagada'}</button></div>
      {standalone && <TripMap points={localPoints} live plannedRoute={route.coordinates} height="390px" fallbackCenter={route.coordinates[0]}/>}
      {!running && <button type="button" className="maps-primary" disabled={!!tracker?.hasDraft || tracker?.state === 'saving'} onClick={start}><Navigation size={18}/>{tracker ? 'Iniciar recorrido y navegar' : 'Iniciar navegación'}</button>}
      {standalone && running && <button type="button" className="maps-secondary" onClick={stopLocal}>Detener navegación</button>}
      {offRoute && <button type="button" className="maps-primary" disabled={busy || !fresh} onClick={() => void plan(true)}>{busy ? 'Calculando…' : 'Recalcular desde mi ubicación'}</button>}
      {!covered && <p className="maps-notice"><WifiOff size={17}/>La ruta atraviesa una zona que no está descargada. Comprueba la cobertura antes de salir sin internet.</p>}
      <p className="maps-footnote">Ruta guardada {new Date(route.createdAt).toLocaleDateString('es-CO')}. Puedes seguir sus indicaciones sin señal. Recalcular requiere internet. La voz depende de las voces disponibles en tu teléfono.</p>
    </section>}
    {error && <p className="maps-error" role="alert">{error}</p>}
  </div>;
}
