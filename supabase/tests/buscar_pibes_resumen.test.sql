-- buscar_pibes_resumen: búsqueda por palabras sin tildes, aislamiento por
-- organización, visitas / última asistencia / marcado_hoy y permisos.
-- Correr con: supabase test db. Todo corre en una transacción que se descarta.
begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

select public.superadmin_guardar_organizacion('oratoriogarayy@gmail.com', null, 'ZZ Busq A');
select public.superadmin_guardar_organizacion('oratoriogarayy@gmail.com', null, 'ZZ Busq B');
create temp table org as
  select (select id from public.organizaciones where nombre = 'ZZ Busq A') as a,
         (select id from public.organizaciones where nombre = 'ZZ Busq B') as b;

insert into public.niveles_grados_pibes (nivel) values ('ZZNivel') on conflict do nothing;
insert into public.grados_pibes (nivel, grado) values ('ZZNivel', 1);
insert into public.edades (nombre, organizacion_id) values ('ZZ Edad A', (select a from org));
insert into public.edades (nombre, organizacion_id) values ('ZZ Edad B', (select b from org));

insert into public.pibes (nombre, apellido, grado_id, entrego_ficha, edad_id, organizacion_id)
values
  ('Juan', 'Pérez', (select max(id) from public.grados_pibes),
   true, (select id from public.edades where nombre = 'ZZ Edad A'), (select a from org)),
  ('Juana', 'Gómez', (select max(id) from public.grados_pibes),
   false, (select id from public.edades where nombre = 'ZZ Edad A'), (select a from org)),
  ('Juan', 'Pérez', (select max(id) from public.grados_pibes),
   true, (select id from public.edades where nombre = 'ZZ Edad B'), (select b from org));

insert into public.asistencias (fecha, pibe_id, organizacion_id)
select f, p.id, p.organizacion_id
  from public.pibes p,
       (values ('2026-11-01T15:00:00Z'::timestamptz), ('2026-11-08T15:00:00Z'::timestamptz)) as v(f)
 where p.nombre = 'Juan' and p.organizacion_id = (select a from org);

select is((select count(*)::int from public.buscar_pibes_resumen((select a from org), 'juan')),
  2, 'busca por prefijo en nombre (Juan y Juana)');
select is((select count(*)::int from public.buscar_pibes_resumen((select a from org), 'perez')),
  1, 'ignora tildes y mayúsculas');
select is((select count(*)::int from public.buscar_pibes_resumen((select a from org), 'Juan Perez')),
  1, 'nombre y apellido juntos');
select is((select count(*)::int from public.buscar_pibes_resumen((select a from org), 'perez juan')),
  1, 'el orden de las palabras no importa');
select is((select count(*)::int from public.buscar_pibes_resumen((select a from org), '   ')),
  0, 'término vacío no devuelve nada');
select is((select count(*)::int from public.buscar_pibes_resumen((select b from org), 'juan')),
  1, 'no mezcla organizaciones');

select is((select visitas::int from public.buscar_pibes_resumen((select a from org), 'perez')),
  2, 'cuenta las visitas');
select is((select marcado_hoy from public.buscar_pibes_resumen((select a from org), 'perez', '2026-11-08')),
  true, 'marcado_hoy es true si hay asistencia en la fecha');

-- Orden: primero los que empiezan con lo buscado, después los que lo contienen.
insert into public.pibes (nombre, apellido, grado_id, entrego_ficha, edad_id, organizacion_id)
values
  ('Aaron', 'Mejuan', (select max(id) from public.grados_pibes),
   true, (select id from public.edades where nombre = 'ZZ Edad A'), (select a from org)),
  ('Zoe', 'Juanes', (select max(id) from public.grados_pibes),
   true, (select id from public.edades where nombre = 'ZZ Edad A'), (select a from org));

select is((select array_agg(nombre || ' ' || apellido order by ord) from
    (select nombre, apellido, row_number() over () as ord
       from public.buscar_pibes_resumen((select a from org), 'juan')) t),
  array['Juan Pérez', 'Juana Gómez', 'Zoe Juanes', 'Aaron Mejuan'],
  'los que empiezan con lo buscado (nombre o apellido) van antes que los que lo contienen');
select is((select array_agg(nombre::text order by ord) from
    (select nombre, row_number() over () as ord
       from public.buscar_pibes_resumen((select a from org), 'juan pe')) t),
  array['Juan'],
  'con varias palabras, todas deben empezar una palabra para ir primero');

set local role authenticated;
select throws_ok($$ select * from public.buscar_pibes_resumen(gen_random_uuid(), 'juan') $$,
  '42501', null, 'un usuario autenticado no puede ejecutarla directamente');
reset role;

select * from finish();
rollback;
