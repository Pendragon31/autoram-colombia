// AUTORAM · useVehicleRealtime
//
// La librería de realtime ya está en el bundle; solo faltaba usarla.
// Se suscribe a los cambios del vehículo activo y llama onChange para que
// el panel recargue (o para que actualices el estado local sin recargar).
//
// Requiere: 002_trips_route.sql (agrega las tablas a supabase_realtime).
//
// Uso:
//   useVehicleRealtime(supabase, vehicleId, (table, payload) => refetch());

'use client';

import { useEffect, useRef } from 'react';
import type { RealtimePostgresChangesPayload, SupabaseClient } from '@supabase/supabase-js';

export type WatchedTable = 'trips' | 'fuel_entries' | 'maintenance_entries' | 'work_sessions';

const TABLES: WatchedTable[] = ['trips', 'fuel_entries', 'maintenance_entries', 'work_sessions'];

export function useVehicleRealtime(
  client: SupabaseClient | null,
  vehicleId: number | null,
  onChange: (table: WatchedTable, payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void,
  tables: WatchedTable[] = TABLES,
) {
  // Guardamos el callback en un ref para no re-suscribir en cada render.
  const cb = useRef(onChange);
  useEffect(() => { cb.current = onChange; }, [onChange]);

  useEffect(() => {
    if (!client || !vehicleId) return;

    // Agrupamos eventos que llegan juntos (p. ej. insert + update en 100 ms)
    let pending: Array<[WatchedTable, RealtimePostgresChangesPayload<Record<string, unknown>>]> = [];
    let timer: number | null = null;
    const flush = () => {
      timer = null;
      const batch = pending; pending = [];
      batch.forEach(([t, p]) => cb.current(t, p));
    };

    let channel = client.channel(`vehicle:${vehicleId}`);
    for (const table of tables) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `vehicle_id=eq.${vehicleId}` },
        (payload) => {
          pending.push([table, payload as RealtimePostgresChangesPayload<Record<string, unknown>>]);
          if (timer == null) timer = window.setTimeout(flush, 150);
        },
      );
    }
    channel.subscribe();

    return () => {
      if (timer != null) window.clearTimeout(timer);
      void client.removeChannel(channel);
    };
  }, [client, vehicleId, tables.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
}
