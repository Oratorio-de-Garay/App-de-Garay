-- El backend pasó de la clave anon a la service role key, y la función
-- buscar_pibes sólo tenía EXECUTE para anon/authenticated: la búsqueda de pibes
-- fallaba con "permission denied for function buscar_pibes".
--
-- Igual que con las tablas, el GRANT es imprescindible aunque service_role
-- bypassee RLS: sin él Postgres corta antes.
--
-- Se recorre pg_proc en vez de escribir la firma a mano para cubrir cualquier
-- sobrecarga de la función.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'buscar_pibes'
  loop
    execute format('grant execute on function %s to anon, authenticated, service_role', fn.signature);
  end loop;
end $$;
