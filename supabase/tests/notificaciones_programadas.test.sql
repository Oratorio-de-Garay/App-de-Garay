-- Notificaciones push programadas: varios destinatarios, fecha futura, cancelar,
-- despachador (tomar vencidas / cerrar) y acceso cerrado a anon/authenticated
-- (ver docs/ROLES_Y_PERMISOS.md).
-- Correr con: supabase test db. Todo corre en una transacción que se descarta.
begin;
create extension if not exists pgtap with schema extensions;

select plan(41);

-- ─── Datos de prueba ───
-- A y B con un admin cada una. En A: usua (un dispositivo), usua2 y usua3 (sin
-- dispositivos). En B: usub.
select public.superadmin_guardar_organizacion('oratoriogarayy@gmail.com', null, 'ZZ Prog A');
select public.superadmin_guardar_organizacion('oratoriogarayy@gmail.com', null, 'ZZ Prog B');
create temp table org as
  select (select id from public.organizaciones where nombre = 'ZZ Prog A') as a,
         (select id from public.organizaciones where nombre = 'ZZ Prog B') as b;
select public.superadmin_asignar_rol('oratoriogarayy@gmail.com', 'adma@test.local', 'Admin A', 'admin', array[(select a from org)]);
select public.superadmin_asignar_rol('oratoriogarayy@gmail.com', 'admb@test.local', 'Admin B', 'admin', array[(select b from org)]);
select public.admin_alta_usuario('adma@test.local', 'usua@test.local', 'Usuario A', array[(select a from org)]);
select public.admin_alta_usuario('adma@test.local', 'usua2@test.local', 'Usuario A2', array[(select a from org)]);
select public.admin_alta_usuario('adma@test.local', 'usua3@test.local', 'Usuario A3', array[(select a from org)]);
select public.admin_alta_usuario('admb@test.local', 'usub@test.local', 'Usuario B', array[(select b from org)]);
select public.push_registrar_dispositivo('usua@test.local', 'https://push.test.local/p1', 'k1', 'a1', 'UA');
create temp table disp as select id from public.dispositivos_push where email = 'usua@test.local';

-- ─── Programar para varios ───
create temp table prog as
  select public.admin_crear_notificaciones('adma@test.local', (select a from org),
    array['usua@test.local', ' USUA2@test.local ', 'usua3@test.local', 'usub@test.local', 'usua@test.local'],
    ' Aviso ', ' Texto ', now() + interval '1 hour') as r;

select is((select jsonb_array_length(r->'items') from prog), 3,
  'se crea una notificación por destinatario válido (sin duplicados)');
select is((select r->'rechazados' from prog), '["usub@test.local"]'::jsonb,
  'el destinatario de otra organización se rechaza sin abortar el lote');
select is((select count(distinct i->'notificacion'->>'estado')::int from prog, jsonb_array_elements(r->'items') i), 1,
  'todas quedan en el mismo estado');
select is((select i->'notificacion'->>'estado' from prog, jsonb_array_elements(r->'items') i limit 1), 'programada',
  'con fecha quedan programadas');
select is((select count(distinct i->'notificacion'->>'lote_id')::int from prog, jsonb_array_elements(r->'items') i), 1,
  'comparten el lote');
select is((select i->'notificacion'->>'titulo' from prog, jsonb_array_elements(r->'items') i limit 1), 'Aviso',
  'el título se recorta');
select is((select jsonb_array_length(i->'dispositivos') from prog, jsonb_array_elements(r->'items') i limit 1), 0,
  'las programadas no devuelven dispositivos: se resuelven al enviar');

create temp table ids as
  select (select (i->'notificacion'->>'id')::uuid from prog, jsonb_array_elements(r->'items') i where i->'notificacion'->>'destinatario_email' = 'usua@test.local') as ua,
         (select (i->'notificacion'->>'id')::uuid from prog, jsonb_array_elements(r->'items') i where i->'notificacion'->>'destinatario_email' = 'usua2@test.local') as ua2,
         (select (i->'notificacion'->>'id')::uuid from prog, jsonb_array_elements(r->'items') i where i->'notificacion'->>'destinatario_email' = 'usua3@test.local') as ua3;

-- ─── Validaciones ───
select throws_ok($$ select public.admin_crear_notificaciones('adma@test.local', (select a from org), array['usua@test.local'], 'Hola', 'Texto', now() - interval '1 minute') $$,
  '22023', null, 'no se puede programar para una fecha pasada');
select throws_ok($$ select public.admin_crear_notificaciones('adma@test.local', (select a from org), array['usua@test.local'], 'Hola', 'Texto', now()) $$,
  '22023', null, 'no se puede programar para ahora mismo');
select throws_ok($$ select public.admin_crear_notificaciones('adma@test.local', (select a from org), '{}', 'Hola', 'Texto', now() + interval '1 hour') $$,
  '22023', null, 'hace falta al menos un destinatario');
select throws_ok($$ select public.admin_crear_notificaciones('adma@test.local', (select a from org),
    (select array_agg('u' || g || '@test.local') from generate_series(1, 51) g), 'Hola', 'Texto', now() + interval '1 hour') $$,
  '22023', null, 'hasta 50 destinatarios');
select throws_ok($$ select public.admin_crear_notificaciones('adma@test.local', (select a from org), array['usub@test.local'], 'Hola', 'Texto', now() + interval '1 hour') $$,
  'P0002', null, 'si ningún destinatario es válido es un error');
select throws_ok($$ select public.admin_crear_notificaciones('adma@test.local', (select b from org), array['usub@test.local'], 'Hola', 'Texto', now() + interval '1 hour') $$,
  '42501', null, 'un admin no programa en una organización que no administra');
select throws_ok($$ select public.admin_crear_notificaciones('usua@test.local', (select a from org), array['usua@test.local'], 'Hola', 'Texto', now() + interval '1 hour') $$,
  '42501', null, 'quien no es admin no programa');
select throws_ok($$ select public.admin_crear_notificaciones('adma@test.local', (select a from org), array['usua@test.local'], '  ', 'Texto', now() + interval '1 hour') $$,
  '22023', null, 'el título es obligatorio');
select is((select count(*)::int from public.notificaciones_push
           where organizacion_id in (select a from org union select b from org)
             and lote_id <> (select (r->>'lote_id')::uuid from prog)), 0,
  'los intentos rechazados no dejan registros');

-- ─── Inmediata para varios ───
create temp table inm as
  select public.admin_crear_notificaciones('adma@test.local', (select a from org),
    array['usua@test.local', 'usua3@test.local'], 'Ya', 'Ahora') as r;
select is((select count(*)::int from inm, jsonb_array_elements(r->'items') i where i->'notificacion'->>'estado' = 'pendiente'), 1,
  'sin fecha, el usuario con dispositivos queda pendiente para enviar ahora');
select is((select count(*)::int from inm, jsonb_array_elements(r->'items') i where i->'notificacion'->>'estado' = 'sin_dispositivos'), 1,
  'sin fecha, el usuario sin dispositivos queda sin_dispositivos');

-- ─── Cancelar ───
create temp table prog2 as
  select public.admin_crear_notificaciones('adma@test.local', (select a from org),
    array['usua@test.local'], 'Cancelar', 'Texto', now() + interval '2 hours') as r;
create temp table cancelar as
  select (select (i->'notificacion'->>'id')::uuid from prog2, jsonb_array_elements(r->'items') i) as id;

select throws_ok($$ select public.admin_cancelar_notificacion('admb@test.local', (select id from cancelar)) $$,
  'P0002', null, 'otro admin no puede cancelar');
select is((select public.admin_cancelar_notificacion('adma@test.local', (select id from cancelar)) ->> 'estado'),
  'cancelada', 'el admin cancela una programada');
select throws_ok($$ select public.admin_cancelar_notificacion('adma@test.local', (select id from cancelar)) $$,
  '55000', null, 'no se cancela dos veces');
select throws_ok($$ select public.admin_cancelar_notificacion('adma@test.local', (select (i->'notificacion'->>'id')::uuid from inm, jsonb_array_elements(r->'items') i limit 1)) $$,
  '55000', null, 'una inmediata no se puede cancelar');

-- ─── Despachador ───
select is(public.push_tomar_vencidas(), '[]'::jsonb, 'no toma las que todavía no vencieron');

-- Vencen las tres programadas del lote; usua2 pierde el acceso a la organización.
update public.notificaciones_push set programada_para = now() - interval '1 minute'
  where id in (select ua from ids union select ua2 from ids union select ua3 from ids);
delete from public.organizacion_miembros where email = 'usua2@test.local';

create temp table toma as select public.push_tomar_vencidas() as r;
select is((select jsonb_array_length(r) from toma), 1, 'sólo devuelve la que tiene dispositivos para enviar');
select is((select r->0->'notificacion'->>'destinatario_email' from toma), 'usua@test.local', 'devuelve la del usuario con dispositivos');
select is((select jsonb_array_length(r->0->'dispositivos') from toma), 1, 'con sus dispositivos actuales');
select is((select estado from public.notificaciones_push where id = (select ua from ids)), 'enviando', 'la tomada queda enviando');
select is((select estado from public.notificaciones_push where id = (select ua3 from ids)), 'sin_dispositivos', 'sin dispositivos queda sin_dispositivos');
select is((select estado from public.notificaciones_push where id = (select ua2 from ids)), 'fallida', 'si perdió el acceso a la organización no se envía');
select ok((select motivo from public.notificaciones_push where id = (select ua2 from ids)) is not null, 'queda el motivo');
select is(public.push_tomar_vencidas(), '[]'::jsonb, 'una segunda toma no duplica el envío');

select is((select public.push_cerrar_programada((select ua from ids), array[(select id from disp)], '{}') ->> 'estado'),
  'enviada', 'cerrar con éxito deja enviada');
select throws_ok($$ select public.push_cerrar_programada((select ua from ids), '{}', '{}') $$,
  'P0002', null, 'no se cierra dos veces');

-- Rescate de una "enviando" abandonada (la función murió a mitad).
create temp table prog3 as
  select public.admin_crear_notificaciones('adma@test.local', (select a from org),
    array['usua@test.local'], 'Rescate', 'Texto', now() + interval '3 hours') as r;
update public.notificaciones_push
  set estado = 'enviando', tomada_at = now() - interval '11 minutes', programada_para = now() - interval '1 hour'
  where id = (select (i->'notificacion'->>'id')::uuid from prog3, jsonb_array_elements(r->'items') i);
select is((select jsonb_array_length(public.push_tomar_vencidas())), 1, 'una enviando abandonada vuelve a la cola y se retoma');

-- ─── Auditoría e historial ───
select ok((select count(*) from public.auditoria_admin where accion = 'notificacion_programada') >= 4, 'programar queda auditado');
select ok((select count(*) from public.auditoria_admin where accion = 'notificacion_cancelada') = 1, 'cancelar queda auditado');
select ok(public.admin_listar_notificaciones('adma@test.local') @> jsonb_build_array(jsonb_build_object('id', (select id from cancelar), 'estado', 'cancelada')),
  'el historial muestra la cancelada');
select ok(not public.admin_listar_notificaciones('admb@test.local') @> jsonb_build_array(jsonb_build_object('id', (select ua from ids))),
  'el admin de B no ve notificaciones de A');

-- ─── Acceso cerrado ───
select ok(not has_function_privilege('authenticated', 'public.admin_crear_notificaciones(text, uuid, text[], text, text, timestamptz)', 'execute')
      and not has_function_privilege('anon', 'public.admin_crear_notificaciones(text, uuid, text[], text, text, timestamptz)', 'execute')
      and not has_function_privilege('anon', 'public.admin_cancelar_notificacion(text, uuid)', 'execute')
      and not has_function_privilege('authenticated', 'public.admin_cancelar_notificacion(text, uuid)', 'execute'),
  'anon y authenticated no ejecutan crear ni cancelar');
select ok(not has_function_privilege('authenticated', 'public.push_tomar_vencidas(integer)', 'execute')
      and not has_function_privilege('anon', 'public.push_tomar_vencidas(integer)', 'execute')
      and not has_function_privilege('authenticated', 'public.push_cerrar_programada(uuid, uuid[], uuid[])', 'execute')
      and not has_function_privilege('anon', 'public.push_cerrar_programada(uuid, uuid[], uuid[])', 'execute'),
  'anon y authenticated no ejecutan el despachador');
select ok(has_function_privilege('service_role', 'public.push_tomar_vencidas(integer)', 'execute')
      and not has_function_privilege('service_role', 'public.despachar_notificaciones_programadas()', 'execute')
      and not has_function_privilege('authenticated', 'public.despachar_notificaciones_programadas()', 'execute'),
  'el backend ejecuta el despachador y nadie de la API ejecuta el disparador del cron');

select * from finish();
rollback;
