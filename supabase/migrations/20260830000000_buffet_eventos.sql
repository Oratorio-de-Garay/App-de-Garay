-- Eventos de buffet.
--
-- Hasta acá el "evento" era sólo un texto libre en buffet_sales.event_name que
-- había que volver a tipear en cada venta. En una feria del plato el flujo real
-- es al revés: se crea el evento una vez y después se le cargan las ventas de a
-- una, cliente por cliente. Esta migración convierte al evento en una entidad.

create table if not exists public.buffet_eventos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  fecha date not null default current_date,
  estado text not null default 'abierto',
  observacion text,
  organizacion_id uuid not null references public.organizaciones(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.buffet_sales
  add column if not exists event_id uuid references public.buffet_eventos(id) on delete cascade;

-- ─────────────────────────────────────────────────────────
-- Backfill
--
-- Ya hay ventas cargadas y event_id termina en not null, así que hay que
-- crearles un evento a todas antes de poner la constraint.
-- event_name se conserva como snapshot del nombre al momento de la venta,
-- mismo criterio que buffet_sale_items.description.
-- ─────────────────────────────────────────────────────────

-- Un evento por cada (organizacion_id, event_name) distinto que ya existía.
insert into public.buffet_eventos (nombre, fecha, estado, organizacion_id)
select s.event_name, min(s.sale_date), 'cerrado', s.organizacion_id
from public.buffet_sales s
where s.event_name is not null and s.event_id is null
group by s.organizacion_id, s.event_name
on conflict do nothing;

-- Las ventas que nunca tuvieron evento se agrupan en uno solo por organización.
insert into public.buffet_eventos (nombre, fecha, estado, organizacion_id)
select 'Ventas anteriores', min(s.sale_date), 'cerrado', s.organizacion_id
from public.buffet_sales s
where s.event_name is null and s.event_id is null
group by s.organizacion_id
on conflict do nothing;

update public.buffet_sales s
set event_id = e.id
from public.buffet_eventos e
where s.event_id is null
  and e.organizacion_id = s.organizacion_id
  and e.nombre = coalesce(s.event_name, 'Ventas anteriores');

alter table public.buffet_sales alter column event_id set not null;

-- ─────────────────────────────────────────────────────────
-- Índices y unicidad
-- ─────────────────────────────────────────────────────────

create index if not exists buffet_eventos_org_idx on public.buffet_eventos (organizacion_id);
create index if not exists buffet_eventos_fecha_idx on public.buffet_eventos (fecha desc);
create index if not exists buffet_sales_event_idx on public.buffet_sales (event_id);

-- Por organización: dos organizaciones sí pueden tener eventos con el mismo nombre.
create unique index if not exists buffet_eventos_org_nombre_key
  on public.buffet_eventos (organizacion_id, nombre);

drop trigger if exists buffet_eventos_updated_at on public.buffet_eventos;
create trigger buffet_eventos_updated_at before update on public.buffet_eventos for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────
-- RLS de respaldo (el backend consulta con service role y filtra a mano)
-- ─────────────────────────────────────────────────────────

alter table public.buffet_eventos enable row level security;

drop policy if exists "org scope buffet_eventos" on public.buffet_eventos;
create policy "org scope buffet_eventos" on public.buffet_eventos for all to authenticated
  using (organizacion_id in (select public.organizaciones_del_usuario()))
  with check (organizacion_id in (select public.organizaciones_del_usuario()));

-- Sin el GRANT el acceso falla con "permission denied" antes de evaluar RLS.
grant select, insert, update, delete on public.buffet_eventos to anon, authenticated, service_role;
