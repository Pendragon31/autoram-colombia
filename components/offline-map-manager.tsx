'use client';
import { useEffect, useRef, useState } from 'react';
import { Download, CheckCircle2, Trash2, WifiOff, X, MapPin } from 'lucide-react';
import { MAP_REGIONS, listSavedMaps, loadMapCatalog, downloadMap, deleteSavedMap, type MapRegion, type SavedMap } from '@/lib/offline-maps';

type Props = { onSelect?: (region: MapRegion) => void; compact?: boolean };
const megabytes = (bytes: number) => `${(bytes / 1048576).toLocaleString('es-CO', { maximumFractionDigits: 1 })} MB`;
export default function OfflineMapManager({ onSelect, compact = false }: Props) {
  const [regions, setRegions] = useState(MAP_REGIONS);
  const [saved, setSaved] = useState<Omit<SavedMap, 'blob'>[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [ready, setReady] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const refresh = () => { void listSavedMaps().then(items => { if (alive.current) { setSaved(items); setReady(true); } }).catch(error => { if (alive.current) setError(error.message); }); };
    refresh();
    if ('serviceWorker' in navigator) void navigator.serviceWorker.ready.then(() => { if (alive.current) setAppReady(true); });
    void loadMapCatalog().then(items => { if (alive.current) setRegions(items); }).catch(() => {});
    window.addEventListener('autoram-maps-changed', refresh);
    return () => { alive.current = false; controller.current?.abort(); window.removeEventListener('autoram-maps-changed', refresh); };
  }, []);
  async function download(region: MapRegion) {
    if (controller.current) return;
    const abort = new AbortController(); controller.current = abort;
    setActive(region.id); setError(''); setMessage(''); setProgress(0);
    try {
      const catalog = region.sha256 ? regions : await loadMapCatalog();
      const current = catalog.find(item => item.id === region.id)!;
      await downloadMap(current, abort.signal, (received, total) => { if (alive.current) setProgress(Math.round(received / total * 100)); });
      if (alive.current) { setRegions(catalog); setMessage(`${region.name} está listo para usar sin internet.`); }
    } catch (error) {
      if (alive.current) { if (abort.signal.aborted) setMessage('Descarga cancelada. Puedes intentarlo de nuevo.'); else setError(error instanceof Error ? error.message : 'No se pudo descargar el mapa.'); }
    } finally { controller.current = null; if (alive.current) setActive(null); }
  }
  async function remove(id: string) {
    setError(''); setMessage('');
    try { await deleteSavedMap(id); } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo eliminar el mapa.'); }
  }
  return <section className={`offline-manager ${compact ? 'offline-manager--compact' : ''}`} aria-label="Mapas sin internet">
    <div className="offline-manager__heading"><span className="maps-icon"><WifiOff size={25}/></span><div><small>PREPARA TU CAMINO</small><h2>Mapas sin internet</h2><p>Descarga tu zona con Wi-Fi. Las calles y sus nombres quedan en este teléfono.</p></div></div>
    <div className="offline-regions">{regions.map(region => {
      const stored = saved.find(item => item.id === region.id), downloading = active === region.id;
      return <article className={stored ? 'offline-region is-saved' : 'offline-region'} key={region.id}>
        <div className="offline-region__details"><MapPin size={20}/><div><h3>{region.name}</h3><p>{region.description}</p><small>{stored ? <><CheckCircle2 size={13}/>Guardado · {megabytes(stored.bytes)}</> : region.bytes ? `${megabytes(region.bytes)} · Calles y nombres` : ready ? 'Disponible para descargar' : 'Comprobando mapas…'}</small></div></div>
        {downloading ? <div className="offline-region__progress"><progress max={100} value={progress} aria-label={`Descargando ${region.name}`}/><span>{progress}%{progress === 100 ? ' · Verificando…' : ''}</span><button type="button" aria-label="Cancelar descarga" onClick={() => controller.current?.abort()}><X size={17}/></button></div> : <div className="offline-region__actions">{stored && onSelect && <button type="button" className="maps-secondary" onClick={() => onSelect(region)}>Ver mapa</button>}{stored ? <button type="button" className="maps-icon-button" aria-label={`Eliminar mapa de ${region.name}`} disabled={!!active} onClick={() => void remove(region.id)}><Trash2 size={18}/></button> : <button type="button" className="maps-download" disabled={!!active || !ready} onClick={() => void download(region)}><Download size={17}/>Descargar</button>}</div>}
      </article>;
    })}</div>
    {error && <p className="maps-error" role="alert">{error}</p>}{message && <p className="maps-success" role="status">{message}</p>}
    <p className="maps-offline-status">{appReady ? <><CheckCircle2 size={15}/>AutoRAM listo para abrir sin internet</> : 'Mantén la app abierta con internet mientras se prepara el acceso sin conexión.'}</p>
    <p className="maps-footnote">Cada descarga cubre la zona indicada. Guarda la ruta antes de salir: calcular otra ruta y buscar direcciones nuevas requiere internet. Si borras los datos del navegador, tendrás que descargar los mapas otra vez.</p>
  </section>;
}
