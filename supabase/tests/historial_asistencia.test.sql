-- asistencia_fechas / asistencia_top: agrupan por día UTC, cuentan una vez por
-- pibe y día, respetan el año y la organización, y devuelven empatados del podio.
-- Correr con: supabase test db.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

select public.superadmin_guardar_organizacion('oratoriogarayy@gmail.com', null, 'ZZ Hist A');
select public.superadmin_guardar_organizacion('oratoriogarayy@gmail.com', null, 'ZZ Hist B');
create temp table org as
  select (select id from public.organizaciones where nombre = 'ZZ Hist A') as a,
         (select id from public.organizaciones where nombre = 'ZZ Hist B') as b;

insert into public.niveles_grados_pibes (nivel) values ('ZZNivel') on conflict do nothing;
insert into public.grados_pibes (nivel, grado) values ('ZZNivel', 1);
insert into public.edades (nombre, organizacion_id) values ('ZZ Edad HA', (select a from org));
insert into public.edades (nombre, organizacion_id) values ('ZZ Edad HB', (select b from org));

insert into public.pibes (nombre, apellido, grado_id, entrego_ficha, edad_id, organizacion_id)
select n, 'Hist', (select max(id) from public.grados_pibes), true,
       (select id from public.edades where nombre = 'ZZ Edad HA'), (select a from org)
  from unnest(array['Ana', 'Beto', 'Carla', 'Dani', 'Eva']) as n;
insert into public.pibes (nombre, apellido, grado_id, entrego_ficha, edad_id, organizacion_id)
values ('Otro', 'Hist', (select max(id) from public.grados_pibes), true,
        (select id from public.edades where nombre = 'ZZ Edad HB'), (select b from org));

-- Ana: 4 días (uno duplicado); Beto: 3; Carla: 2; Dani: 2 (empate en el 3.º); Eva: 1.
create or replace function pg_temp.asist(p_nombre text, p_fechas timestamptz[]) returns void
language sql as $f$
  insert into public.asistencias (fecha, pibe_id, organizacion_id)
  select f, p.id, p.organizacion_id
    from public.pibes p, unnest(p_fechas) as f
   where p.nombre = p_nombre and p.apellido = 'Hist';
$f$;

select pg_temp.asist('Ana',   array['2026-03-01T15:00:00Z','2026-03-01T18:00:00Z','2026-03-08T15:00:00Z','2026-03-15T15:00:00Z','2026-03-22T15:00:00Z']::timestamptz[]);
select pg_temp.asist('Beto',  array['2026-03-01T15:00:00Z','2026-03-08T15:00:00Z','2026-03-15T15:00:00Z']::timestamptz[]);
select pg_temp.asist('Carla', array['2026-03-01T15:00:00Z','2026-03-08T15:00:00Z']::timestamptz[]);
select pg_temp.asist('Dani',  array['2026-03-01T15:00:00Z','2026-03-22T15:00:00Z']::timestamptz[]);
select pg_temp.asist('Eva',   array['2026-03-01T15:00:00Z','2025-12-31T23:30:00Z']::timestamptz[]);
select pg_temp.asist('Otro',  array['2026-03-01T15:00:00Z']::timestamptz[]);

select is((select count(*)::int from public.asistencia_fechas((select a from org), 2026)), 4,
  'fechas: una fila por día distinto del año');
select is((select total from public.asistencia_fechas((select a from org), 2026) where fecha = '2026-03-01'), 5::bigint,
  'fechas: cuenta pibes distintos, no filas (Ana está duplicada)');
select is((select fecha from public.asistencia_fechas((select a from org), 2026) limit 1), '2026-03-22'::date,
  'fechas: ordenadas de la más nueva a la más vieja');
select is((select count(*)::int from public.asistencia_fechas((select a from org), 2025)), 1,
  'fechas: respeta el año');
select is((select total from public.asistencia_fechas((select b from org), 2026)), 1::bigint,
  'fechas: no mezcla organizaciones');

select is((select total from public.asistencia_top((select a from org), 2026) where nombre = 'Ana'), 4::bigint,
  'top: una asistencia por día aunque esté duplicada');
select is((select count(*)::int from public.asistencia_top((select a from org), 2026)), 4,
  'top: incluye a los empatados en el tercer puesto (Carla y Dani)');
select is((select count(*)::int from public.asistencia_top((select a from org), 2026) where nombre = 'Eva'), 0,
  'top: Eva queda fuera del podio');

set local role authenticated;
select throws_ok($$ select * from public.asistencia_fechas(gen_random_uuid(), 2026) $$,
  '42501', null, 'un usuario autenticado no puede ejecutarla directamente');
reset role;

select * from finish();
rollback;
