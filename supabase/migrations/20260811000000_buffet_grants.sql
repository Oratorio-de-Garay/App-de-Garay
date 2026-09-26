-- Grants de las tablas buffet_*.
--
-- ⚠️ Este archivo tiene un timestamp ANTERIOR a 20260812000000_buffet.sql, que
-- es la migración que crea esas tablas: sobre una base limpia los GRANT
-- fallaban con "relation does not exist". No se le cambia el nombre porque la
-- versión 20260811000000 ya figura como aplicada en el historial remoto
-- (supabase_migrations.schema_migrations) y renombrarlo lo desincronizaría.
--
-- Solución: los grants ahora están al final de 20260812000000_buffet.sql, y
-- acá sólo se otorgan sobre las tablas que ya existan (en producción existían
-- porque se habían creado a mano; en una base limpia esto no hace nada).
-- Contexto original: las tablas buffet_* se habían creado con políticas RLS
-- pero sin los GRANT de Postgres, así que todo rol (incluido service_role)
-- recibía "permission denied for table ..." antes de evaluar RLS.

grant usage on schema public to anon, authenticated, service_role;

do $$
declare
  t text;
begin
  foreach t in array array[
    'buffet_categories', 'buffet_units', 'buffet_suppliers',
    'buffet_products', 'buffet_product_costs', 'buffet_combos',
    'buffet_combo_items', 'buffet_budgets', 'buffet_budget_items'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('grant select, insert, update, delete on public.%I to anon, authenticated, service_role', t);
    end if;
  end loop;
end $$;

grant usage, select on all sequences in schema public to anon, authenticated, service_role;
