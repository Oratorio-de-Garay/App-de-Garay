-- Cierra el acceso público directo a la base.
--
-- El schema original (creado a mano, ver 20260730210820_remote_schema.sql)
-- tenía políticas "public read/insert/update ..." con USING (true) y sin TO,
-- o sea para TODOS los roles, incluido anon. Sumado a los GRANT ALL a anon,
-- cualquiera con la publishable key (que está en el HTML del frontend) podía
-- leer, crear y modificar pibes y asistencias directo por la API de Supabase,
-- salteando el backend. También cualquier cuenta de Google logueada, aunque no
-- estuviera registrada. Las políticas "org scope" de 20260829000000 no lo
-- impedían: las políticas permisivas se combinan con OR.
--
-- El backend usa la service role (bypassea RLS y no depende de anon), y el
-- frontend sólo usa Supabase para el login: esto no cambia el funcionamiento
-- de la app.

-- ─────────────────────────────────────────────────────────
-- 1. Políticas abiertas
-- ─────────────────────────────────────────────────────────

drop policy if exists "public read pibes" on public.pibes;
drop policy if exists "public insert pibes" on public.pibes;
drop policy if exists "public update pibes" on public.pibes;
drop policy if exists "public read asistencias" on public.asistencias;
drop policy if exists "public insert asistencias" on public.asistencias;
drop policy if exists "public read organizaciones" on public.organizaciones;
drop policy if exists "public read edades" on public.edades;
drop policy if exists "public read grados" on public.grados_pibes;
drop policy if exists "public read niveles" on public.niveles_grados_pibes;

-- Reemplazos acotados a usuarios logueados. pibes, asistencias y
-- organizaciones ya tienen su política "org scope" (20260829000000).
-- edades es por organización; grados y niveles son catálogos globales.
drop policy if exists "org scope edades" on public.edades;
create policy "org scope edades" on public.edades for select to authenticated
  using (organizacion_id in (select public.organizaciones_del_usuario()));

drop policy if exists "catalogo grados" on public.grados_pibes;
create policy "catalogo grados" on public.grados_pibes for select to authenticated
  using (true);

drop policy if exists "catalogo niveles" on public.niveles_grados_pibes;
create policy "catalogo niveles" on public.niveles_grados_pibes for select to authenticated
  using (true);

-- ─────────────────────────────────────────────────────────
-- 2. anon no tiene nada que hacer en la base: sólo el login usa Supabase
--    desde el navegador, y eso no pasa por estas tablas.
-- ─────────────────────────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array[
    'pibes', 'asistencias', 'organizaciones', 'organizacion_miembros',
    'edades', 'grados_pibes', 'niveles_grados_pibes',
    'buffet_categories', 'buffet_units', 'buffet_suppliers', 'buffet_products',
    'buffet_product_costs', 'buffet_combos', 'buffet_combo_items',
    'buffet_budgets', 'buffet_budget_items', 'buffet_sales', 'buffet_sale_items',
    'buffet_eventos'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from anon', t);
    end if;
  end loop;
end $$;

revoke all on all sequences in schema public from anon;

-- buscar_pibes es SECURITY INVOKER: con las políticas de arriba un usuario
-- logueado sólo encuentra pibes de sus organizaciones. anon, nada.
do $$
declare
  f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
           where p.proname = 'buscar_pibes' and p.pronamespace = 'public'::regnamespace
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- El backend (service_role) lee los niveles a través de grados_pibes; se le
-- da SELECT explícito porque el schema original no lo tenía.
grant select on public.niveles_grados_pibes to service_role;
