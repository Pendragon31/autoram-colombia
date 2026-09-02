-- Autoram v1.8 · vehicle_documents (la app ya la usa pero no estaba en las migraciones) + RLS forzado.
-- Idempotente: se puede ejecutar aunque la tabla ya exista en Supabase.

create table if not exists public.vehicle_documents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  vehicle_id bigint not null,
  document_type text not null,
  document_number text,
  issued_at date,
  expires_at date,
  provider text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_documents_owner_fk foreign key (vehicle_id, user_id) references public.vehicles(id, user_id) on delete cascade
);
create index if not exists vehicle_documents_vehicle_expires_idx on public.vehicle_documents (vehicle_id, expires_at);

alter table public.vehicle_documents enable row level security;
drop policy if exists vehicle_documents_owner on public.vehicle_documents;
create policy vehicle_documents_owner on public.vehicle_documents for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.vehicle_documents from anon;
grant select, insert, update, delete on public.vehicle_documents to authenticated;

-- FORCE: ni siquiera el dueño de la tabla salta las políticas.
do $$
declare t text;
begin
  foreach t in array array['driver_profiles','vehicles','vehicle_selections','fuel_entries','maintenance_entries','work_sessions','trips','service_quotes','vehicle_documents'] loop
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;
