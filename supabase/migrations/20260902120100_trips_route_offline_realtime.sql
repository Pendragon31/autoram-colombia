-- Autoram v1.8 · ruta completa del recorrido, claves de sincronización offline y realtime.

-- 1) La ruta completa del viaje. Hoy solo se guarda inicio/fin.
--    route_points: [[lat, lng, epoch_ms], ...] simplificada en el cliente.
alter table public.trips
  add column if not exists route_points   jsonb,
  add column if not exists point_count    integer,
  add column if not exists max_speed_kmh  numeric(6,1),
  add column if not exists avg_speed_kmh  numeric(6,1),
  add column if not exists source         text default 'gps';

-- 2) client_id: la app genera un UUID antes de guardar. Si el registro se
--    reintenta desde la cola offline, la restricción UNIQUE evita duplicados.
alter table public.trips               add column if not exists client_id uuid;
alter table public.fuel_entries        add column if not exists client_id uuid;
alter table public.maintenance_entries add column if not exists client_id uuid;
alter table public.work_sessions       add column if not exists client_id uuid;
alter table public.service_quotes      add column if not exists client_id uuid;
alter table public.vehicle_documents   add column if not exists client_id uuid;

create unique index if not exists trips_client_id_uidx               on public.trips (client_id)               where client_id is not null;
create unique index if not exists fuel_entries_client_id_uidx        on public.fuel_entries (client_id)        where client_id is not null;
create unique index if not exists maintenance_entries_client_id_uidx on public.maintenance_entries (client_id) where client_id is not null;
create unique index if not exists work_sessions_client_id_uidx       on public.work_sessions (client_id)       where client_id is not null;
create unique index if not exists service_quotes_client_id_uidx      on public.service_quotes (client_id)      where client_id is not null;
create unique index if not exists vehicle_documents_client_id_uidx   on public.vehicle_documents (client_id)   where client_id is not null;

-- 3) Índices para las consultas reales de la app (eq vehicle_id + order fecha desc)
create index if not exists trips_vehicle_started_idx        on public.trips (vehicle_id, started_at desc);
create index if not exists fuel_vehicle_occurred_idx        on public.fuel_entries (vehicle_id, occurred_at desc);
create index if not exists maintenance_vehicle_occurred_idx on public.maintenance_entries (vehicle_id, occurred_at desc);
create index if not exists sessions_vehicle_started_idx     on public.work_sessions (vehicle_id, started_at desc);
create index if not exists quotes_vehicle_created_idx       on public.service_quotes (vehicle_id, created_at desc);
create index if not exists documents_vehicle_expires_idx    on public.vehicle_documents (vehicle_id, expires_at);

-- 4) Realtime: publicar cambios de estas tablas para que el panel se actualice solo.
--    (Supabase → Database → Replication también lo permite por UI.)
do $$
begin
  execute 'alter publication supabase_realtime add table public.trips';
exception when duplicate_object then null; end $$;
do $$
begin
  execute 'alter publication supabase_realtime add table public.fuel_entries';
exception when duplicate_object then null; end $$;
do $$
begin
  execute 'alter publication supabase_realtime add table public.maintenance_entries';
exception when duplicate_object then null; end $$;
do $$
begin
  execute 'alter publication supabase_realtime add table public.work_sessions';
exception when duplicate_object then null; end $$;
