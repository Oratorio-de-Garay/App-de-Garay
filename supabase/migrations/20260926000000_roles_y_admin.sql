-- Roles y panel de administración.
--
-- Hasta acá el acceso se manejaba a mano por SQL: allowed_emails (quién puede
-- loguearse) + organizacion_miembros (a qué organizaciones). Esta migración:
--
--   1. Convierte allowed_emails en public.usuarios (mismo contenido, más datos).
--   2. Agrega un catálogo de roles (public.roles) y la asignación de roles a
--      usuarios (public.usuario_roles), con roles globales (superadmin) y roles
--      por organización (admin).
--   3. Agrega una tabla de auditoría de las acciones de administración.
--   4. Agrega las funciones que usa el panel de administración. Toda la lógica
--      de permisos y de scope vive acá, en la base: el backend sólo decide quién
--      puede entrar a cada endpoint y delega en estas funciones, que además
--      hacen cada operación en una única transacción junto con su auditoría.
--
-- Ver docs/ROLES_Y_PERMISOS.md para el modelo completo.

-- ─────────────────────────────────────────────────────────
-- 1. usuarios (ex allowed_emails)
-- ─────────────────────────────────────────────────────────

do $$
begin
  -- Sólo si allowed_emails todavía es la tabla (después pasa a ser una vista
  -- de compatibilidad, ver más abajo).
  if exists (select 1 from pg_class where oid = to_regclass('public.allowed_emails') and relkind = 'r')
     and to_regclass('public.usuarios') is null then
    alter table public.allowed_emails rename to usuarios;
  end if;
  -- note se usaba para anotar de quién es el email: es el nombre.
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'usuarios' and column_name = 'note') then
    alter table public.usuarios rename column note to nombre;
  end if;
  if exists (select 1 from pg_constraint where conname = 'allowed_emails_pkey') then
    alter table public.usuarios rename constraint allowed_emails_pkey to usuarios_pkey;
  end if;
end $$;

-- id: identificador estable para usar en las URLs de la API sin exponer emails.
alter table public.usuarios
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists created_by text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists usuarios_id_key on public.usuarios (id);

drop trigger if exists trg_normalize_allowed_email on public.usuarios;
drop trigger if exists trg_normalize_usuario_email on public.usuarios;
create trigger trg_normalize_usuario_email
  before insert or update on public.usuarios
  for each row execute function public.normalize_allowed_email();

drop trigger if exists usuarios_updated_at on public.usuarios;
create trigger usuarios_updated_at before update on public.usuarios
  for each row execute function public.set_updated_at();

-- Compatibilidad TEMPORAL: el backend desplegado antes de este cambio consulta
-- allowed_emails. Sin esta vista, entre que se aplica la migración y se
-- despliega el backend nuevo nadie podría loguearse. security_invoker para que
-- no saltee RLS, y sólo legible por service_role.
-- Borrarla (drop view public.allowed_emails) en una migración posterior al deploy.
create or replace view public.allowed_emails with (security_invoker = true) as
  select email, nombre as note, created_at from public.usuarios;
revoke all on public.allowed_emails from public, anon, authenticated;
grant select on public.allowed_emails to service_role;

-- ─────────────────────────────────────────────────────────
-- 2. organizacion_miembros: membresía = puede ver los datos de esa organización
-- ─────────────────────────────────────────────────────────

-- Toda membresía tiene que pertenecer a un usuario. Hoy no hay huérfanos, pero
-- la migración tiene que poder correr igual sobre cualquier base.
insert into public.usuarios (email)
select distinct m.email from public.organizacion_miembros m
where not exists (select 1 from public.usuarios u where u.email = m.email)
on conflict do nothing;

alter table public.organizacion_miembros drop constraint if exists organizacion_miembros_email_fkey;
alter table public.organizacion_miembros
  add constraint organizacion_miembros_email_fkey
  foreign key (email) references public.usuarios(email) on delete cascade;

-- La columna rol nunca se leyó: los roles pasan a public.usuario_roles. Se
-- borra para que no convivan dos fuentes de verdad.
alter table public.organizacion_miembros drop column if exists rol;
alter table public.organizacion_miembros add column if not exists created_by text;

-- ─────────────────────────────────────────────────────────
-- 3. Catálogo de roles
--
-- alcance = 'global'        → el rol no lleva organización (ej: superadmin).
-- alcance = 'organizacion'  → el rol se asigna por organización (ej: admin).
-- Un rol nuevo es un insert acá; el panel lo ofrece si asignable_desde_panel.
-- ─────────────────────────────────────────────────────────

create table if not exists public.roles (
  codigo text primary key,
  nombre text not null,
  descripcion text,
  alcance text not null check (alcance in ('global', 'organizacion')),
  asignable_desde_panel boolean not null default true,
  created_at timestamptz not null default now(),
  -- Destino del FK compuesto de usuario_roles (rol, alcance).
  unique (codigo, alcance)
);

insert into public.roles (codigo, nombre, descripcion, alcance, asignable_desde_panel) values
  ('superadmin', 'Superadministrador',
   'Administra todas las organizaciones, asigna roles y gestiona organizaciones.', 'global', false),
  ('admin', 'Administrador',
   'Da de alta y modifica usuarios de las organizaciones que administra.', 'organizacion', true)
on conflict (codigo) do update
  set nombre = excluded.nombre,
      descripcion = excluded.descripcion,
      asignable_desde_panel = excluded.asignable_desde_panel;

-- ─────────────────────────────────────────────────────────
-- 4. Roles asignados
-- ─────────────────────────────────────────────────────────

create table if not exists public.usuario_roles (
  id uuid primary key default gen_random_uuid(),
  email text not null references public.usuarios(email) on delete cascade,
  rol text not null,
  -- Copia del alcance del rol: el FK compuesto garantiza que coincida con el
  -- del catálogo, y así el check de abajo puede validarlo sin subconsultas.
  alcance text not null,
  organizacion_id uuid,
  created_at timestamptz not null default now(),
  created_by text,
  constraint usuario_roles_rol_fkey
    foreign key (rol, alcance) references public.roles(codigo, alcance),
  -- Un rol por organización exige ser miembro de esa organización, y si se le
  -- quita la membresía el rol cae solo. Con organizacion_id nulo (rol global)
  -- Postgres no evalúa este FK (MATCH SIMPLE).
  constraint usuario_roles_membresia_fkey
    foreign key (email, organizacion_id)
    references public.organizacion_miembros(email, organizacion_id) on delete cascade,
  constraint usuario_roles_alcance_check
    check ((alcance = 'organizacion') = (organizacion_id is not null))
);

-- Dos índices parciales: en un único normal cada nulo cuenta como distinto y
-- permitiría repetir un rol global.
create unique index if not exists usuario_roles_global_key
  on public.usuario_roles (email, rol) where organizacion_id is null;
create unique index if not exists usuario_roles_org_key
  on public.usuario_roles (email, rol, organizacion_id) where organizacion_id is not null;
create index if not exists usuario_roles_org_idx on public.usuario_roles (organizacion_id);

drop trigger if exists trg_normalize_usuario_rol_email on public.usuario_roles;
create trigger trg_normalize_usuario_rol_email
  before insert or update on public.usuario_roles
  for each row execute function public.normalize_allowed_email();

-- ─────────────────────────────────────────────────────────
-- 5. organizaciones: nombre único sin importar mayúsculas ni espacios
-- ─────────────────────────────────────────────────────────

create unique index if not exists organizaciones_nombre_ci_key
  on public.organizaciones (lower(trim(nombre)));

-- ─────────────────────────────────────────────────────────
-- 6. Auditoría
--
-- Una fila por cambio atómico. organizacion_id es la organización afectada
-- (nulo si el cambio no es de una organización, ej: renombrar un usuario): es
-- lo que define qué admins pueden ver cada fila.
-- ─────────────────────────────────────────────────────────

create table if not exists public.auditoria_admin (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_email text not null,
  accion text not null check (accion in (
    'usuario_creado', 'usuario_renombrado', 'usuario_eliminado',
    'membresia_agregada', 'membresia_quitada',
    'rol_asignado', 'rol_quitado',
    'organizacion_creada', 'organizacion_renombrada'
  )),
  objetivo_email text,
  organizacion_id uuid references public.organizaciones(id) on delete set null,
  detalle jsonb not null default '{}'::jsonb
);

create index if not exists auditoria_admin_fecha_idx on public.auditoria_admin (created_at desc);
create index if not exists auditoria_admin_org_idx on public.auditoria_admin (organizacion_id);

-- ─────────────────────────────────────────────────────────
-- 7. Helpers de permisos
--
-- Reciben el email por parámetro para poder usarse tanto desde el backend (que
-- consulta con la service role) como desde RLS (con auth.jwt()).
-- security definer: leen usuario_roles salteando su RLS.
-- ─────────────────────────────────────────────────────────

create or replace function public.es_superadmin(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.usuario_roles
    where email = lower(trim(p_email)) and rol = 'superadmin'
  )
$$;

-- Organizaciones sobre las que el usuario tiene permisos de admin: todas si es
-- superadmin (el superadmin puede hacer todo lo que hace un admin).
create or replace function public.organizaciones_administradas(p_email text)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select o.id from public.organizaciones o
  where public.es_superadmin(p_email)
  union
  select r.organizacion_id from public.usuario_roles r
  where r.email = lower(trim(p_email)) and r.rol = 'admin' and r.organizacion_id is not null
$$;

-- Todo lo que necesita el middleware del backend en una sola consulta.
create or replace function public.contexto_usuario(p_email text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when u.email is null then jsonb_build_object('registrado', false) else jsonb_build_object(
    'registrado', true,
    'id', u.id,
    'nombre', u.nombre,
    'organizaciones', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.nombre) order by o.nombre)
      from public.organizacion_miembros m
      join public.organizaciones o on o.id = m.organizacion_id
      where m.email = u.email
    ), '[]'::jsonb),
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object('rol', r.rol, 'organizacion_id', r.organizacion_id))
      from public.usuario_roles r
      where r.email = u.email
    ), '[]'::jsonb),
    'es_superadmin', public.es_superadmin(u.email),
    'organizaciones_admin', coalesce((
      select jsonb_agg(a.id) from public.organizaciones_administradas(u.email) as a(id)
    ), '[]'::jsonb)
  ) end
  from (select 1) as uno
  left join public.usuarios u on u.email = lower(trim(p_email))
$$;

-- ─────────────────────────────────────────────────────────
-- 8. Helpers internos de las funciones del panel
--
-- Errores: se usan SQLSTATE específicos que el backend traduce a HTTP.
--   42501 → 403 (sin permiso)        22023 → 400 (dato inválido)
--   P0002 → 404 (no encontrado)      23505 → 409 (duplicado)
-- ─────────────────────────────────────────────────────────

create or replace function public.email_normalizado(p_email text)
returns text
language plpgsql
immutable
as $$
declare
  v text := lower(trim(coalesce(p_email, '')));
begin
  if v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'El email "%" no es válido', coalesce(p_email, '') using errcode = '22023';
  end if;
  return v;
end $$;

-- Scope del actor. Falla si no es admin de nada ni superadmin.
create or replace function public.exigir_admin(p_actor text)
returns uuid[]
language plpgsql
stable
as $$
declare
  v_scope uuid[];
begin
  select coalesce(array_agg(a.id), '{}') into v_scope
  from public.organizaciones_administradas(p_actor) as a(id);

  if cardinality(v_scope) = 0 and not public.es_superadmin(p_actor) then
    raise exception 'No tenés permisos de administración' using errcode = '42501';
  end if;
  return v_scope;
end $$;

create or replace function public.exigir_superadmin(p_actor text)
returns void
language plpgsql
stable
as $$
begin
  if not public.es_superadmin(p_actor) then
    raise exception 'Sólo un superadmin puede hacer esto' using errcode = '42501';
  end if;
end $$;

-- Un admin no puede modificar a un superadmin ni a otro admin de las
-- organizaciones que administra: eso queda reservado al superadmin.
create or replace function public.usuario_protegido_para(p_actor text, p_objetivo text)
returns boolean
language sql
stable
as $$
  select not public.es_superadmin(p_actor) and (
    public.es_superadmin(p_objetivo)
    or exists (
      select 1 from public.usuario_roles r
      where r.email = lower(trim(p_objetivo))
        and r.rol = 'admin'
        and r.organizacion_id in (select public.organizaciones_administradas(p_actor))
    )
  )
$$;

create or replace function public.registrar_auditoria(
  p_actor text, p_accion text, p_objetivo text, p_org uuid, p_detalle jsonb default '{}'::jsonb
)
returns void
language sql
as $$
  insert into public.auditoria_admin (actor_email, accion, objetivo_email, organizacion_id, detalle)
  values (p_actor, p_accion, p_objetivo, p_org, coalesce(p_detalle, '{}'::jsonb))
$$;

-- Un usuario sin organizaciones y sin rol global no tiene nada que hacer en la
-- app: se lo borra para que vuelva a ver "acceso no autorizado".
create or replace function public.limpiar_usuario_sin_acceso(p_actor text, p_email text)
returns boolean
language plpgsql
as $$
begin
  if exists (select 1 from public.organizacion_miembros where email = p_email)
     or exists (select 1 from public.usuario_roles where email = p_email and organizacion_id is null) then
    return false;
  end if;

  delete from public.usuarios where email = p_email;
  perform public.registrar_auditoria(p_actor, 'usuario_eliminado', p_email, null);
  return true;
end $$;

-- Deja sin nulos ni repetidos la lista de organizaciones que manda el cliente.
create or replace function public.lista_organizaciones(p_organizaciones uuid[])
returns uuid[]
language sql
immutable
as $$
  select coalesce(array_agg(distinct o), '{}')
  from unnest(coalesce(p_organizaciones, '{}')) as o
  where o is not null
$$;

-- ─────────────────────────────────────────────────────────
-- 9. Funciones del panel: usuarios (admin y superadmin)
-- ─────────────────────────────────────────────────────────

-- Alta: habilita un email en una o más organizaciones del scope del actor.
-- Si el email ya existía (ej: es de otra organización) le agrega el acceso.
create or replace function public.admin_alta_usuario(
  p_actor text, p_email text, p_nombre text, p_organizaciones uuid[]
)
returns jsonb
language plpgsql
as $$
declare
  v_actor text := lower(trim(p_actor));
  v_email text := public.email_normalizado(p_email);
  v_nombre text := nullif(trim(coalesce(p_nombre, '')), '');
  v_orgs uuid[] := public.lista_organizaciones(p_organizaciones);
  v_scope uuid[] := public.exigir_admin(v_actor);
  v_usuario public.usuarios;
  v_creado boolean := false;
  v_agregadas int;
begin
  if cardinality(v_orgs) = 0 then
    raise exception 'Elegí al menos una organización' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_orgs) o where o <> all(v_scope)) then
    raise exception 'No podés dar acceso a organizaciones que no administrás' using errcode = '42501';
  end if;

  select * into v_usuario from public.usuarios where email = v_email for update;

  if not found then
    insert into public.usuarios (email, nombre, created_by)
    values (v_email, v_nombre, v_actor)
    returning * into v_usuario;
    v_creado := true;
    perform public.registrar_auditoria(v_actor, 'usuario_creado', v_email, null,
      jsonb_build_object('nombre', v_nombre));
  else
    if public.usuario_protegido_para(v_actor, v_email) then
      raise exception 'Sólo un superadmin puede modificar a otro administrador' using errcode = '42501';
    end if;
    if v_usuario.nombre is null and v_nombre is not null then
      update public.usuarios set nombre = v_nombre where email = v_email;
    end if;
  end if;

  with nuevas as (
    insert into public.organizacion_miembros (email, organizacion_id, created_by)
    select v_email, o, v_actor from unnest(v_orgs) o
    on conflict do nothing
    returning organizacion_id
  )
  insert into public.auditoria_admin (actor_email, accion, objetivo_email, organizacion_id)
  select v_actor, 'membresia_agregada', v_email, organizacion_id from nuevas;
  get diagnostics v_agregadas = row_count;

  return jsonb_build_object(
    'id', v_usuario.id,
    'email', v_email,
    'creado', v_creado,
    'organizaciones_agregadas', v_agregadas
  );
end $$;

-- Edición: nombre y organizaciones. Sólo reemplaza las membresías dentro del
-- scope del actor; las de otras organizaciones no se tocan (ni se ven).
-- p_nombre nulo = no cambiar el nombre.
create or replace function public.admin_editar_usuario(
  p_actor text, p_id uuid, p_nombre text, p_organizaciones uuid[]
)
returns jsonb
language plpgsql
as $$
declare
  v_actor text := lower(trim(p_actor));
  v_orgs uuid[] := public.lista_organizaciones(p_organizaciones);
  v_scope uuid[] := public.exigir_admin(v_actor);
  v_super boolean := public.es_superadmin(v_actor);
  v_usuario public.usuarios;
  v_nombre text;
  v_eliminado boolean;
begin
  select * into v_usuario from public.usuarios where id = p_id for update;

  -- Un usuario fuera del scope se reporta como inexistente: un admin no tiene
  -- por qué enterarse de quién está en otras organizaciones.
  if not found or (not v_super and not exists (
    select 1 from public.organizacion_miembros m
    where m.email = v_usuario.email and m.organizacion_id = any(v_scope)
  )) then
    raise exception 'Usuario no encontrado' using errcode = 'P0002';
  end if;

  if public.usuario_protegido_para(v_actor, v_usuario.email) then
    raise exception 'Sólo un superadmin puede modificar a otro administrador' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(v_orgs) o where o <> all(v_scope)) then
    raise exception 'No podés dar acceso a organizaciones que no administrás' using errcode = '42501';
  end if;

  if p_nombre is not null then
    v_nombre := nullif(trim(p_nombre), '');
    if v_nombre is distinct from v_usuario.nombre then
      update public.usuarios set nombre = v_nombre where id = p_id;
      perform public.registrar_auditoria(v_actor, 'usuario_renombrado', v_usuario.email, null,
        jsonb_build_object('antes', v_usuario.nombre, 'despues', v_nombre));
    end if;
  end if;

  -- Los roles de las membresías que se van a quitar caen por cascada: se
  -- auditan antes para que quede el rastro.
  insert into public.auditoria_admin (actor_email, accion, objetivo_email, organizacion_id, detalle)
  select v_actor, 'rol_quitado', r.email, r.organizacion_id,
         jsonb_build_object('rol', r.rol, 'motivo', 'se quitó la membresía')
  from public.usuario_roles r
  where r.email = v_usuario.email
    and r.organizacion_id = any(v_scope)
    and r.organizacion_id <> all(v_orgs);

  with quitadas as (
    delete from public.organizacion_miembros
    where email = v_usuario.email
      and organizacion_id = any(v_scope)
      and organizacion_id <> all(v_orgs)
    returning organizacion_id
  )
  insert into public.auditoria_admin (actor_email, accion, objetivo_email, organizacion_id)
  select v_actor, 'membresia_quitada', v_usuario.email, organizacion_id from quitadas;

  with nuevas as (
    insert into public.organizacion_miembros (email, organizacion_id, created_by)
    select v_usuario.email, o, v_actor from unnest(v_orgs) o
    on conflict do nothing
    returning organizacion_id
  )
  insert into public.auditoria_admin (actor_email, accion, objetivo_email, organizacion_id)
  select v_actor, 'membresia_agregada', v_usuario.email, organizacion_id from nuevas;

  v_eliminado := public.limpiar_usuario_sin_acceso(v_actor, v_usuario.email);

  return jsonb_build_object('id', v_usuario.id, 'email', v_usuario.email, 'eliminado', v_eliminado);
end $$;

-- Quitar acceso: saca todas las membresías dentro del scope del actor.
create or replace function public.admin_quitar_acceso(p_actor text, p_id uuid)
returns jsonb
language sql
as $$
  select public.admin_editar_usuario(p_actor, p_id, null, '{}')
$$;

-- ─────────────────────────────────────────────────────────
-- 10. Funciones del panel: roles y organizaciones (sólo superadmin)
-- ─────────────────────────────────────────────────────────

-- Asigna un rol dejándolo exactamente en las organizaciones indicadas
-- (semántica de reemplazo). Crea el usuario y las membresías que falten.
create or replace function public.superadmin_asignar_rol(
  p_actor text, p_email text, p_nombre text, p_rol text, p_organizaciones uuid[]
)
returns jsonb
language plpgsql
as $$
declare
  v_actor text := lower(trim(p_actor));
  v_email text := public.email_normalizado(p_email);
  v_nombre text := nullif(trim(coalesce(p_nombre, '')), '');
  v_orgs uuid[] := public.lista_organizaciones(p_organizaciones);
  v_rol public.roles;
  v_usuario public.usuarios;
begin
  perform public.exigir_superadmin(v_actor);

  select * into v_rol from public.roles where codigo = p_rol;
  if not found then
    raise exception 'El rol "%" no existe', p_rol using errcode = '22023';
  end if;
  if not v_rol.asignable_desde_panel then
    raise exception 'El rol "%" no se puede asignar desde el panel', v_rol.nombre using errcode = '42501';
  end if;
  if v_rol.alcance = 'organizacion' and cardinality(v_orgs) = 0 then
    raise exception 'El rol "%" requiere al menos una organización', v_rol.nombre using errcode = '22023';
  end if;
  if v_rol.alcance = 'global' and cardinality(v_orgs) > 0 then
    raise exception 'El rol "%" es global: no lleva organización', v_rol.nombre using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_orgs) o where not exists (select 1 from public.organizaciones where id = o)) then
    raise exception 'Alguna de las organizaciones no existe' using errcode = '22023';
  end if;

  insert into public.usuarios (email, nombre, created_by)
  values (v_email, v_nombre, v_actor)
  on conflict (email) do nothing
  returning * into v_usuario;

  if v_usuario.email is not null then
    perform public.registrar_auditoria(v_actor, 'usuario_creado', v_email, null,
      jsonb_build_object('nombre', v_nombre));
  else
    select * into v_usuario from public.usuarios where email = v_email for update;
    if v_usuario.nombre is null and v_nombre is not null then
      update public.usuarios set nombre = v_nombre where email = v_email;
    end if;
  end if;

  if v_rol.alcance = 'global' then
    with nuevos as (
      insert into public.usuario_roles (email, rol, alcance, organizacion_id, created_by)
      values (v_email, v_rol.codigo, 'global', null, v_actor)
      on conflict do nothing
      returning email
    )
    insert into public.auditoria_admin (actor_email, accion, objetivo_email, detalle)
    select v_actor, 'rol_asignado', email, jsonb_build_object('rol', v_rol.codigo) from nuevos;
  else
    -- Un rol por organización exige la membresía (FK): se crea si falta.
    with nuevas as (
      insert into public.organizacion_miembros (email, organizacion_id, created_by)
      select v_email, o, v_actor from unnest(v_orgs) o
      on conflict do nothing
      returning organizacion_id
    )
    insert into public.auditoria_admin (actor_email, accion, objetivo_email, organizacion_id)
    select v_actor, 'membresia_agregada', v_email, organizacion_id from nuevas;

    with nuevos as (
      insert into public.usuario_roles (email, rol, alcance, organizacion_id, created_by)
      select v_email, v_rol.codigo, 'organizacion', o, v_actor from unnest(v_orgs) o
      on conflict do nothing
      returning organizacion_id
    )
    insert into public.auditoria_admin (actor_email, accion, objetivo_email, organizacion_id, detalle)
    select v_actor, 'rol_asignado', v_email, organizacion_id, jsonb_build_object('rol', v_rol.codigo) from nuevos;

    -- Las organizaciones que ya no están en la lista pierden el rol, pero el
    -- usuario sigue siendo miembro.
    with quitados as (
      delete from public.usuario_roles
      where email = v_email and rol = v_rol.codigo and organizacion_id <> all(v_orgs)
      returning organizacion_id
    )
    insert into public.auditoria_admin (actor_email, accion, objetivo_email, organizacion_id, detalle)
    select v_actor, 'rol_quitado', v_email, organizacion_id, jsonb_build_object('rol', v_rol.codigo) from quitados;
  end if;

  return jsonb_build_object('id', v_usuario.id, 'email', v_email);
end $$;

create or replace function public.superadmin_quitar_rol(p_actor text, p_id uuid, p_rol text)
returns jsonb
language plpgsql
as $$
declare
  v_actor text := lower(trim(p_actor));
  v_rol public.roles;
  v_email text;
  v_quitados int;
  v_eliminado boolean;
begin
  perform public.exigir_superadmin(v_actor);

  select * into v_rol from public.roles where codigo = p_rol;
  if not found then
    raise exception 'El rol "%" no existe', p_rol using errcode = '22023';
  end if;
  if not v_rol.asignable_desde_panel then
    raise exception 'El rol "%" no se puede quitar desde el panel', v_rol.nombre using errcode = '42501';
  end if;

  select email into v_email from public.usuarios where id = p_id for update;
  if not found then
    raise exception 'Usuario no encontrado' using errcode = 'P0002';
  end if;

  with quitados as (
    delete from public.usuario_roles
    where email = v_email and rol = v_rol.codigo
    returning organizacion_id
  )
  insert into public.auditoria_admin (actor_email, accion, objetivo_email, organizacion_id, detalle)
  select v_actor, 'rol_quitado', v_email, organizacion_id, jsonb_build_object('rol', v_rol.codigo) from quitados;
  get diagnostics v_quitados = row_count;

  if v_quitados = 0 then
    raise exception 'El usuario no tiene el rol "%"', v_rol.nombre using errcode = 'P0002';
  end if;

  v_eliminado := public.limpiar_usuario_sin_acceso(v_actor, v_email);
  return jsonb_build_object('id', p_id, 'email', v_email, 'eliminado', v_eliminado);
end $$;

-- Crea (p_id nulo) o renombra una organización. No hay borrado: las tablas de
-- datos referencian la organización sin cascade.
create or replace function public.superadmin_guardar_organizacion(p_actor text, p_id uuid, p_nombre text)
returns jsonb
language plpgsql
as $$
declare
  v_actor text := lower(trim(p_actor));
  v_nombre text := trim(coalesce(p_nombre, ''));
  v_org public.organizaciones;
  v_anterior text;
begin
  perform public.exigir_superadmin(v_actor);

  if v_nombre = '' or length(v_nombre) > 80 then
    raise exception 'El nombre de la organización es obligatorio (hasta 80 caracteres)' using errcode = '22023';
  end if;

  begin
    if p_id is null then
      insert into public.organizaciones (nombre) values (v_nombre) returning * into v_org;
      perform public.registrar_auditoria(v_actor, 'organizacion_creada', null, v_org.id,
        jsonb_build_object('nombre', v_nombre));
    else
      select nombre into v_anterior from public.organizaciones where id = p_id for update;
      if not found then
        raise exception 'Organización no encontrada' using errcode = 'P0002';
      end if;
      update public.organizaciones set nombre = v_nombre where id = p_id returning * into v_org;
      if v_anterior is distinct from v_nombre then
        perform public.registrar_auditoria(v_actor, 'organizacion_renombrada', null, p_id,
          jsonb_build_object('antes', v_anterior, 'despues', v_nombre));
      end if;
    end if;
  exception when unique_violation then
    raise exception 'Ya existe una organización llamada "%"', v_nombre using errcode = '23505';
  end;

  return jsonb_build_object('id', v_org.id, 'nombre', v_org.nombre);
end $$;

-- ─────────────────────────────────────────────────────────
-- 11. Funciones del panel: lecturas (respetan el scope del actor)
-- ─────────────────────────────────────────────────────────

create or replace function public.admin_listar_usuarios(p_actor text)
returns jsonb
language plpgsql
stable
as $$
declare
  v_actor text := lower(trim(p_actor));
  v_scope uuid[] := public.exigir_admin(v_actor);
  v_super boolean := public.es_superadmin(v_actor);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', u.id,
      'email', u.email,
      'nombre', u.nombre,
      'created_at', u.created_at,
      -- Sólo las organizaciones que el actor administra.
      'organizaciones', coalesce((
        select jsonb_agg(jsonb_build_object('id', o.id, 'nombre', o.nombre) order by o.nombre)
        from public.organizacion_miembros m
        join public.organizaciones o on o.id = m.organizacion_id
        where m.email = u.email and m.organizacion_id = any(v_scope)
      ), '[]'::jsonb),
      'roles', coalesce((
        select jsonb_agg(jsonb_build_object(
          'rol', r.rol,
          'nombre', ro.nombre,
          'alcance', r.alcance,
          'organizacion_id', r.organizacion_id,
          'organizacion_nombre', o.nombre
        ) order by ro.nombre, o.nombre)
        from public.usuario_roles r
        join public.roles ro on ro.codigo = r.rol
        left join public.organizaciones o on o.id = r.organizacion_id
        where r.email = u.email
          and (v_super or r.organizacion_id is null or r.organizacion_id = any(v_scope))
      ), '[]'::jsonb),
      'editable', not public.usuario_protegido_para(v_actor, u.email)
    ) order by lower(coalesce(u.nombre, u.email)))
    from public.usuarios u
    where v_super or exists (
      select 1 from public.organizacion_miembros m
      where m.email = u.email and m.organizacion_id = any(v_scope)
    )
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_listar_organizaciones(p_actor text)
returns jsonb
language plpgsql
stable
as $$
declare
  v_scope uuid[] := public.exigir_admin(lower(trim(p_actor)));
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id,
      'nombre', o.nombre,
      'created_at', o.created_at,
      'miembros', (select count(*) from public.organizacion_miembros m where m.organizacion_id = o.id),
      'admins', (select count(*) from public.usuario_roles r where r.organizacion_id = o.id and r.rol = 'admin')
    ) order by o.nombre)
    from public.organizaciones o
    where o.id = any(v_scope)
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_listar_auditoria(p_actor text, p_limite int default 100)
returns jsonb
language plpgsql
stable
as $$
declare
  v_actor text := lower(trim(p_actor));
  v_scope uuid[] := public.exigir_admin(v_actor);
  v_super boolean := public.es_superadmin(v_actor);
begin
  return coalesce((
    select jsonb_agg(fila order by fila->>'created_at' desc)
    from (
      select jsonb_build_object(
        'id', a.id,
        'created_at', a.created_at,
        'actor_email', a.actor_email,
        'accion', a.accion,
        'objetivo_email', a.objetivo_email,
        'organizacion_id', a.organizacion_id,
        'organizacion_nombre', o.nombre,
        'detalle', a.detalle
      ) as fila
      from public.auditoria_admin a
      left join public.organizaciones o on o.id = a.organizacion_id
      where v_super or a.organizacion_id = any(v_scope) or a.actor_email = v_actor
      order by a.created_at desc
      limit least(greatest(coalesce(p_limite, 100), 1), 500)
    ) t
  ), '[]'::jsonb);
end $$;

-- ─────────────────────────────────────────────────────────
-- 12. Permisos de ejecución
--
-- Supabase le da EXECUTE a anon y authenticated sobre toda función nueva de
-- public, y PostgREST las expone como RPC. Estas funciones reciben el actor
-- por parámetro, así que sólo el backend (service_role) puede llamarlas.
-- ─────────────────────────────────────────────────────────

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.es_superadmin(text)',
    'public.organizaciones_administradas(text)',
    'public.contexto_usuario(text)',
    'public.email_normalizado(text)',
    'public.exigir_admin(text)',
    'public.exigir_superadmin(text)',
    'public.usuario_protegido_para(text, text)',
    'public.registrar_auditoria(text, text, text, uuid, jsonb)',
    'public.limpiar_usuario_sin_acceso(text, text)',
    'public.lista_organizaciones(uuid[])',
    'public.admin_alta_usuario(text, text, text, uuid[])',
    'public.admin_editar_usuario(text, uuid, text, uuid[])',
    'public.admin_quitar_acceso(text, uuid)',
    'public.superadmin_asignar_rol(text, text, text, text, uuid[])',
    'public.superadmin_quitar_rol(text, uuid, text)',
    'public.superadmin_guardar_organizacion(text, uuid, text)',
    'public.admin_listar_usuarios(text)',
    'public.admin_listar_organizaciones(text)',
    'public.admin_listar_auditoria(text, int)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────
-- 13. RLS de respaldo y GRANTs
--
-- El backend usa la service role (bypassea RLS). Estas políticas son defensa
-- en profundidad: desde el cliente cada uno sólo puede leer lo propio y nadie
-- puede escribir. Toda escritura pasa por el backend y las funciones de arriba.
-- ─────────────────────────────────────────────────────────

alter table public.usuarios enable row level security;
alter table public.roles enable row level security;
alter table public.usuario_roles enable row level security;
alter table public.auditoria_admin enable row level security;

drop policy if exists "propio usuario" on public.usuarios;
create policy "propio usuario" on public.usuarios for select to authenticated
  using (email = lower(auth.jwt() ->> 'email'));

drop policy if exists "catalogo de roles" on public.roles;
create policy "catalogo de roles" on public.roles for select to authenticated
  using (true);

drop policy if exists "propios roles" on public.usuario_roles;
create policy "propios roles" on public.usuario_roles for select to authenticated
  using (email = lower(auth.jwt() ->> 'email'));

-- auditoria_admin: sin políticas a propósito (sólo la lee el backend).

-- Sin el GRANT el acceso falla con "permission denied" antes de evaluar RLS.
grant select, insert, update, delete on
  public.usuarios, public.roles, public.usuario_roles, public.auditoria_admin
to service_role;
grant select on public.usuarios, public.roles, public.usuario_roles to authenticated;
revoke all on public.usuarios, public.roles, public.usuario_roles, public.auditoria_admin from anon;
revoke insert, update, delete on public.usuarios, public.roles, public.usuario_roles, public.auditoria_admin from authenticated;

-- Las membresías y las organizaciones ya no se escriben desde el cliente en
-- ningún caso: se cierra lo que había quedado abierto (RLS ya lo bloqueaba
-- por no tener políticas de escritura; esto es una capa más).
revoke insert, update, delete on public.organizaciones, public.organizacion_miembros from anon, authenticated;

-- ─────────────────────────────────────────────────────────
-- 14. Superadmin inicial
--
-- Nadie puede asignar el primer superadmin desde el panel: se siembra acá.
-- Para agregar otro más adelante, ver docs/ROLES_Y_PERMISOS.md.
-- ─────────────────────────────────────────────────────────

insert into public.usuarios (email, nombre, created_by)
values ('oratoriogarayy@gmail.com', 'Oratorio de Garay', 'migracion')
on conflict (email) do nothing;

with nuevo as (
  insert into public.usuario_roles (email, rol, alcance, organizacion_id, created_by)
  values ('oratoriogarayy@gmail.com', 'superadmin', 'global', null, 'migracion')
  on conflict do nothing
  returning email
)
insert into public.auditoria_admin (actor_email, accion, objetivo_email, detalle)
select 'migracion', 'rol_asignado', email, '{"rol": "superadmin"}'::jsonb from nuevo;
