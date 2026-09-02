// AUTORAM · búsqueda de direcciones
//
// Reemplaza la llamada directa a nominatim.openstreetmap.org.
// Problemas de la versión actual:
//   · Nominatim público limita a 1 petición/segundo y bloquea IPs que abusan.
//   · Cada tecla del usuario dispara una consulta.
//   · No hay caché: la misma dirección se busca cien veces.
//
// Esta versión:
//   · Espera 450 ms tras la última tecla (debounce).
//   · Nunca envía más de una petición por segundo (throttle).
//   · Cachea resultados en memoria y localStorage (7 días).
//   · Usa Photon (komoot) como principal y Nominatim como respaldo.
//   · Prioriza resultados cerca del usuario y dentro de Colombia.
//
// Para producción con muchos usuarios, cambia PROVIDER a 'maptiler' y agrega
// tu llave: el plan gratuito da 100 000 búsquedas/mes y no bloquea.

export type GeoResult = {
  label: string;
  lat: number;
  lng: number;
  city?: string;
  provider: 'photon' | 'nominatim' | 'maptiler';
};

type Bias = { lat: number; lng: number } | null;
type PhotonProperties = {
  name?: string; street?: string; district?: string; city?: string;
  town?: string; village?: string; state?: string;
};
type PhotonFeature = { properties?: PhotonProperties; geometry: { coordinates: [number, number] } };
type PhotonResponse = { features?: PhotonFeature[] };
type NominatimResult = {
  display_name: string; lat: string; lon: string;
  address?: { city?: string; town?: string; village?: string };
};
type MapTilerFeature = { place_name_es?: string; place_name: string; center: [number, number] };
type MapTilerResponse = { features?: MapTilerFeature[] };

const PROVIDER: 'photon' | 'maptiler' = 'photon';
const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? '';
const CONTACT_EMAIL = process.env.NEXT_PUBLIC_GEOCODER_EMAIL ?? ''; // Nominatim pide identificarse
const CACHE_KEY = 'autoram.geo.cache.v1';
const CACHE_TTL = 7 * 24 * 3600 * 1000;
const MIN_GAP_MS = 1100;

const memCache = new Map<string, { at: number; results: GeoResult[] }>();
let lastRequestAt = 0;
let debounceTimer: number | null = null;
let inflight: AbortController | null = null;

function loadCache() {
  if (memCache.size || typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const now = Date.now();
    for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, { at: number; results: GeoResult[] }>)) {
      if (now - v.at < CACHE_TTL) memCache.set(k, v);
    }
  } catch { /* caché corrupta: se ignora */ }
}

function persistCache() {
  if (typeof localStorage === 'undefined') return;
  try {
    const entries = [...memCache.entries()].slice(-200); // no crecer sin límite
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch { /* cuota llena: no pasa nada */ }
}

const norm = (q: string) => q.trim().toLowerCase().replace(/\s+/g, ' ');

async function throttle() {
  const wait = lastRequestAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

async function photon(q: string, bias: Bias, signal: AbortSignal): Promise<GeoResult[]> {
  const p = new URLSearchParams({ q, limit: '8' });
  if (bias) { p.set('lat', String(bias.lat)); p.set('lon', String(bias.lng)); }
  // Colombia aprox.: lon -79.1..-66.8, lat -4.3..13.4
  p.set('bbox', '-79.1,-4.3,-66.8,13.4');
  const r = await fetch(`https://photon.komoot.io/api/?${p}`, { signal });
  if (!r.ok) throw new Error(`photon ${r.status}`);
  const j = await r.json() as PhotonResponse;
  return (j.features ?? []).map((f): GeoResult => {
    const pr = f.properties ?? {};
    const parts = [pr.name, pr.street, pr.district, pr.city ?? pr.town ?? pr.village, pr.state].filter(Boolean);
    return {
      label: [...new Set(parts)].join(', '),
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      city: pr.city ?? pr.town ?? pr.village,
      provider: 'photon',
    };
  });
}

async function nominatim(q: string, bias: Bias, signal: AbortSignal): Promise<GeoResult[]> {
  const p = new URLSearchParams({
    q, format: 'jsonv2', limit: '8', countrycodes: 'co', 'accept-language': 'es', addressdetails: '1',
  });
  if (bias) {
    p.set('viewbox', `${bias.lng - 1.5},${bias.lat + 1.2},${bias.lng + 1.5},${bias.lat - 1.2}`);
    p.set('bounded', '0');
  }
  if (CONTACT_EMAIL) p.set('email', CONTACT_EMAIL);
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${p}`, {
    signal, headers: { Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`nominatim ${r.status}`);
  const j = await r.json() as NominatimResult[];
  return j.map((x): GeoResult => ({
    label: x.display_name,
    lat: Number(x.lat),
    lng: Number(x.lon),
    city: x.address?.city ?? x.address?.town ?? x.address?.village,
    provider: 'nominatim',
  }));
}

async function maptiler(q: string, bias: Bias, signal: AbortSignal): Promise<GeoResult[]> {
  const p = new URLSearchParams({ key: MAPTILER_KEY, limit: '8', country: 'co', language: 'es' });
  if (bias) p.set('proximity', `${bias.lng},${bias.lat}`);
  const r = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json?${p}`, { signal });
  if (!r.ok) throw new Error(`maptiler ${r.status}`);
  const j = await r.json() as MapTilerResponse;
  return (j.features ?? []).map((f): GeoResult => ({
    label: f.place_name_es ?? f.place_name,
    lat: f.center[1],
    lng: f.center[0],
    provider: 'maptiler',
  }));
}

/**
 * Busca una dirección. Llama con cada tecla: internamente espera a que el
 * usuario deje de escribir y cancela búsquedas viejas.
 */
export function searchAddress(query: string, bias: Bias = null): Promise<GeoResult[]> {
  loadCache();
  const key = norm(query);
  if (key.length < 3) return Promise.resolve([]);

  const hit = memCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return Promise.resolve(hit.results);

  return new Promise((resolve, reject) => {
    if (debounceTimer) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(async () => {
      inflight?.abort();
      inflight = new AbortController();
      const { signal } = inflight;
      try {
        await throttle();
        let results: GeoResult[] = [];
        if (PROVIDER === 'maptiler' && MAPTILER_KEY) {
          results = await maptiler(key, bias, signal);
        } else {
          try {
            results = await photon(key, bias, signal);
          } catch (e) {
            if (signal.aborted) throw e;
            await throttle();
            results = await nominatim(key, bias, signal);
          }
        }
        if (!results.length) throw new Error('No encontramos ese lugar. Agrega barrio y ciudad.');
        memCache.set(key, { at: Date.now(), results });
        persistCache();
        resolve(results);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return; // reemplazada por una búsqueda más nueva
        reject(e instanceof Error ? e : new Error('No pudimos consultar esa dirección.'));
      }
    }, 450);
  });
}

/** Dirección aproximada de una coordenada (para etiquetar inicio/fin del viaje). */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  loadCache();
  const key = `rev:${lat.toFixed(4)},${lng.toFixed(4)}`;
  const hit = memCache.get(key);
  if (hit) return hit.results[0]?.label ?? null;
  try {
    await throttle();
    const r = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`);
    const j = await r.json() as PhotonResponse;
    const pr = j.features?.[0]?.properties;
    if (!pr) return null;
    const label = [pr.name ?? pr.street, pr.district, pr.city ?? pr.town].filter(Boolean).join(', ');
    memCache.set(key, { at: Date.now(), results: [{ label, lat, lng, provider: 'photon' }] });
    persistCache();
    return label;
  } catch {
    return null;
  }
}
