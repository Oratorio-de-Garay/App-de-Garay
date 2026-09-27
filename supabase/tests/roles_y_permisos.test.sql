-- Reglas de roles, scope por organización y auditoría
-- (ver docs/ROLES_Y_PERMISOS.md). Correr con: supabase test db
-- Todo corre en una transacción que se descarta al final.
begin;
create extension if not exists pgtap with schema extensions;

select plan(32);

-- ─── Datos de prueba ───
-- Superadmin: lo siembra 20260926000000_roles_y_admin.
select ok(public.es_superadmin('oratoriogarayy@gmail.com'), 'la migración siembra el superadmin inicial');

select lives_ok($$ select public.superadmin_guardar_organizacion('oratoriogarayy@gmail.com', null, 'ZZ Test A') $$,
  'el superadmin crea una organización');
select lives_ok($$ select public.superadmin_guardar_organizacion('oratoriogarayy@gmail.com', null, 'ZZ Test B') $$,
  'el superadmin crea otra organización');

create temp table org as
  select (select id from public.organizaciones where nombre = 'ZZ Test A') as a,
         (select id from public.organizaciones where nombre = 'ZZ Test B') as b;

-- ─── Organizaciones ───
select throws_ok($$ select public.superadmin_guardar_organizacion('oratoriogarayy@gmail.com', null, '  zz test a ') $$,
  '23505', null, 'el nombre de organización es único sin importar mayúsculas ni espacios');
select throws_ok($$ select public.superadmin_guardar_organizacion('nadie@test.local', null, 'ZZ X') $$,
  '42501', null, 'sólo el superadmin crea organizaciones');

-- ─── Asignación de roles ───
select throws_ok($$ select public.superadmin_asignar_rol('oratoriogarayy@gmail.com', 'adm@test.local', null, 'admin', '{}') $$,
  '22023', null, 'el rol admin exige al menos una organización');
select throws_ok($$ select public.superadmin_asignar_rol('oratoriogarayy@gmail.com', 'adm@test.local', null, 'superadmin', '{}') $$,
  '42501', null, 'superadmin no se asigna desde el panel');
select lives_ok($$ select public.superadmin_asignar_rol('oratoriogarayy@gmail.com', 'adm@test.local', 'Admin A', 'admin', array[(select a from org)]) $$,
  'el superadmin asigna admin de A');
select lives_ok($$ select public.superadmin_asignar_rol('oratoriogarayy@gmail.com', 'adm2@test.local', null, 'admin', array[(select a from org)]) $$,
  'el superadmin asigna otro admin de A');
select is(public.contexto_usuario('adm@test.local')->'organizaciones_admin', to_jsonb(array[(select a from org)]),
  'el contexto del admin trae sólo la organización que administra');

-- ─── Alta de usuarios por un admin ───
select is(public.admin_alta_usuario('adm@test.local', ' M1@Test.Local ', 'M1', array[(select a from org)])->>'email',
  'm1@test.local', 'el admin da de alta un email en su organización (normalizado)');
select throws_ok($$ select public.admin_alta_usuario('adm@test.local', 'm2@test.local', null, array[(select b from org)]) $$,
  '42501', null, 'el admin no puede dar acceso a una organización que no administra');
select throws_ok($$ select public.admin_alta_usuario('adm@test.local', 'm3@test.local', null, '{}') $$,
  '22023', null, 'el alta exige al menos una organización');
select throws_ok($$ select public.admin_alta_usuario('adm@test.local', 'no-es-email', null, array[(select a from org)]) $$,
  '22023', null, 'el alta valida el formato del email');
select throws_ok($$ select public.admin_alta_usuario('m1@test.local', 'm9@test.local', null, array[(select a from org)]) $$,
  '42501', null, 'un miembro sin rol no puede dar de alta');

-- Un email que ya existe en otra organización: se le agrega el acceso.
select lives_ok($$ select public.admin_alta_usuario('oratoriogarayy@gmail.com', 'm4@test.local', null, array[(select b from org)]) $$,
  'el superadmin da de alta en B');
select is(public.admin_alta_usuario('adm@test.local', 'm4@test.local', null, array[(select a from org)])->>'organizaciones_agregadas',
  '1', 'el admin de A le agrega acceso a A a un usuario existente de B');
select public.admin_editar_usuario('adm@test.local', (select id from public.usuarios where email = 'm4@test.local'), null, '{}');
select is((select count(*) from public.organizacion_miembros where email = 'm4@test.local'), 1::bigint,
  'quitarle A no toca su membresía en B (fuera del scope del admin)');

-- ─── Protección entre admins ───
select throws_ok($$ select public.admin_editar_usuario('adm@test.local', (select id from public.usuarios where email = 'adm2@test.local'), 'x', array[(select a from org)]) $$,
  '42501', null, 'un admin no puede modificar a otro admin de su organización');
select throws_ok($$ select public.admin_alta_usuario('adm@test.local', 'oratoriogarayy@gmail.com', null, array[(select a from org)]) $$,
  '42501', null, 'un admin no puede modificar al superadmin');
select throws_ok($$ select public.superadmin_quitar_rol('oratoriogarayy@gmail.com', (select id from public.usuarios where email = 'oratoriogarayy@gmail.com'), 'superadmin') $$,
  '42501', null, 'superadmin no se quita desde el panel');

-- ─── Constraints declarativas ───
select throws_ok($$ insert into public.usuario_roles (email, rol, alcance, organizacion_id) values ('m1@test.local', 'admin', 'organizacion', null) $$,
  '23514', null, 'un rol por organización no puede quedar sin organización');
select throws_ok($$ insert into public.usuario_roles (email, rol, alcance, organizacion_id) values ('m1@test.local', 'admin', 'global', null) $$,
  '23503', null, 'no se puede declarar un alcance distinto al del catálogo');
select throws_ok($$ insert into public.usuario_roles (email, rol, alcance, organizacion_id) values ('m1@test.local', 'admin', 'organizacion', (select b from org)) $$,
  '23503', null, 'un rol por organización exige ser miembro de esa organización');

-- ─── Cascadas y reemplazo ───
select public.admin_editar_usuario('oratoriogarayy@gmail.com', (select id from public.usuarios where email = 'adm2@test.local'), null, array[(select b from org)]);
select is((select count(*) from public.usuario_roles where email = 'adm2@test.local'), 0::bigint,
  'al quitarle la membresía, el rol admin de esa organización cae solo');

select public.superadmin_asignar_rol('oratoriogarayy@gmail.com', 'adm@test.local', null, 'admin', array[(select a from org), (select b from org)]);
select public.superadmin_asignar_rol('oratoriogarayy@gmail.com', 'adm@test.local', null, 'admin', array[(select b from org)]);
select results_eq($$ select organizacion_id from public.usuario_roles where email = 'adm@test.local' $$,
  $$ select b from org $$, 'asignar un rol reemplaza sus organizaciones');

-- adm ahora administra sólo B y m1 está sólo en A: para él, m1 no existe.
select throws_ok($$ select public.admin_quitar_acceso('adm@test.local', (select id from public.usuarios where email = 'm1@test.local')) $$,
  'P0002', null, 'un usuario fuera del scope del admin se informa como inexistente');
select public.superadmin_asignar_rol('oratoriogarayy@gmail.com', 'adm@test.local', null, 'admin', array[(select a from org)]);
select is(public.admin_quitar_acceso('adm@test.local', (select id from public.usuarios where email = 'm1@test.local'))->>'eliminado',
  'true', 'quitar la última organización elimina al usuario');

-- ─── Auditoría ───
select ok((select count(*) from public.auditoria_admin where objetivo_email like '%@test.local') >= 10,
  'cada cambio deja su fila de auditoría');

-- ─── Acceso directo a la base (API de Supabase) ───
select ok(not has_table_privilege('anon', 'public.pibes', 'select')
      and not has_table_privilege('anon', 'public.asistencias', 'select')
      and not has_table_privilege('anon', 'public.usuarios', 'select'),
  'anon no puede leer pibes, asistencias ni usuarios');
select ok(not has_function_privilege('anon', 'public.buscar_pibes(text)', 'execute')
      and not has_function_privilege('authenticated', 'public.admin_alta_usuario(text,text,text,uuid[])', 'execute'),
  'anon no busca pibes y nadie llama a las funciones del panel desde el cliente');

create temp table vistos (quien text, n bigint);
grant all on vistos to authenticated;

set local role authenticated;
set local request.jwt.claims to '{"email": "desconocido@gmail.com", "role": "authenticated"}';
insert into vistos select 'desconocido', count(*) from public.pibes;
reset role;

select is((select n from vistos where quien = 'desconocido'), 0::bigint,
  'una cuenta de Google no registrada no ve ningún pibe');

select * from finish();
rollback;
