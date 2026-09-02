-- Autoram v1.8 · cálculos en la base de datos: rendimiento de combustible, rentabilidad por jornada y resumen del panel.

-- ---------------------------------------------------------------------------
-- Rendimiento de combustible por vehículo
-- km/galón real = (km recorridos entre tanqueadas) / (galones cargados después
-- de la primera tanqueada). La primera no cuenta porque no sabemos con cuánto
-- entró el tanque.
-- ---------------------------------------------------------------------------
create or replace view public.vehicle_fuel_stats
with (security_invoker = true) as
with ordered as (
  select
    vehicle_id, user_id, occurred_at, odometer, gallons, total,
    row_number() over (partition by vehicle_id order by occurred_at, odometer) as rn
  from public.fuel_entries
)
select
  vehicle_id,
  user_id,
  count(*)                                   as fills,
  sum(gallons)                               as gallons_total,
  sum(total)                                 as spent_total,
  round(avg(total / nullif(gallons, 0)), 0)  as avg_price_per_gallon,
  max(odometer) - min(odometer)              as km_tracked,
  round(
    (max(odometer) - min(odometer))::numeric
    / nullif(sum(gallons) filter (where rn > 1), 0), 1
  )                                          as km_per_gallon,
  round(
    sum(total) filter (where rn > 1)::numeric
    / nullif(max(odometer) - min(odometer), 0), 0
  )                                          as fuel_cost_per_km,
  max(occurred_at)                           as last_fill_at,
  max(odometer)                              as last_odometer
from ordered
group by vehicle_id, user_id;

-- ---------------------------------------------------------------------------
-- Rentabilidad por jornada de trabajo
-- ---------------------------------------------------------------------------
create or replace view public.work_session_profitability
with (security_invoker = true) as
select
  s.id,
  s.user_id,
  s.vehicle_id,
  s.role,
  s.platforms,
  s.activity,
  s.started_at,
  s.ended_at,
  s.start_odometer,
  s.end_odometer,
  coalesce(s.end_odometer - s.start_odometer, 0)                 as km,
  extract(epoch from (s.ended_at - s.started_at)) / 3600.0        as hours,
  coalesce(s.income, 0)                                            as income,
  coalesce(s.expenses, 0)                                          as expenses,
  coalesce(s.income, 0) - coalesce(s.expenses, 0)                  as net,
  round(
    (coalesce(s.income, 0) - coalesce(s.expenses, 0))
    / nullif(coalesce(s.end_odometer - s.start_odometer, 0), 0), 0
  )                                                                as net_per_km,
  round(
    (coalesce(s.income, 0) - coalesce(s.expenses, 0))
    / nullif(extract(epoch from (s.ended_at - s.started_at)) / 3600.0, 0), 0
  )                                                                as net_per_hour
from public.work_sessions s
where s.ended_at is not null;

-- ---------------------------------------------------------------------------
-- Resumen del panel en una sola llamada
-- select * from dashboard_summary(12, 30);   -- vehículo 12, últimos 30 días
-- Desde la app: supabase.rpc('dashboard_summary', { p_vehicle_id, p_days })
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_summary(p_vehicle_id bigint, p_days integer default 30)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  since timestamptz := now() - make_interval(days => p_days);
  v_fuel      jsonb;
  v_maint     jsonb;
  v_sessions  jsonb;
  v_trips     jsonb;
  v_docs      jsonb;
  v_km        numeric;
  v_costs     numeric;
begin
  -- Si el vehículo no es del usuario, RLS deja todo en cero; no filtramos nada.
  select jsonb_build_object(
           'spent',   coalesce(sum(total), 0),
           'gallons', coalesce(sum(gallons), 0),
           'fills',   count(*))
    into v_fuel
  from fuel_entries where vehicle_id = p_vehicle_id and occurred_at >= since;

  select jsonb_build_object(
           'spent',   coalesce(sum(total), 0),
           'entries', count(*),
           'next_km', min(next_km) filter (where next_km is not null))
    into v_maint
  from maintenance_entries where vehicle_id = p_vehicle_id and occurred_at >= since;

  select jsonb_build_object(
           'income',   coalesce(sum(income), 0),
           'expenses', coalesce(sum(expenses), 0),
           'net',      coalesce(sum(net), 0),
           'hours',    round(coalesce(sum(hours), 0), 1),
           'km',       coalesce(sum(km), 0),
           'sessions', count(*))
    into v_sessions
  from work_session_profitability where vehicle_id = p_vehicle_id and started_at >= since;

  select jsonb_build_object(
           'km',       round(coalesce(sum(distance_km), 0), 1),
           'count',    count(*),
           'seconds',  coalesce(sum(duration_seconds), 0))
    into v_trips
  from trips where vehicle_id = p_vehicle_id and started_at >= since;

  select coalesce(jsonb_agg(jsonb_build_object(
           'type', document_type, 'expires_at', expires_at,
           'days_left', (expires_at::date - current_date)) order by expires_at), '[]'::jsonb)
    into v_docs
  from vehicle_documents
  where vehicle_id = p_vehicle_id
    and expires_at is not null
    and expires_at::date <= current_date + 45;

  v_km    := coalesce((v_sessions->>'km')::numeric, 0);
  v_costs := coalesce((v_fuel->>'spent')::numeric, 0) + coalesce((v_maint->>'spent')::numeric, 0);

  return jsonb_build_object(
    'vehicle_id',   p_vehicle_id,
    'days',         p_days,
    'since',        since,
    'fuel',         v_fuel,
    'maintenance',  v_maint,
    'sessions',     v_sessions,
    'trips',        v_trips,
    'documents_expiring', v_docs,
    'cost_per_km',  case when v_km > 0 then round(v_costs / v_km, 0) else null end,
    'real_net',     coalesce((v_sessions->>'income')::numeric, 0)
                    - coalesce((v_sessions->>'expenses')::numeric, 0)
                    - v_costs
  );
end $$;

grant execute on function public.dashboard_summary(bigint, integer) to authenticated;
