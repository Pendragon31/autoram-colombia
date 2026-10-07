'use client';
/* Full document navigation lets the service worker open the public shell offline. */
/* eslint-disable @next/next/no-html-link-for-pages */
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { ArrowLeft, Download, Navigation, WifiOff } from 'lucide-react';
import { MAP_REGIONS, type MapRegion } from '@/lib/offline-maps';
import OfflineMapManager from '@/components/offline-map-manager';
const NavigationPanel = dynamic(() => import('@/components/navigation-panel'), { ssr: false, loading: () => <div className="maps-loading">Preparando navegación…</div> });
const RegionMap = dynamic(() => import('@/components/region-map'), { ssr: false, loading: () => <div className="maps-loading">Preparando mapa…</div> });
export default function MapsPage() {
  const [tab, setTab] = useState<'download' | 'navigate'>('download');
  const [region, setRegion] = useState<MapRegion>(MAP_REGIONS[0]);
  return <main className="maps-page">
    <header className="maps-page__header"><a href="/" className="maps-brand" aria-label="AutoRAM Colombia, volver al inicio"><Image unoptimized src="/brand/autoram-ar-signal.svg" alt="" width={46} height={46}/><span>AUTORAM<small>COLOMBIA</small></span></a><a href="/" className="maps-back"><ArrowLeft size={17}/>Volver a la app</a></header>
    <section className="maps-page__intro"><span className="maps-eyebrow"><WifiOff size={15}/>EL CAMINO SIGUE</span><h1>Tu mapa.<br/><em>También sin señal.</em></h1><p>Descarga la zona, prepara tu ruta y sal a recorrerla. Calles claras, giros y tu ubicación en un solo lugar.</p></section>
    <nav className="maps-tabs" aria-label="Opciones del mapa"><button type="button" aria-pressed={tab === 'download'} onClick={() => setTab('download')}><Download size={18}/>Descargar mapas</button><button type="button" aria-pressed={tab === 'navigate'} onClick={() => setTab('navigate')}><Navigation size={18}/>Preparar ruta</button></nav>
    {tab === 'download' ? <div className="maps-page__grid"><OfflineMapManager onSelect={setRegion}/><section className="maps-preview" aria-label="Vista de la zona"><div className="maps-preview__heading"><span>EXPLORA LA COBERTURA</span><label className="sr-only" htmlFor="preview-region">Zona del mapa</label><select id="preview-region" value={region.id} onChange={event => setRegion(MAP_REGIONS.find(item => item.id === event.target.value)!)}>{MAP_REGIONS.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div><RegionMap key={region.id} region={region}/><p>La descarga cubre el área del marco. Acércate para ver calles y nombres.</p></section></div> : <NavigationPanel standalone showDownloads/>}
    <footer className="maps-page__footer">GPS durante el uso de AutoRAM · Ruta nueva con internet · Datos © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> / Protomaps</footer>
  </main>;
}
