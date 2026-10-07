import { haversineKm, type LatLng } from '@/lib/geo';

export type Maneuver = { instruction: string; location: [number, number]; alongM: number; type: string; modifier?: string };
export type PlannedRoute = { version: 1; destinationName: string; createdAt: number; distanceM: number; durationS: number; coordinates: [number, number][]; steps: Maneuver[] };
type OSRMStep = { name?: string; distance: number; maneuver: { type: string; modifier?: string; exit?: number; location: [number, number] }; geometry: { coordinates: [number, number][] } };

export function turnInstruction(step: OSRMStep): string {
  const { type, modifier, exit } = step.maneuver;
  const road = step.name ? ` por ${step.name}` : '';
  if (type === 'arrive') return 'Llegaste a tu destino';
  if (type === 'depart') return `Inicia el recorrido${road}`;
  if (type.includes('roundabout') || type === 'rotary') return `En la glorieta, toma ${exit ? `la salida ${exit}` : 'la salida indicada'}${road}`;
  if (modifier === 'uturn') return `Haz un retorno${road}`;
  const direction = modifier?.includes('left') ? 'la izquierda' : modifier?.includes('right') ? 'la derecha' : '';
  if (type === 'merge') return `Incorpórate${direction ? ` hacia ${direction}` : ''}${road}`;
  if (type === 'fork' || type === 'on ramp' || type === 'off ramp') return `Toma ${direction ? `hacia ${direction}` : 'la vía indicada'}${road}`;
  if (direction) return `${modifier?.startsWith('slight') ? 'Mantente hacia' : 'Gira a'} ${direction}${road}`;
  return `Continúa${road}`;
}
const validCoordinate = (point: unknown): point is [number, number] => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90;

export async function requestRoute(origin: LatLng, destination: LatLng, destinationName: string, signal: AbortSignal): Promise<PlannedRoute> {
  if (!validCoordinate([origin.lng, origin.lat]) || !validCoordinate([destination.lng, destination.lat])) throw new Error('Selecciona una salida y un destino válidos.');
  if (!navigator.onLine) throw new Error('Necesitas internet para calcular una ruta nueva. Puedes seguir una ruta que ya guardaste.');
  const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson&steps=true`, { signal });
  if (!response.ok) throw new Error('No se pudo calcular la ruta. Intenta de nuevo con internet.');
  const data = await response.json();
  const result = data.routes?.[0];
  const coordinates = result?.geometry?.coordinates;
  if (data.code !== 'Ok' || !Array.isArray(coordinates) || coordinates.length < 2 || coordinates.length > 100_000 || !coordinates.every(validCoordinate) || !Number.isFinite(result.distance) || result.distance <= 0 || !Number.isFinite(result.duration) || result.duration < 0) throw new Error('No encontramos una ruta por carretera entre esos puntos.');
  const rawSteps = result.legs?.flatMap((leg: { steps?: OSRMStep[] }) => leg.steps ?? []) as OSRMStep[] | undefined;
  if (!rawSteps?.length || rawSteps.length > 10_000) throw new Error('La ruta no incluye indicaciones. Intenta otro destino.');
  const distances = cumulativeDistances(coordinates);
  let previous = 0;
  const steps: Maneuver[] = rawSteps.map(step => {
    if (!validCoordinate(step.maneuver?.location) || typeof step.maneuver.type !== 'string') throw new Error('Las indicaciones de la ruta están incompletas.');
    const projected = projectRoute(coordinates, distances, { lng: step.maneuver.location[0], lat: step.maneuver.location[1] }, previous);
    previous = Math.max(previous, projected.alongM);
    return { instruction: turnInstruction(step), location: step.maneuver.location, alongM: previous, type: step.maneuver.type, modifier: step.maneuver.modifier };
  });
  return { version: 1, destinationName: destinationName.slice(0, 200), createdAt: Date.now(), distanceM: result.distance, durationS: result.duration, coordinates, steps };
}

export function cumulativeDistances(coordinates: [number, number][]): number[] {
  const distances = [0];
  for (let i = 1; i < coordinates.length; i++) distances.push(distances[i - 1] + haversineKm({ lng: coordinates[i - 1][0], lat: coordinates[i - 1][1] }, { lng: coordinates[i][0], lat: coordinates[i][1] }) * 1000);
  return distances;
}

export function projectRoute(coordinates: [number, number][], distances: number[], point: LatLng, minimumM = 0, maximumM = Infinity): { alongM: number; awayM: number } {
  let best = { alongM: minimumM, awayM: Infinity };
  const kx = 111_320 * Math.cos(point.lat * Math.PI / 180), ky = 110_540;
  for (let i = 1; i < coordinates.length; i++) {
    if (distances[i] < minimumM - 30 || distances[i - 1] > maximumM) continue;
    const [aLng, aLat] = coordinates[i - 1], [bLng, bLat] = coordinates[i];
    const ax = (aLng - point.lng) * kx, ay = (aLat - point.lat) * ky;
    const dx = (bLng - aLng) * kx, dy = (bLat - aLat) * ky;
    const length2 = dx * dx + dy * dy;
    const t = length2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length2)) : 0;
    const alongM = distances[i - 1] + t * (distances[i] - distances[i - 1]);
    const awayM = Math.hypot(ax + t * dx, ay + t * dy);
    // On a crossing, prefer the first nearby segment rather than jumping a loop.
    if (awayM < best.awayM - 2 || Math.abs(awayM - best.awayM) <= 2 && alongM < best.alongM) best = { alongM, awayM };
  }
  return best;
}

export function guidanceAt(route: PlannedRoute, alongM: number) {
  const totalGeometryM = cumulativeDistances(route.coordinates).at(-1) ?? route.distanceM;
  const stepIndex = route.steps.findIndex(step => step.type !== 'depart' && step.alongM > alongM + 12);
  const next = route.steps[stepIndex < 0 ? route.steps.length - 1 : stepIndex];
  const remainingM = Math.max(0, totalGeometryM - alongM);
  return { next, stepIndex: stepIndex < 0 ? route.steps.length - 1 : stepIndex, nextInM: Math.max(0, next.alongM - alongM), remainingM, remainingS: totalGeometryM ? route.durationS * remainingM / totalGeometryM : 0, arrived: remainingM < 25 };
}
export function distanceLabel(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} km` : `${Math.max(0, Math.round(meters / 10) * 10)} m`;
}
const routeKey = (owner: string) => `autoram.navigation.v1.${owner}`;
export function savePlannedRoute(owner: string, route: PlannedRoute | null): boolean {
  try { if (route) localStorage.setItem(routeKey(owner), JSON.stringify(route)); else localStorage.removeItem(routeKey(owner)); return true; } catch { return false; }
}
export function loadPlannedRoute(owner: string): PlannedRoute | null {
  try {
    const route = JSON.parse(localStorage.getItem(routeKey(owner)) ?? 'null') as PlannedRoute | null;
    if (!route || route.version !== 1 || typeof route.destinationName !== 'string' || !Number.isFinite(route.createdAt) || !Number.isFinite(route.distanceM) || route.distanceM <= 0 || !Number.isFinite(route.durationS) || route.durationS < 0 || !Array.isArray(route.coordinates) || route.coordinates.length < 2 || route.coordinates.length > 100_000 || !route.coordinates.every(validCoordinate) || !Array.isArray(route.steps) || !route.steps.length || route.steps.length > 10_000) return null;
    let previous = -1;
    for (const step of route.steps) {
      if (typeof step.instruction !== 'string' || typeof step.type !== 'string' || !validCoordinate(step.location) || !Number.isFinite(step.alongM) || step.alongM < previous || step.alongM < 0) return null;
      previous = step.alongM;
    }
    return route;
  } catch { return null; }
}
