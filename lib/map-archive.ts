import { FetchSource, PMTiles } from 'pmtiles';
import { readStoredRange, type MapRegion } from '@/lib/offline-maps';
const archives = new Map<string, PMTiles>();
export function mapArchive(region: MapRegion): PMTiles {
  const url = new URL(region.path, window.location.origin).href;
  if (!archives.has(url)) {
    const remote = new FetchSource(url);
    archives.set(url, new PMTiles({
      getKey: () => url,
      getBytes: async (offset, length, signal, etag) => {
        const stored = await readStoredRange(region.id, offset, length, signal);
        if (stored) return { data: stored };
        if (!navigator.onLine) throw new Error(`Descarga ${region.name} antes de salir sin señal.`);
        return remote.getBytes(offset, length, signal, etag);
      },
    }));
  }
  return archives.get(url)!;
}
