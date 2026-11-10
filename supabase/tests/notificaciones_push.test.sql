-- Notificaciones push: dispositivos, scope de envío por organización,
-- cierre del envío y acceso cerrado a anon/authenticated
-- (ver docs/ROLES_Y_PERMISOS.md).
-- Correr con: supabase test db. Todo corre en una transacción que se descarta.
begin;
create extension if not exists pgtap with schema extensions;

select plan(27);

-- ─── Datos de prueba ───
-- Dos organizaciones, un admin de cada una, un usuario en A y otro en B.
select public.superadmin_guardar_organizacion('oratoriogarayy@gmail.com', null, 'ZZ Push A');
select public.superadmin_guardar_organizacion('oratoriogarayy@gmail.com', null, 'ZZ Push B');
create temp table org as
  select (select id from public.organizaciones where nombre = 'ZZ Push A') as a,
         (select id from public.organizaciones where nombre = 'ZZ Push B') as b;
select public.superadmin_asignar_rol('oratoriogarayy@gmail.com', 'adma@test.local', 'Admin A', 'admin', array[(select a from org)]);
select public.superadmin_asignar_rol('oratoriogarayy@gmail.com', 'admb@test.local', 'Admin B', 'admin', array[(select b from org)]);
select public.admin_alta_usuario('adma@test.local', 'usua@test.local', 'Usuario A', array[(select a from org)]);
select public.admin_alta_usuario('admb@test.local', 'usub@test.local', 'Usuario B', array[(select b from org)]);

-- ─── Dispositivos ───
select is((select (public.push_registrar_dispositivo('usua@test.local', 'https://push.test.local/a1', 'k1', 'a1', 'UA 1') ->> 'id') is not null),
  true, 'se registra un dispositivo');
select public.push_registrar_dispositivo('usua@test.local', 'https://push.test.local/a2', 'k2', 'a2', 'UA 2');
select is((select count(*)::int from public.dispositivos_push where email = 'usua@test.local'), 2,
  'el usuario tiene dos dispositivos');

select public.push_registrar_dispositivo('usua@test.local', 'https://push.test.local/a1', 'k1b', 'a1b', 'UA 1');
select is((select count(*)::int from public.dispositivos_push where endpoint = 'https://push.test.local/a1'), 1,
  'registrar el mismo endpoint no duplica');
select is((select p256dh from public.dispositivos_push where endpoint = 'https://push.test.local/a1'), 'k1b',
  'registrar el mismo endpoint actualiza las claves');

select public.push_registrar_dispositivo('usub@test.local', 'https://push.test.local/a1', 'k1c', 'a1c', 'UA 1');
select is((select email from public.dispositivos_push where endpoint = 'https://push.test.local/a1'), 'usub@test.local',
  'un endpoint ya existente se reasigna a la cuenta que lo registra');
select public.push_registrar_dispositivo('usua@test.local', 'https://push.test.local/a1', 'k1', 'a1', 'UA 1');

select throws_ok($$ select public.push_registrar_dispositivo('usua@test.local', 'http://push.test.local/x', 'k', 'a', null) $$,
  '22023', null, 'el endpoint tiene que ser https');
select throws_ok($$ select public.push_registrar_dispositivo('usua@test.local', 'https://push.test.local/x', '', 'a', null) $$,
  '22023', null, 'las claves son obligatorias');
select throws_ok($$ select public.push_registrar_dispositivo('noexiste@test.local', 'https://push.test.local/x', 'k', 'a', null) $$,
  'P0002', null, 'sólo se registran dispositivos de usuarios existentes');

select is((select public.push_quitar_dispositivo('usub@test.local', 'https://push.test.local/a2') ->> 'eliminados'), '0',
  'un usuario no puede quitar el dispositivo de otro');

-- ─── Envío: scope ───
select throws_ok($$ select public.admin_preparar_notificacion('usua@test.local', (select a from org), 'usua@test.local', 'Hola', 'Texto') $$,
  '42501', null, 'quien no es admin no envía');
select throws_ok($$ select public.admin_preparar_notificacion('adma@test.local', (select b from org), 'usub@test.local', 'Hola', 'Texto') $$,
  '42501', null, 'un admin no envía en una organización que no administra');
select throws_ok($$ select public.admin_preparar_notificacion('adma@test.local', null, 'usua@test.local', 'Hola', 'Texto') $$,
  '42501', null, 'la organización es obligatoria');
select throws_ok($$ select public.admin_preparar_notificacion('adma@test.local', (select a from org), 'usub@test.local', 'Hola', 'Texto') $$,
  'P0002', null, 'el destinatario tiene que ser miembro de la organización');
select throws_ok($$ select public.admin_preparar_notificacion('adma@test.local', (select a from org), 'usua@test.local', '  ', 'Texto') $$,
  '22023', null, 'el título es obligatorio');
select throws_ok($$ select public.admin_preparar_notificacion('adma@test.local', (select a from org), 'usua@test.local', 'Hola', repeat('x', 241)) $$,
  '22023', null, 'el texto no puede pasar de 240 caracteres');
select is((select count(*)::int from public.notificaciones_push), 0,
  'los intentos rechazados no dejan registro');

-- ─── Envío: feliz ───
create temp table prep as
  select public.admin_preparar_notificacion('adma@test.local', (select a from org), ' Usua@Test.Local ', ' Hola ', ' Mundo ') as r;
select is((select r->'notificacion'->>'estado' from prep), 'pendiente', 'queda pendiente hasta cerrar');
select is((select jsonb_array_length(r->'dispositivos') from prep), 2, 'devuelve los dos dispositivos del destinatario');
select is((select r->'notificacion'->>'titulo' from prep), 'Hola', 'el título se recorta');

create temp table prep_ids as
  select (select (r->'notificacion'->>'id')::uuid from prep) as n,
         (select (d->>'id')::uuid from prep, jsonb_array_elements(r->'dispositivos') d where d->>'endpoint' like '%/a1') as d1,
         (select (d->>'id')::uuid from prep, jsonb_array_elements(r->'dispositivos') d where d->>'endpoint' like '%/a2') as d2;

select throws_ok($$ select public.admin_cerrar_notificacion('admb@test.local', (select n from prep_ids), '{}', '{}') $$,
  'P0002', null, 'otro admin no puede cerrar la notificación');

select is((select public.admin_cerrar_notificacion('adma@test.local', (select n from prep_ids),
            array[(select d1 from prep_ids)], array[(select d2 from prep_ids)]) ->> 'estado'),
  'parcial', 'un envío exitoso y uno vencido queda parcial');
select is((select count(*)::int from public.dispositivos_push where email = 'usua@test.local'), 1,
  'el dispositivo vencido se borra');
select throws_ok($$ select public.admin_cerrar_notificacion('adma@test.local', (select n from prep_ids), '{}', '{}') $$,
  '55000', null, 'no se puede cerrar dos veces');

-- Sin dispositivos
select is((select public.admin_preparar_notificacion('admb@test.local', (select b from org), 'usub@test.local', 'Hola', 'Texto') -> 'notificacion' ->> 'estado'),
  'sin_dispositivos', 'un usuario sin dispositivos queda registrado como sin_dispositivos');

-- ─── Historial ───
select ok(public.admin_listar_notificaciones('adma@test.local') @> jsonb_build_array(jsonb_build_object('id', (select n from prep_ids))),
  'el admin de A ve su notificación');
select ok(not public.admin_listar_notificaciones('admb@test.local') @> jsonb_build_array(jsonb_build_object('id', (select n from prep_ids))),
  'el admin de B no ve notificaciones de A');

-- ─── Acceso cerrado ───
select ok(not has_function_privilege('authenticated', 'public.admin_preparar_notificacion(text, uuid, text, text, text)', 'execute')
      and not has_function_privilege('anon', 'public.admin_preparar_notificacion(text, uuid, text, text, text)', 'execute')
      and not has_table_privilege('authenticated', 'public.dispositivos_push', 'select')
      and not has_table_privilege('anon', 'public.notificaciones_push', 'select'),
  'anon y authenticated no acceden a las tablas ni a las funciones');

select * from finish();
rollback;
