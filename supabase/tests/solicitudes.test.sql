-- Solicitudes de registro: creación, scope de quién las ve y resuelve,
-- aceptación, rechazo y cancelación (ver docs/ROLES_Y_PERMISOS.md).
-- Correr con: supabase test db. Todo corre en una transacción que se descarta.
begin;
create extension if not exists pgtap with schema extensions;

select plan(37);

-- ─── Datos de prueba ───
-- Dos organizaciones, un admin de cada una y el superadmin de la migración.
select public.superadmin_guardar_organizacion('oratoriogarayy@gmail.com', null, 'ZZ Sol A');
select public.superadmin_guardar_organizacion('oratoriogarayy@gmail.com', null, 'ZZ Sol B');
create temp table org as
  select (select id from public.organizaciones where nombre = 'ZZ Sol A') as a,
         (select id from public.organizaciones where nombre = 'ZZ Sol B') as b;
select public.superadmin_asignar_rol('oratoriogarayy@gmail.com', 'adma@test.local', 'Admin A', 'admin', array[(select a from org)]);
select public.superadmin_asignar_rol('oratoriogarayy@gmail.com', 'admb@test.local', 'Admin B', 'admin', array[(select b from org)]);

-- ─── Estado inicial y creación ───
select is(public.registro_estado('nuevo1@test.local')->>'registrado', 'false',
  'una cuenta nueva no está registrada');
select ok(jsonb_array_length(public.registro_estado('nuevo1@test.local')->'espacios') >= 2,
  'la pantalla de registro lista los espacios');

create temp table r1 as
  select public.registro_crear_solicitud(' Nuevo1@Test.Local ', 'Nuevo Uno', (select a from org), null) as r;
select is((select r->'solicitud'->>'estado' from r1), 'pendiente', 'se crea la solicitud pendiente');
select is((select r->'solicitud'->>'solicitante_email' from r1), 'nuevo1@test.local', 'el email se normaliza');
select ok((select r->'notificar' ? 'adma@test.local' and r->'notificar' ? 'oratoriogarayy@gmail.com'
                  and not r->'notificar' ? 'admb@test.local' from r1),
  'se avisa a los admins del espacio y a los superadmins, no a admins de otros espacios');

select throws_ok($$ select public.registro_crear_solicitud('nuevo1@test.local', 'Otra', (select b from org), null) $$,
  '23505', null, 'no se puede tener dos solicitudes pendientes');
select throws_ok($$ select public.registro_crear_solicitud('nuevo2@test.local', 'X', (select a from org), 'Algo') $$,
  '22023', null, 'hay que elegir un espacio o uno nuevo, no los dos');
select throws_ok($$ select public.registro_crear_solicitud('nuevo2@test.local', 'X', null, null) $$,
  '22023', null, 'hay que elegir algún espacio');
select throws_ok($$ select public.registro_crear_solicitud('nuevo2@test.local', '  ', (select a from org), null) $$,
  '22023', null, 'el nombre es obligatorio');
select throws_ok($$ select public.registro_crear_solicitud('nuevo2@test.local', 'X', null, '  zz sol a ') $$,
  '23505', null, 'no se puede pedir crear un espacio que ya existe');
select throws_ok($$ select public.registro_crear_solicitud('adma@test.local', 'X', (select b from org), null) $$,
  '55000', null, 'quien ya tiene acceso no puede pedir registro');

create temp table r2 as
  select public.registro_crear_solicitud('nuevo2@test.local', 'Nuevo Dos', null, 'ZZ Espacio Nuevo') as r;
select ok((select r->'notificar' ? 'oratoriogarayy@gmail.com' and not r->'notificar' ? 'adma@test.local' from r2),
  'un espacio nuevo sólo se avisa a los superadmins');

create temp table ids as
  select (select (r->'solicitud'->>'id')::uuid from r1) as s1,
         (select (r->'solicitud'->>'id')::uuid from r2) as s2;

-- ─── Scope ───
select ok(public.admin_listar_solicitudes('adma@test.local') @> jsonb_build_array(jsonb_build_object('id', (select s1 from ids))),
  'el admin de A ve la solicitud para sumarse a A');
select ok(not public.admin_listar_solicitudes('admb@test.local') @> jsonb_build_array(jsonb_build_object('id', (select s1 from ids))),
  'el admin de B no ve la solicitud para sumarse a A');
select ok(not public.admin_listar_solicitudes('adma@test.local') @> jsonb_build_array(jsonb_build_object('id', (select s2 from ids))),
  'un admin no ve los pedidos de espacio nuevo');
select ok(public.admin_listar_solicitudes('oratoriogarayy@gmail.com') @> jsonb_build_array(
            jsonb_build_object('id', (select s1 from ids)), jsonb_build_object('id', (select s2 from ids))),
  'el superadmin ve todas');
select throws_ok($$ select public.admin_listar_solicitudes('nuevo1@test.local') $$,
  '42501', null, 'alguien sin rol no lista solicitudes');
select throws_ok($$ select public.admin_tomar_solicitud('admb@test.local', (select s1 from ids)) $$,
  'P0002', null, 'fuera de scope, tomarla la informa como inexistente');
select throws_ok($$ select public.admin_resolver_solicitud('admb@test.local', (select s1 from ids), 'aceptar', null) $$,
  'P0002', null, 'fuera de scope, resolverla la informa como inexistente');
select throws_ok($$ select public.admin_resolver_solicitud('adma@test.local', (select s2 from ids), 'aceptar', null) $$,
  'P0002', null, 'un admin no puede resolver un espacio nuevo');

-- ─── Tomar y cancelar ───
select is(public.admin_tomar_solicitud('adma@test.local', (select s1 from ids))->>'aprobador_email', 'adma@test.local',
  'tomar la solicitud deja al actor como aprobador');
select throws_ok($$ select public.registro_cancelar_solicitud('nuevo1@test.local', (select s1 from ids)) $$,
  '55000', null, 'no se puede cancelar una solicitud que ya tomaron');
select throws_ok($$ select public.registro_cancelar_solicitud('otro@test.local', (select s2 from ids)) $$,
  'P0002', null, 'no se puede cancelar una solicitud ajena');
select is(public.admin_tomar_solicitud('oratoriogarayy@gmail.com', (select s1 from ids))->>'aprobador_email', 'oratoriogarayy@gmail.com',
  'otro aprobador puede reasignársela');

-- ─── Aceptar: sumarse a un espacio ───
select is(public.admin_resolver_solicitud('adma@test.local', (select s1 from ids), 'aceptar', 'Bienvenido')->>'estado', 'aceptada',
  'el admin de A acepta la solicitud');
select ok(exists (select 1 from public.organizacion_miembros where email = 'nuevo1@test.local' and organizacion_id = (select a from org))
          and (select nombre from public.usuarios where email = 'nuevo1@test.local') = 'Nuevo Uno',
  'al aceptar, el usuario queda registrado con su nombre y miembro de A');
select is((select u.email from public.solicitudes s join public.usuarios u on u.id = s.aprobador_id where s.id = (select s1 from ids)),
  'adma@test.local', 'quien resuelve queda como aprobador');
select throws_ok($$ select public.admin_resolver_solicitud('oratoriogarayy@gmail.com', (select s1 from ids), 'rechazar', null) $$,
  '55000', null, 'una solicitud resuelta no se puede volver a resolver');

-- ─── Aceptar: espacio nuevo ───
select public.admin_resolver_solicitud('oratoriogarayy@gmail.com', (select s2 from ids), 'aceptar', null, null, ' ZZ Espacio Corregido ');
select ok(exists (select 1 from public.organizaciones where nombre = 'ZZ Espacio Corregido'),
  'el superadmin crea el espacio con el nombre corregido');
select ok(exists (select 1 from public.usuario_roles r join public.organizaciones o on o.id = r.organizacion_id
                  where r.email = 'nuevo2@test.local' and r.rol = 'admin' and o.nombre = 'ZZ Espacio Corregido'),
  'quien pidió el espacio nuevo queda como admin');

-- El espacio ya existía: se asigna a uno existente, sin rol admin.
create temp table r3 as
  select public.registro_crear_solicitud('nuevo3@test.local', 'Nuevo Tres', null, 'ZZ Sol B bis') as r;
select public.admin_resolver_solicitud('oratoriogarayy@gmail.com', (select (r->'solicitud'->>'id')::uuid from r3),
  'aceptar', 'Ya existía', (select b from org), null);
select ok(exists (select 1 from public.organizacion_miembros where email = 'nuevo3@test.local' and organizacion_id = (select b from org))
          and not exists (select 1 from public.usuario_roles where email = 'nuevo3@test.local')
          and not exists (select 1 from public.organizaciones where nombre = 'ZZ Sol B bis'),
  'asignado a un espacio existente: miembro sin rol y no se crea otro espacio');

-- ─── Rechazar, volver a pedir y cancelar ───
create temp table r4 as
  select public.registro_crear_solicitud('nuevo4@test.local', 'Nuevo Cuatro', (select b from org), null) as r;
select is(public.admin_resolver_solicitud('admb@test.local', (select (r->'solicitud'->>'id')::uuid from r4), 'rechazar', 'No te conocemos')->>'comentario_aprobador',
  'No te conocemos', 'el rechazo guarda el comentario');
select ok(not exists (select 1 from public.usuarios where email = 'nuevo4@test.local'),
  'rechazar no da acceso');
create temp table r5 as
  select public.registro_crear_solicitud('nuevo4@test.local', 'Nuevo Cuatro', (select a from org), null) as r;
select is(public.registro_cancelar_solicitud('nuevo4@test.local', (select (r->'solicitud'->>'id')::uuid from r5))->>'estado',
  'cancelada', 'después de un rechazo puede volver a pedir, y cancelar si nadie la tomó');

-- ─── Auditoría ───
select ok((select count(distinct accion) from public.auditoria_admin
           where accion in ('solicitud_creada', 'solicitud_aceptada', 'solicitud_rechazada', 'solicitud_cancelada')) = 4,
  'crear, aceptar, rechazar y cancelar quedan en la auditoría');

-- ─── Acceso directo a la base (API de Supabase) ───
select ok(not has_table_privilege('anon', 'public.solicitudes', 'select')
      and not has_table_privilege('authenticated', 'public.solicitudes', 'select'),
  'desde el cliente nadie lee solicitudes');
select ok(not has_function_privilege('authenticated', 'public.registro_crear_solicitud(text,text,uuid,text)', 'execute')
      and not has_function_privilege('authenticated', 'public.admin_resolver_solicitud(text,uuid,text,text,uuid,text)', 'execute'),
  'desde el cliente nadie llama a las funciones de solicitudes');

select * from finish();
rollback;
