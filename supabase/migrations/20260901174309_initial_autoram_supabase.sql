-- Autoram: perfiles, parque automotor, costos operativos y almacenamiento de fotos.

create table public.driver_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 3 and 100), document text not null check (char_length(document) between 5 and 15),
  phone text not null check (char_length(phone) between 7 and 20), email text, city text not null, address text,
  license text not null, category text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.vehicles (
  id bigint generated always as identity primary key, user_id uuid not null references auth.users(id) on delete cascade,
  type text not null, brand text not null, model text not null, version text, year smallint not null check (year between 1900 and 2100),
  plate text not null, color text, fuel text not null, transmission text not null, odometer integer not null check (odometer >= 0),
  tires text not null, brakes text not null, fluids text not null, battery text not null, general text not null,
  vin text check (vin is null or char_length(vin) <= 17), image_url text, image_attribution text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint vehicles_owner_pair unique (id, user_id), constraint vehicles_owner_plate unique (user_id, plate)
);

create table public.vehicle_selections (
  user_id uuid primary key references auth.users(id) on delete cascade, vehicle_id bigint not null, updated_at timestamptz not null default now(),
  constraint vehicle_selections_owner_fk foreign key (vehicle_id, user_id) references public.vehicles(id, user_id) on delete cascade
);

create table public.fuel_entries (
  id bigint generated always as identity primary key, user_id uuid not null references auth.users(id) on delete cascade, vehicle_id bigint not null,
  occurred_at timestamptz not null, odometer integer not null check (odometer >= 0), station text not null, fuel_type text not null,
  gallons numeric(10,3) not null check (gallons > 0), price_per_gallon bigint not null check (price_per_gallon > 0), total bigint not null check (total > 0),
  payment text, fill_type text, notes text, created_at timestamptz not null default now(),
  constraint fuel_entries_owner_fk foreign key (vehicle_id, user_id) references public.vehicles(id, user_id) on delete cascade
);

create table public.maintenance_entries (
  id bigint generated always as identity primary key, user_id uuid not null references auth.users(id) on delete cascade, vehicle_id bigint not null,
  occurred_at timestamptz not null, odometer integer not null check (odometer >= 0), movement_type text not null, category text not null,
  issue text not null, work_done text not null, shop text not null, phone text, labor_cost bigint not null default 0 check (labor_cost >= 0),
  parts_cost bigint not null default 0 check (parts_cost >= 0), total bigint not null default 0 check (total >= 0), warranty text,
  next_km integer check (next_km is null or next_km >= 0), notes text, created_at timestamptz not null default now(),
  constraint maintenance_entries_owner_fk foreign key (vehicle_id, user_id) references public.vehicles(id, user_id) on delete cascade
);

create table public.work_sessions (
  id bigint generated always as identity primary key, user_id uuid not null references auth.users(id) on delete cascade, vehicle_id bigint not null,
  role text not null check (role in ('independiente', 'plataforma')), platforms jsonb not null default '[]'::jsonb, activity text,
  started_at timestamptz not null default now(), ended_at timestamptz, start_odometer integer not null check (start_odometer >= 0),
  end_odometer integer check (end_odometer is null or end_odometer >= start_odometer), income bigint not null default 0 check (income >= 0),
  expenses bigint not null default 0 check (expenses >= 0), created_at timestamptz not null default now(),
  constraint work_sessions_owner_fk foreign key (vehicle_id, user_id) references public.vehicles(id, user_id) on delete cascade
);

create table public.trips (
  id bigint generated always as identity primary key, user_id uuid not null references auth.users(id) on delete cascade, vehicle_id bigint not null,
  started_at timestamptz not null, ended_at timestamptz not null, duration_seconds integer not null check (duration_seconds >= 0),
  distance_km numeric(10,3) not null check (distance_km >= 0), start_lat double precision, start_lng double precision,
  end_lat double precision, end_lng double precision, created_at timestamptz not null default now(),
  constraint trips_time_check check (ended_at >= started_at),
  constraint trips_owner_fk foreign key (vehicle_id, user_id) references public.vehicles(id, user_id) on delete cascade
);

create table public.service_quotes (
  id bigint generated always as identity primary key, user_id uuid not null references auth.users(id) on delete cascade, vehicle_id bigint not null,
  service_name text not null, start_odometer numeric(12,2) not null check (start_odometer >= 0), end_odometer numeric(12,2) not null check (end_odometer >= 0),
  service_km numeric(12,2) not null check (service_km > 0), extra_km numeric(12,2) not null default 0 check (extra_km >= 0),
  total_km numeric(12,2) not null check (total_km > 0), fuel_price bigint not null default 0, efficiency_kpg numeric(10,2) not null check (efficiency_kpg > 0),
  fuel_cost bigint not null default 0, wear_per_km bigint not null default 0, wear_cost bigint not null default 0, tolls bigint not null default 0,
  other_costs bigint not null default 0, hours numeric(10,2) not null default 0, hourly_rate bigint not null default 0, time_cost bigint not null default 0,
  commission_pct numeric(5,2) not null default 0 check (commission_pct between 0 and 80), margin_pct numeric(5,2) not null default 0 check (margin_pct between 0 and 80),
  operating_cost bigint not null default 0, recommended_price bigint not null default 0, price_per_km bigint not null default 0,
  created_at timestamptz not null default now(),
  constraint service_quotes_owner_fk foreign key (vehicle_id, user_id) references public.vehicles(id, user_id) on delete cascade
);

create index vehicles_user_created_idx on public.vehicles (user_id, created_at desc);
create index fuel_entries_vehicle_occurred_idx on public.fuel_entries (vehicle_id, occurred_at desc);
create index maintenance_entries_vehicle_occurred_idx on public.maintenance_entries (vehicle_id, occurred_at desc);
create index work_sessions_vehicle_started_idx on public.work_sessions (vehicle_id, started_at desc);
create index trips_vehicle_started_idx on public.trips (vehicle_id, started_at desc);
create index service_quotes_vehicle_created_idx on public.service_quotes (vehicle_id, created_at desc);
create unique index work_sessions_one_active_per_user_idx on public.work_sessions (user_id) where ended_at is null;

alter table public.driver_profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_selections enable row level security;
alter table public.fuel_entries enable row level security;
alter table public.maintenance_entries enable row level security;
alter table public.work_sessions enable row level security;
alter table public.trips enable row level security;
alter table public.service_quotes enable row level security;

create policy driver_profiles_owner on public.driver_profiles for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy vehicles_owner on public.vehicles for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy vehicle_selections_owner on public.vehicle_selections for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy fuel_entries_owner on public.fuel_entries for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy maintenance_entries_owner on public.maintenance_entries for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy work_sessions_owner on public.work_sessions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy trips_owner on public.trips for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy service_quotes_owner on public.service_quotes for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vehicle-images', 'vehicle-images', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy vehicle_images_insert on storage.objects for insert to authenticated
with check (bucket_id = 'vehicle-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy vehicle_images_select on storage.objects for select to authenticated
using (bucket_id = 'vehicle-images' and owner_id = (select auth.uid()));
create policy vehicle_images_update on storage.objects for update to authenticated
using (bucket_id = 'vehicle-images' and owner_id = (select auth.uid())) with check (bucket_id = 'vehicle-images' and owner_id = (select auth.uid()));
create policy vehicle_images_delete on storage.objects for delete to authenticated
using (bucket_id = 'vehicle-images' and owner_id = (select auth.uid()));
