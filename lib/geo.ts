// AUTORAM · utilidades geográficas puras (sin dependencias)

export type LatLng = { lat: number; lng: number };
/** Punto de recorrido: [lat, lng, epoch_ms] — compacto para guardar como jsonb */
export type TrackPoint = [number, number, number];

const R_KM = 6371.0088;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Distancia en kilómetros entre dos coordenadas. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(s));
}

/** Velocidad km/h entre dos puntos con marca de tiempo. */
export function speedKmh(a: TrackPoint, b: TrackPoint): number {
  const hours = (b[2] - a[2]) / 3_600_000;
  if (hours <= 0) return 0;
  return haversineKm({ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] }) / hours;
}

/** Longitud total de una ruta en km. */
export function routeLengthKm(points: TrackPoint[]): number {
  let km = 0;
  for (let i = 1; i < points.length; i++) {
    km += haversineKm({ lat: points[i - 1][0], lng: points[i - 1][1] }, { lat: points[i][0], lng: points[i][1] });
  }
  return km;
}

// Distancia perpendicular de un punto a un segmento, en metros aproximados.
function perpendicularDistanceM(p: TrackPoint, a: TrackPoint, b: TrackPoint): number {
  const kx = 111_320 * Math.cos(toRad(a[0]));
  const ky = 110_540;
  const ax = 0, ay = 0;
  const bx = (b[1] - a[1]) * kx, by = (b[0] - a[0]) * ky;
  const px = (p[1] - a[1]) * kx, py = (p[0] - a[0]) * ky;
  const len2 = bx * bx + by * by;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * bx + (py - ay) * by) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * bx), py - (ay + t * by));
}

/**
 * Douglas-Peucker: reduce puntos manteniendo la forma de la ruta.
 * toleranceM ≈ 8-12 m es invisible en un mapa y recorta 70-90 % del peso.
 */
export function simplifyRoute(points: TrackPoint[], toleranceM = 10): TrackPoint[] {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];

  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpendicularDistanceM(points[i], points[s], points[e]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > toleranceM && idx !== -1) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

/** Caja envolvente [[minLng, minLat], [maxLng, maxLat]] para encuadrar el mapa. */
export function routeBounds(points: TrackPoint[]): [[number, number], [number, number]] | null {
  if (!points.length) return null;
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  for (const [lat, lng] of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return [[minLng, minLat], [maxLng, maxLat]];
}
