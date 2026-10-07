import { FileSource, PMTiles, TileType } from 'pmtiles';
import regionDefinitions from '@/data/map-regions.json';

export type MapRegion = { id: string; name: string; description: string; bounds: number[]; center: number[]; maxZoom: number; path: string; bytes?: number; sha256?: string };
export type SavedMap = { id: string; name: string; bytes: number; savedAt: number; sha256: string; blob: Blob };
export const MAP_REGIONS: MapRegion[] = regionDefinitions.map(region => ({ ...region, path: `/maps/${region.id}.pmtiles` }));
const DB_NAME = 'autoram-offline-maps-v1';
const FONT_CACHE = 'autoram-map-fonts-v1';
export const FONT_PATHS = ['0-255', '256-511'].map(range => `/maps/fonts/Noto%20Sans%20Regular/${range}.pbf`);
const blobs = new Map<string, Promise<Blob | null>>();

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('Este navegador no permite guardar mapas. Usa Chrome o instala AutoRAM.'));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('regions', { keyPath: 'id' }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir el almacenamiento de mapas.'));
    request.onblocked = () => reject(new Error('Cierra las otras pestañas de AutoRAM y vuelve a intentar.'));
  });
}
async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('regions', mode);
    const request = action(tx.objectStore('regions'));
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error ?? new Error('No se pudo guardar el mapa. Revisa el espacio disponible.')); };
  });
}
export async function listSavedMaps(): Promise<Omit<SavedMap, 'blob'>[]> {
  const records = await transaction<SavedMap[]>('readonly', store => store.getAll());
  return records.map(record => ({ id: record.id, name: record.name, bytes: record.bytes, savedAt: record.savedAt, sha256: record.sha256 }));
}
export function getSavedMapBlob(id: string): Promise<Blob | null> {
  if (!blobs.has(id)) blobs.set(id, transaction<SavedMap | undefined>('readonly', store => store.get(id)).then(record => record?.blob ?? null).catch(() => null));
  return blobs.get(id)!;
}
export async function deleteSavedMap(id: string) {
  await transaction('readwrite', store => store.delete(id));
  blobs.delete(id);
  window.dispatchEvent(new Event('autoram-maps-changed'));
}
export function regionContains(region: MapRegion, lng: number, lat: number) {
  const [west, south, east, north] = region.bounds;
  return lng >= west && lng <= east && lat >= south && lat <= north;
}
export function regionAt(lng: number, lat: number) { return MAP_REGIONS.find(region => regionContains(region, lng, lat)); }

export async function loadMapCatalog(): Promise<MapRegion[]> {
  const response = await fetch('/maps/catalog.json');
  if (!response.ok) throw new Error('No se pudo cargar la lista de mapas. Conéctate e intenta otra vez.');
  const data = await response.json() as { regions?: MapRegion[] };
  if (!Array.isArray(data.regions)) throw new Error('La lista de mapas no está disponible.');
  return MAP_REGIONS.map(region => {
    const item = data.regions!.find(entry => entry.id === region.id);
    if (!item || !Number.isSafeInteger(item.bytes) || item.bytes! < 127 || !/^[a-f0-9]{64}$/.test(item.sha256 ?? '')) throw new Error('La lista de mapas está incompleta.');
    return { ...region, bytes: item.bytes, sha256: item.sha256 };
  });
}

export async function downloadMap(region: MapRegion, signal: AbortSignal, onProgress: (received: number, total: number) => void): Promise<void> {
  if (!region.bytes || !region.sha256) throw new Error('Carga la lista de mapas antes de descargar.');
  const estimate = await navigator.storage?.estimate?.();
  if (estimate?.quota && estimate.quota - (estimate.usage ?? 0) < region.bytes * 1.25) throw new Error('Falta espacio en el teléfono. Elimina otro mapa o libera almacenamiento.');
  // Font ranges are small and cached separately from private account data.
  const fontCache = await caches.open(FONT_CACHE);
  for (const url of FONT_PATHS) {
    if (!await fontCache.match(url)) {
      const response = await fetch(url, { signal });
      if (!response.ok || (response.headers.get('content-type') ?? '').includes('html')) throw new Error('No se pudieron descargar los nombres de calles.');
      await fontCache.put(url, response);
    }
  }
  const response = await fetch(region.path, { signal, cache: 'no-store' });
  if (!response.ok || !response.body) throw new Error('La descarga no está disponible. Intenta de nuevo con internet.');
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let received = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      received += value.byteLength;
      if (received > region.bytes) throw new Error('El mapa cambió durante la descarga. Actualiza la página e intenta de nuevo.');
      chunks.push(new Uint8Array(value));
      onProgress(received, region.bytes);
    }
  } finally { reader.releaseLock(); }
  if (received !== region.bytes) throw new Error('La descarga quedó incompleta. Tu mapa anterior sigue disponible.');
  const blob = new Blob(chunks, { type: 'application/octet-stream' });
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), byte => byte.toString(16).padStart(2, '0')).join('');
  if (digest !== region.sha256) throw new Error('No pudimos verificar el mapa. Intenta descargarlo de nuevo.');
  const archive = new PMTiles(new FileSource(new File([blob], region.id)));
  const header = await archive.getHeader();
  if (header.tileType !== TileType.Mvt || header.maxZoom < 14) throw new Error('El archivo no contiene un mapa de calles válido.');
  signal.throwIfAborted();
  await transaction('readwrite', store => store.put({ id: region.id, name: region.name, bytes: received, savedAt: Date.now(), sha256: digest, blob } satisfies SavedMap));
  blobs.delete(region.id);
  void navigator.storage?.persist?.().catch(() => false);
  window.dispatchEvent(new Event('autoram-maps-changed'));
}

// A stored archive supplies byte ranges directly, without any network request.
export async function readStoredRange(id: string, offset: number, length: number, signal?: AbortSignal): Promise<ArrayBuffer | null> {
  signal?.throwIfAborted();
  const blob = await getSavedMapBlob(id);
  if (!blob) return null;
  if (offset < 0 || length < 0 || offset >= blob.size) throw new Error('El mapa guardado está incompleto. Descárgalo de nuevo.');
  const data = await blob.slice(offset, offset + length).arrayBuffer();
  signal?.throwIfAborted();
  return data;
}
