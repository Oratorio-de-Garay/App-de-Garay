-- Multi-organización.
--
-- La tabla public.organizaciones y pibes.organizacion_id ya existían: esta
-- migración se apoya en ellas y extiende el scoping al resto del esquema.
--
-- El backend consulta con la service role key, que bypassea RLS por diseño, así
-- que el aislamiento real se aplica en las queries del backend. Las políticas de
-- este archivo son defensa en profundidad para el día que se consulte desde el
-- cliente.

-- ─────────────────────────────────────────────────────────
-- Membresías
-- ─────────────────────────────────────────────────────────

create table if not exists public.organizacion_miembros (
  email text not null,
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  rol text not null default 'miembro',
  created_at timestamptz not null default now(),
  primary key (email, organizacion_id)
);

-- Reutiliza el normalizador de allowed_emails: el middleware busca por email en
-- minúsculas, así que los writes tienen que guardarlo igual.
drop trigger if exists trg_normalize_miembro_email on public.organizacion_miembros;
create trigger trg_normalize_miembro_email
  before insert or update on public.organizacion_miembros
  for each row execute function public.normalize_allowed_email();

create index if not exists organizacion_miembros_org_idx on public.organizacion_miembros (organizacion_id);

-- Las dos organizaciones ya existen, pero la migración tiene que poder correr
-- sobre una base limpia. Se usa "where not exists" en vez de "on conflict"
-- porque organizaciones.nombre no tiene constraint única: con on conflict esto
-- duplicaría las filas que ya están.
insert into public.organizaciones (nombre)
select v.nombre from (values ('Oratorio de Garay'), ('Escuadra 3')) as v(nombre)
where not exists (select 1 from public.organizaciones o where o.nombre = v.nombre);

-- Todos los emails ya habilitados pasan a ser miembros únicamente de
-- "Oratorio de Garay".
insert into public.organizacion_miembros (email, organizacion_id)
select a.email, o.id from public.allowed_emails a
cross join public.organizaciones o
where o.nombre = 'Oratorio de Garay'
on conflict do nothing;

-- ─────────────────────────────────────────────────────────
-- organizacion_id en las tablas de datos
--
-- Orden obligatorio: agregar columna -> backfill -> set not null.
-- pibes ya la tenía y ya está poblada.
-- ─────────────────────────────────────────────────────────

alter table public.asistencias add column if not exists organizacion_id uuid references public.organizaciones(id);

alter table public.buffet_categories add column if not exists organizacion_id uuid references public.organizaciones(id);
alter table public.buffet_suppliers add column if not exists organizacion_id uuid references public.organizaciones(id);
alter table public.buffet_products add column if not exists organizacion_id uuid references public.organizaciones(id);
alter table public.buffet_product_costs add column if not exists organizacion_id uuid references public.organizaciones(id);
alter table public.buffet_combos add column if not exists organizacion_id uuid references public.organizaciones(id);
alter table public.buffet_combo_items add column if not exists organizacion_id uuid references public.organizaciones(id);
alter table public.buffet_budgets add column if not exists organizacion_id uuid references public.organizaciones(id);
alter table public.buffet_budget_items add column if not exists organizacion_id uuid references public.organizaciones(id);
alter table public.buffet_sales add column if not exists organizacion_id uuid references public.organizaciones(id);
alter table public.buffet_sale_items add column if not exists organizacion_id uuid references public.organizaciones(id);

do $$
declare
  oratorio uuid;
  escuadra uuid;
begin
  select id into oratorio from public.organizaciones where nombre = 'Oratorio de Garay' limit 1;
  select id into escuadra from public.organizaciones where nombre = 'Escuadra 3' limit 1;

  update public.pibes set organizacion_id = oratorio where organizacion_id is null;
  update public.asistencias set organizacion_id = oratorio where organizacion_id is null;

  update public.buffet_categories set organizacion_id = escuadra where organizacion_id is null;
  update public.buffet_suppliers set organizacion_id = escuadra where organizacion_id is null;
  update public.buffet_products set organizacion_id = escuadra where organizacion_id is null;
  update public.buffet_product_costs set organizacion_id = escuadra where organizacion_id is null;
  update public.buffet_combos set organizacion_id = escuadra where organizacion_id is null;
  update public.buffet_combo_items set organizacion_id = escuadra where organizacion_id is null;
  update public.buffet_budgets set organizacion_id = escuadra where organizacion_id is null;
  update public.buffet_budget_items set organizacion_id = escuadra where organizacion_id is null;
  update public.buffet_sales set organizacion_id = escuadra where organizacion_id is null;
  update public.buffet_sale_items set organizacion_id = escuadra where organizacion_id is null;
end $$;

-- buffet_categories queda nullable a propósito: nulo = categoría global,
-- visible para todas las organizaciones.
alter table public.pibes alter column organizacion_id set not null;
alter table public.asistencias alter column organizacion_id set not null;
alter table public.buffet_suppliers alter column organizacion_id set not null;
alter table public.buffet_products alter column organizacion_id set not null;
alter table public.buffet_product_costs alter column organizacion_id set not null;
alter table public.buffet_combos alter column organizacion_id set not null;
alter table public.buffet_combo_items alter column organizacion_id set not null;
alter table public.buffet_budgets alter column organizacion_id set not null;
alter table public.buffet_budget_items alter column organizacion_id set not null;
alter table public.buffet_sales alter column organizacion_id set not null;
alter table public.buffet_sale_items alter column organizacion_id set not null;

create index if not exists pibes_org_idx on public.pibes (organizacion_id);
create index if not exists asistencias_org_idx on public.asistencias (organizacion_id);
create index if not exists buffet_categories_org_idx on public.buffet_categories (organizacion_id);
create index if not exists buffet_suppliers_org_idx on public.buffet_suppliers (organizacion_id);
create index if not exists buffet_products_org_idx on public.buffet_products (organizacion_id);
create index if not exists buffet_product_costs_org_idx on public.buffet_product_costs (organizacion_id);
create index if not exists buffet_combos_org_idx on public.buffet_combos (organizacion_id);
create index if not exists buffet_combo_items_org_idx on public.buffet_combo_items (organizacion_id);
create index if not exists buffet_budgets_org_idx on public.buffet_budgets (organizacion_id);
create index if not exists buffet_budget_items_org_idx on public.buffet_budget_items (organizacion_id);
create index if not exists buffet_sales_org_idx on public.buffet_sales (organizacion_id);
create index if not exists buffet_sale_items_org_idx on public.buffet_sale_items (organizacion_id);

-- ─────────────────────────────────────────────────────────
-- Unicidad por organización
--
-- Los nombres eran únicos globalmente: sin esto dos organizaciones no podrían
-- tener un proveedor o un combo con el mismo nombre. buffet_units sigue global.
-- ─────────────────────────────────────────────────────────

alter table public.buffet_categories drop constraint if exists buffet_categories_name_key;
alter table public.buffet_suppliers drop constraint if exists buffet_suppliers_name_key;
alter table public.buffet_combos drop constraint if exists buffet_combos_name_key;

create unique index if not exists buffet_suppliers_org_name_key on public.buffet_suppliers (organizacion_id, name);
create unique index if not exists buffet_combos_org_name_key on public.buffet_combos (organizacion_id, name);

-- Dos índices parciales porque organizacion_id admite nulo y en un índice único
-- normal cada nulo cuenta como distinto (permitiría categorías globales repetidas).
create unique index if not exists buffet_categories_org_name_key
  on public.buffet_categories (organizacion_id, name) where organizacion_id is not null;
create unique index if not exists buffet_categories_global_name_key
  on public.buffet_categories (name) where organizacion_id is null;

-- ─────────────────────────────────────────────────────────
-- RLS de respaldo
-- ─────────────────────────────────────────────────────────

-- security definer: lee organizacion_miembros salteando su propia RLS, que si no
-- provocaría recursión al evaluar las políticas que llaman a esta función.
create or replace function public.organizaciones_del_usuario()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select organizacion_id from public.organizacion_miembros
  where email = lower(auth.jwt() ->> 'email')
$$;

alter table public.organizaciones enable row level security;
alter table public.organizacion_miembros enable row level security;
alter table public.pibes enable row level security;
alter table public.asistencias enable row level security;

do $$
declare
  t text;
begin
  -- Reemplaza las políticas "using (true)" de buffet por el filtro de organización.
  foreach t in array array[
    'buffet_suppliers', 'buffet_products', 'buffet_product_costs',
    'buffet_combos', 'buffet_combo_items', 'buffet_budgets',
    'buffet_budget_items', 'buffet_sales', 'buffet_sale_items',
    'pibes', 'asistencias'
  ] loop
    execute format('drop policy if exists "org scope %1$s" on public.%1$I', t);
    execute format(
      'create policy "org scope %1$s" on public.%1$I for all to authenticated '
      'using (organizacion_id in (select public.organizaciones_del_usuario())) '
      'with check (organizacion_id in (select public.organizaciones_del_usuario()))', t);
  end loop;
end $$;

-- Las categorías sin organización son globales: todos las ven.
drop policy if exists "org scope buffet_categories" on public.buffet_categories;
create policy "org scope buffet_categories" on public.buffet_categories for all to authenticated
  using (organizacion_id is null or organizacion_id in (select public.organizaciones_del_usuario()))
  with check (organizacion_id is null or organizacion_id in (select public.organizaciones_del_usuario()));

drop policy if exists "org scope organizaciones" on public.organizaciones;
create policy "org scope organizaciones" on public.organizaciones for select to authenticated
  using (id in (select public.organizaciones_del_usuario()));

drop policy if exists "org scope organizacion_miembros" on public.organizacion_miembros;
create policy "org scope organizacion_miembros" on public.organizacion_miembros for select to authenticated
  using (email = lower(auth.jwt() ->> 'email'));

-- Las políticas viejas quedaban abiertas a toda la tabla.
drop policy if exists "allow authenticated buffet categories" on public.buffet_categories;
drop policy if exists "allow authenticated buffet suppliers" on public.buffet_suppliers;
drop policy if exists "allow authenticated buffet products" on public.buffet_products;
drop policy if exists "allow authenticated buffet product costs" on public.buffet_product_costs;
drop policy if exists "allow authenticated buffet combos" on public.buffet_combos;
drop policy if exists "allow authenticated buffet combo items" on public.buffet_combo_items;
drop policy if exists "allow authenticated buffet budgets" on public.buffet_budgets;
drop policy if exists "allow authenticated buffet budget items" on public.buffet_budget_items;
drop policy if exists "allow authenticated buffet sales" on public.buffet_sales;
drop policy if exists "allow authenticated buffet sale items" on public.buffet_sale_items;

-- Sin el GRANT el acceso falla con "permission denied" antes de evaluar RLS.
grant select, insert, update, delete on
  public.organizaciones,
  public.organizacion_miembros,
  public.pibes,
  public.asistencias
to anon, authenticated, service_role;

grant select on public.edades, public.grados_pibes to anon, authenticated, service_role;
