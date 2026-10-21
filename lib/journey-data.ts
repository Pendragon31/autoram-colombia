import type { SupabaseClient } from '@supabase/supabase-js';
import { journeyBounds, type JourneyPeriod, type JourneyRecords } from '@/lib/journey-summary';

/** Read only the active vehicle and period. RLS remains enforced by the existing client. */
export async function fetchJourneyRecords(client: SupabaseClient, vehicleId: number, period: JourneyPeriod, now: Date, signal: AbortSignal): Promise<JourneyRecords> {
  if (!Number.isSafeInteger(vehicleId) || vehicleId <= 0) throw new Error('Selecciona un vehículo válido.');
  const { start, end } = journeyBounds(period, now);
  const first = new Date(start).toISOString(), last = new Date(end).toISOString();
  async function rows(table: string, columns: string, dateColumn: string) {
    const all: Record<string, unknown>[] = [];
    for (let from = 0; ; ) {
      if (signal.aborted) throw new Error('Consulta cancelada.');
      const { data, error, count } = await client.from(table).select(columns, { count: 'exact' }).eq('vehicle_id', vehicleId)
        .gte(dateColumn, first).lte(dateColumn, last).order('id', { ascending: true }).range(from, from + 499).abortSignal(signal);
      if (error || !data) throw new Error('No pudimos actualizar el balance.');
      all.push(...(data as unknown as Record<string, unknown>[]));
      if (!data.length || (typeof count === 'number' && all.length >= count)) return all;
      from += data.length;
    }
  }
  const [sessions, fuel, maintenance, trips] = await Promise.all([
    rows('work_sessions', 'id,ended_at,income,expenses', 'ended_at'),
    rows('fuel_entries', 'id,occurred_at,total', 'occurred_at'),
    rows('maintenance_entries', 'id,occurred_at,total', 'occurred_at'),
    rows('trips', 'id,ended_at,distance_km', 'ended_at'),
  ]);
  return {
    sessions: sessions.map(item => ({ id: Number(item.id), endedAt: String(item.ended_at), income: Number(item.income), expenses: Number(item.expenses) })),
    fuelRecords: fuel.map(item => ({ id: Number(item.id), occurredAt: String(item.occurred_at), total: Number(item.total) })),
    maintenanceRecords: maintenance.map(item => ({ id: Number(item.id), occurredAt: String(item.occurred_at), total: Number(item.total) })),
    trips: trips.map(item => ({ id: Number(item.id), endedAt: String(item.ended_at), distanceKm: Number(item.distance_km) })),
  };
}
