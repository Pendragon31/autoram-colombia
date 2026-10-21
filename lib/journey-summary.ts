export type JourneyPeriod = 'today' | 'week' | 'month';
export const JOURNEY_PERIODS: { id: JourneyPeriod; label: string }[] = [
  { id: 'today', label: 'Hoy' }, { id: 'week', label: '7 días' }, { id: 'month', label: '31 días' },
];
type Session = { id?: number; endedAt: string | null; income: number; expenses: number };
type Expense = { id?: number; occurredAt: string; total: number };
type Trip = { id?: number; endedAt: string; distanceKm: number };
export type JourneyRecords = { sessions: Session[]; fuelRecords: Expense[]; maintenanceRecords: Expense[]; trips: Trip[] };

/** The local account includes pending writes; prefer authoritative server rows for confirmed IDs. */
export function mergeJourneyRecords(remote: JourneyRecords, local: JourneyRecords): JourneyRecords {
  function merge<T extends { id?: number }>(saved: T[], recent: T[]) {
    const values = new Map(saved.map((item, i) => [item.id === undefined ? `remote-${i}` : String(item.id), item]));
    recent.forEach((item, i) => { const key = item.id === undefined ? `local-${i}` : String(item.id); if (!values.has(key)) values.set(key, item); });
    return [...values.values()];
  }
  return { sessions: merge(remote.sessions, local.sessions), fuelRecords: merge(remote.fuelRecords, local.fuelRecords),
    maintenanceRecords: merge(remote.maintenanceRecords, local.maintenanceRecords), trips: merge(remote.trips, local.trips) };
}

/** Financial periods use Colombian calendar days, including trips closed after midnight. */
export function journeyBounds(period: JourneyPeriod, now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(now);
  const part = (name: string) => Number(parts.find(item => item.type === name)!.value);
  const previousDays = period === 'today' ? 0 : period === 'week' ? 6 : 30;
  return { start: Date.UTC(part('year'), part('month') - 1, part('day') - previousDays, 5), end: now.getTime() };
}
const amount = (value: number) => Number.isFinite(Number(value)) ? Number(value) : 0;
export function summarizeJourney(records: JourneyRecords, period: JourneyPeriod, now = new Date()) {
  const { start, end } = journeyBounds(period, now);
  const inside = (value: string) => { const time = new Date(value).getTime(); return time >= start && time <= end; };
  const closed = records.sessions.filter(item => item.endedAt && inside(item.endedAt));
  const fuel = records.fuelRecords.filter(item => inside(item.occurredAt));
  const maintenance = records.maintenanceRecords.filter(item => inside(item.occurredAt));
  const trips = records.trips.filter(item => inside(item.endedAt));
  const income = closed.reduce((sum, item) => sum + amount(item.income), 0);
  const fuelCost = fuel.reduce((sum, item) => sum + amount(item.total), 0);
  const maintenanceCost = maintenance.reduce((sum, item) => sum + amount(item.total), 0);
  const otherCost = closed.reduce((sum, item) => sum + amount(item.expenses), 0);
  const expenses = fuelCost + maintenanceCost + otherCost;
  return { income, expenses, net: income - expenses, fuelCost, maintenanceCost, otherCost,
    distance: trips.reduce((sum, item) => sum + Math.max(0, amount(item.distanceKm)), 0),
    closedCount: closed.length, fuelCount: fuel.length, maintenanceCount: maintenance.length,
    hasRecords: !!(closed.length || fuel.length || maintenance.length || trips.length) };
}
