-- admin_listar_dispositivos: scope por organización, usuarios sin dispositivos
-- y que no se filtren las claves de la suscripción.
-- Correr con: supabase test db. Todo corre en una transacción que se descarta.
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

select public.superadmin_guardar_organizacion('oratoriogarayy@gmail.com', null, 'ZZ Disp A');
select public.superadmin_guardar_organizacion('oratoriogarayy@gmail.com', null, 'ZZ Disp B');
create temp table org as
  select (select id from public.organizaciones where nombre = 'ZZ Disp A') as a,
         (select id from public.organizaciones where nombre = 'ZZ Disp B') as b;
select public.superadmin_asignar_rol('oratoriogarayy@gmail.com', 'adma@test.local', 'Admin A', 'admin', array[(select a from org)]);
select public.admin_alta_usuario('adma@test.local', 'usua@test.local', 'Usuario A', array[(select a from org)]);
select public.admin_alta_usuario('adma@test.local', 'sinp@test.local', 'Sin Push', array[(select a from org)]);
select public.superadmin_asignar_rol('oratoriogarayy@gmail.com', 'admb@test.local', 'Admin B', 'admin', array[(select b from org)]);
select public.admin_alta_usuario('admb@test.local', 'usub@test.local', 'Usuario B', array[(select b from org)]);

select public.push_registrar_dispositivo('usua@test.local', 'https://push.test.local/a1', 'k1', 'a1', 'UA 1');
select public.push_registrar_dispositivo('usua@test.local', 'https://push.test.local/a2', 'k2', 'a2', 'UA 2');
select public.push_registrar_dispositivo('usub@test.local', 'https://push.test.local/b1', 'k3', 'a3', 'UA 3');

select throws_ok($$ select public.admin_listar_dispositivos('usua@test.local') $$,
  '42501', null, 'quien no es admin no lista dispositivos');

select is((select count(*)::int from jsonb_array_elements(public.admin_listar_dispositivos('adma@test.local')) f
           where f ->> 'email' in ('usua@test.local', 'sinp@test.local')), 2,
  'el admin ve a los miembros de su organización');
select is((select count(*)::int from jsonb_array_elements(public.admin_listar_dispositivos('adma@test.local')) f
           where f ->> 'email' = 'usub@test.local'), 0,
  'el admin de A no ve usuarios de B');
select is((select jsonb_array_length(f -> 'dispositivos') from jsonb_array_elements(public.admin_listar_dispositivos('adma@test.local')) f
           where f ->> 'email' = 'usua@test.local'), 2,
  'se listan los dos dispositivos del usuario');
select is((select jsonb_array_length(f -> 'dispositivos') from jsonb_array_elements(public.admin_listar_dispositivos('adma@test.local')) f
           where f ->> 'email' = 'sinp@test.local'), 0,
  'un usuario sin dispositivos aparece con lista vacía');
select is((select (public.admin_listar_dispositivos('adma@test.local')::text ~ '(endpoint|p256dh|"auth")')),
  false, 'no se exponen endpoint ni claves');
select is((select count(*)::int from jsonb_array_elements(public.admin_listar_dispositivos('oratoriogarayy@gmail.com', (select b from org))) f
           where f ->> 'email' = 'usub@test.local'), 1,
  'el superadmin puede filtrar por organización');

select * from finish();
rollback;
