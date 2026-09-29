-- Solicitudes: registro abierto con aprobación.
--
-- Cualquiera puede crear una cuenta (Google o código por mail), pero eso no le
-- da acceso a nada: si su email no está en public.usuarios, la app le pide que
-- solicite sumarse a un espacio (organización) existente o crear uno nuevo.
-- Un admin de ese espacio o un superadmin acepta o rechaza la solicitud.
--
-- public.solicitudes es genérica, como un ticket de Jira Service Management:
-- tiene un tipo (catálogo public.solicitud_tipos), un estado, un aprobador y
-- un comentario del aprobador. Lo propio de cada tipo va en datos (jsonb).
-- Hoy el único tipo es registro_usuario.
--
-- Mismo modelo que 20260926000000_roles_y_admin.sql: toda la lógica y el scope
-- viven en funciones que reciben al actor, auditan en la misma transacción y
-- sólo puede ejecutar service_role. Ver docs/ROLES_Y_PERMISOS.md.
--
-- Errores: además de los de roles_y_admin, 55000 (la solicitud no está en un
-- estado que permita la operación, ej: ya fue resuelta) → HTTP 409.

-- ─────────────────────────────────────────────────────────
-- 1. Catálogo de tipos
-- ─────────────────────────────────────────────────────────

create table if not exists public.solicitud_tipos (
  codigo text primary key,
  nombre text not null,
  descripcion text,
  created_at timestamptz not null default now()
);

insert into public.solicitud_tipos (codigo, nombre, descripcion) values
  ('registro_usuario', 'Registro de usuario',
   'Una persona nueva pide sumarse a un espacio existente o crear uno nuevo.')
on conflict (codigo) do update
  set nombre = excluded.nombre,
      descripcion = excluded.descripcion;

-- ─────────────────────────────────────────────────────────
-- 2. Solicitudes
-- ─────────────────────────────────────────────────────────

create table if not exists public.solicitudes (
  id uuid primary key default gen_random_uuid(),
  -- El "#12" que se muestra en el panel y en los mails.
  numero bigint generated always as identity unique,
  tipo text not null references public.solicitud_tipos(codigo),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aceptada', 'rechazada', 'cancelada')),
  -- No es FK a usuarios: quien pide todavía no está registrado.
  solicitante_email text not null check (solicitante_email = lower(trim(solicitante_email))),
  solicitante_nombre text not null check (length(solicitante_nombre) between 1 and 120),
  -- Organización objetivo. Define quién ve la solicitud: sus admins y los
  -- superadmins. Nula = pide crear un espacio nuevo (sólo superadmins); al
  -- aceptarla se completa con la organización final.
  organizacion_id uuid references public.organizaciones(id),
  -- Lo propio de cada tipo. registro_usuario:
  --   al crear:    { espacio_nuevo, nombre_espacio }
  --   al aceptar:  { organizacion_creada, rol_asignado }
  datos jsonb not null default '{}'::jsonb,
  -- Quien tomó la solicitud (botón "Tomar") o la resolvió.
  aprobador_id uuid references public.usuarios(id) on delete set null,
  comentario_aprobador text check (length(comentario_aprobador) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tomada_at timestamptz,
  resuelta_at timestamptz,
  constraint solicitudes_resuelta_check check ((estado = 'pendiente') = (resuelta_at is null))
);

-- Una sola pendiente por persona y tipo: evita que alguien llene de mails a
-- los admins mandando solicitudes repetidas.
create unique index if not exists solicitudes_una_pendiente_key
  on public.solicitudes (solicitante_email, tipo) where estado = 'pendiente';
create index if not exists solicitudes_estado_org_idx on public.solicitudes (estado, organizacion_id);
create index if not exists solicitudes_solicitante_idx on public.solicitudes (solicitante_email, created_at desc);

drop trigger if exists solicitudes_updated_at on public.solicitudes;
create trigger solicitudes_updated_at before update on public.solicitudes
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────
-- 3. Auditoría: acciones nuevas
-- ─────────────────────────────────────────────────────────

alter table public.auditoria_admin drop constraint if exists auditoria_admin_accion_check;
alter table public.auditoria_admin add constraint auditoria_admin_accion_check check (accion in (
  'usuario_creado', 'usuario_renombrado', 'usuario_eliminado',
  'membresia_agregada', 'membresia_quitada',
  'rol_asignado', 'rol_quitado',
  'organizacion_creada', 'organizacion_renombrada',
  'solicitud_creada', 'solicitud_aceptada', 'solicitud_rechazada', 'solicitud_cancelada'
));

-- ─────────────────────────────────────────────────────────
-- 4. Helpers
-- ─────────────────────────────────────────────────────────

-- Forma única de una solicitud para el backend (panel, registro y mails).
create or replace function public.solicitud_json(s public.solicitudes)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', s.id,
    'numero', s.numero,
    'tipo', s.tipo,
    'tipo_nombre', (select t.nombre from public.solicitud_tipos t where t.codigo = s.tipo),
    'estado', s.estado,
    'solicitante_email', s.solicitante_email,
    'solicitante_nombre', s.solicitante_nombre,
    'organizacion_id', s.organizacion_id,
    'organizacion_nombre', (select o.nombre from public.organizaciones o where o.id = s.organizacion_id),
    'datos', s.datos,
    'aprobador_id', s.aprobador_id,
    'aprobador_email', u.email,
    'aprobador_nombre', u.nombre,
    'comentario_aprobador', s.comentario_aprobador,
    'created_at', s.created_at,
    'tomada_at', s.tomada_at,
    'resuelta_at', s.resuelta_at
  )
  from (select 1) as uno
  left join public.usuarios u on u.id = s.aprobador_id
$$;

-- Quién puede ver (y resolver) una solicitud: los superadmins todas; los
-- admins, las de registro de las organizaciones que administran. Un espacio
-- nuevo pendiente no tiene organización, así que sólo lo ve el superadmin.
create or replace function public.solicitud_visible_para(p_actor text, s public.solicitudes)
returns boolean
language sql
stable
as $$
  -- coalesce: con organizacion_id nulo el "in" da null, y en plpgsql
  -- "not null" no dispara el error de scope.
  select coalesce(public.es_superadmin(p_actor)
    or (s.tipo = 'registro_usuario'
        and s.organizacion_id is not null
        and s.organizacion_id in (select public.organizaciones_administradas(p_actor))), false)
$$;

-- Emails a los que hay que avisar de una solicitud nueva.
create or replace function public.solicitud_aprobadores(s public.solicitudes)
returns text[]
language sql
stable
as $$
  select coalesce(array_agg(distinct r.email order by r.email), '{}')
  from public.usuario_roles r
  where r.rol = 'superadmin'
     or (r.rol = 'admin' and s.organizacion_id is not null and r.organizacion_id = s.organizacion_id)
$$;

-- Lock + scope. Una solicitud fuera del scope se informa como inexistente,
-- igual que los usuarios (no revela que existe).
create or replace function public.solicitud_para_actor(p_actor text, p_id uuid)
returns public.solicitudes
language plpgsql
as $$
declare
  v_solicitud public.solicitudes;
begin
  select * into v_solicitud from public.solicitudes where id = p_id for update;
  if not found or not public.solicitud_visible_para(p_actor, v_solicitud) then
    raise exception 'Solicitud no encontrada' using errcode = 'P0002';
  end if;
  return v_solicitud;
end $$;

create or replace function public.exigir_solicitud_pendiente(s public.solicitudes)
returns void
language plpgsql
stable
as $$
begin
  if s.estado <> 'pendiente' then
    raise exception 'La solicitud #% ya fue %', s.numero, s.estado using errcode = '55000';
  end if;
end $$;

-- Tiene acceso a la app: alguna organización o un rol global. (Por el
-- invariante de roles_y_admin un usuario sin nada de eso no debería existir,
-- pero si existiera tiene que poder pedir acceso igual.)
create or replace function public.tiene_acceso(p_email text)
returns boolean
language sql
stable
as $$
  select exists (select 1 from public.organizacion_miembros where email = lower(trim(p_email)))
      or exists (select 1 from public.usuario_roles where email = lower(trim(p_email)) and organizacion_id is null)
$$;

create or replace function public.id_de_usuario(p_email text)
returns uuid
language sql
stable
as $$
  select id from public.usuarios where email = lower(trim(p_email))
$$;

-- ─────────────────────────────────────────────────────────
-- 5. Registro (lo usa quien todavía no tiene acceso)
--
-- p_email es el de la sesión: lo pone el backend después de validar el token.
-- ─────────────────────────────────────────────────────────

-- Todo lo que necesita la pantalla de registro: si ya tiene acceso, su última
-- solicitud y los espacios que puede elegir.
create or replace function public.registro_estado(p_email text)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'registrado', public.tiene_acceso(p_email),
    'solicitud', (
      select public.solicitud_json(s) from public.solicitudes s
      where s.solicitante_email = lower(trim(p_email)) and s.tipo = 'registro_usuario'
      order by s.created_at desc
      limit 1
    ),
    'espacios', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'nombre', o.nombre) order by o.nombre)
      from public.organizaciones o
    ), '[]'::jsonb)
  )
$$;

-- Crea una solicitud de registro: sumarse a p_organizacion_id, o crear el
-- espacio p_nombre_espacio (exactamente una de las dos).
create or replace function public.registro_crear_solicitud(
  p_email text, p_nombre text, p_organizacion_id uuid, p_nombre_espacio text
)
returns jsonb
language plpgsql
as $$
declare
  v_email text := public.email_normalizado(p_email);
  v_nombre text := trim(coalesce(p_nombre, ''));
  v_espacio text := nullif(trim(coalesce(p_nombre_espacio, '')), '');
  v_solicitud public.solicitudes;
begin
  if public.tiene_acceso(v_email) then
    raise exception 'Tu cuenta ya tiene acceso a la aplicación' using errcode = '55000';
  end if;
  if v_nombre = '' or length(v_nombre) > 120 then
    raise exception 'Ingresá tu nombre (hasta 120 caracteres)' using errcode = '22023';
  end if;
  if (p_organizacion_id is null) = (v_espacio is null) then
    raise exception 'Elegí un espacio o creá uno nuevo' using errcode = '22023';
  end if;
  if p_organizacion_id is not null
     and not exists (select 1 from public.organizaciones where id = p_organizacion_id) then
    raise exception 'El espacio elegido no existe' using errcode = '22023';
  end if;
  if v_espacio is not null then
    if length(v_espacio) > 80 then
      raise exception 'El nombre del espacio puede tener hasta 80 caracteres' using errcode = '22023';
    end if;
    if exists (select 1 from public.organizaciones where lower(trim(nombre)) = lower(v_espacio)) then
      raise exception 'El espacio "%" ya existe: elegilo de la lista', v_espacio using errcode = '23505';
    end if;
  end if;

  begin
    insert into public.solicitudes (tipo, solicitante_email, solicitante_nombre, organizacion_id, datos)
    values (
      'registro_usuario', v_email, v_nombre, p_organizacion_id,
      case when v_espacio is null
        then jsonb_build_object('espacio_nuevo', false)
        else jsonb_build_object('espacio_nuevo', true, 'nombre_espacio', v_espacio)
      end
    )
    returning * into v_solicitud;
  exception when unique_violation then
    raise exception 'Ya tenés una solicitud pendiente' using errcode = '23505';
  end;

  perform public.registrar_auditoria(v_email, 'solicitud_creada', v_email, p_organizacion_id,
    jsonb_build_object('numero', v_solicitud.numero, 'solicitud_id', v_solicitud.id, 'nombre_espacio', v_espacio));

  return jsonb_build_object(
    'solicitud', public.solicitud_json(v_solicitud),
    'notificar', to_jsonb(public.solicitud_aprobadores(v_solicitud))
  );
end $$;

-- El solicitante puede cancelar su pendiente mientras nadie la haya tomado.
create or replace function public.registro_cancelar_solicitud(p_email text, p_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_email text := lower(trim(p_email));
  v_solicitud public.solicitudes;
begin
  select * into v_solicitud from public.solicitudes
  where id = p_id and solicitante_email = v_email
  for update;
  if not found then
    raise exception 'Solicitud no encontrada' using errcode = 'P0002';
  end if;
  perform public.exigir_solicitud_pendiente(v_solicitud);
  if v_solicitud.aprobador_id is not null then
    raise exception 'Un administrador ya está revisando tu solicitud: no se puede cancelar' using errcode = '55000';
  end if;

  update public.solicitudes
  set estado = 'cancelada', resuelta_at = now()
  where id = p_id
  returning * into v_solicitud;

  perform public.registrar_auditoria(v_email, 'solicitud_cancelada', v_email, v_solicitud.organizacion_id,
    jsonb_build_object('numero', v_solicitud.numero, 'solicitud_id', v_solicitud.id));

  return public.solicitud_json(v_solicitud);
end $$;

-- ─────────────────────────────────────────────────────────
-- 6. Panel (admin y superadmin, dentro de su scope)
-- ─────────────────────────────────────────────────────────

-- p_estado nulo = todas. Primero las pendientes, después las más nuevas.
create or replace function public.admin_listar_solicitudes(p_actor text, p_estado text default null)
returns jsonb
language plpgsql
stable
as $$
declare
  v_actor text := lower(trim(p_actor));
begin
  perform public.exigir_admin(v_actor);
  return coalesce((
    select jsonb_agg(public.solicitud_json(s)
                     order by (s.estado = 'pendiente') desc, s.created_at desc)
    from (
      select * from public.solicitudes
      where (p_estado is null or estado = p_estado)
      order by (estado = 'pendiente') desc, created_at desc
      limit 500
    ) s
    where public.solicitud_visible_para(v_actor, s)
  ), '[]'::jsonb);
end $$;

-- "Tomar": el actor queda como aprobador; la solicitud sigue pendiente. Otro
-- aprobador puede volver a tomarla (reasignársela).
create or replace function public.admin_tomar_solicitud(p_actor text, p_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_actor text := lower(trim(p_actor));
  v_solicitud public.solicitudes;
begin
  perform public.exigir_admin(v_actor);
  v_solicitud := public.solicitud_para_actor(v_actor, p_id);
  perform public.exigir_solicitud_pendiente(v_solicitud);

  update public.solicitudes
  set aprobador_id = public.id_de_usuario(v_actor), tomada_at = now()
  where id = p_id
  returning * into v_solicitud;

  return public.solicitud_json(v_solicitud);
end $$;

-- Acepta o rechaza (p_decision = 'aceptar' | 'rechazar'). Quien resuelve queda
-- como aprobador aunque no la haya tomado.
--
-- Aceptar un registro_usuario:
--   - Sumarse a X: alta del usuario como miembro de X (admin_alta_usuario).
--   - Espacio nuevo (sólo superadmin):
--       · p_organizacion_id: el espacio ya existía; queda miembro de ese, sin rol.
--       · si no: se crea el espacio con p_nombre_espacio (o el nombre pedido) y
--         el solicitante queda como admin.
create or replace function public.admin_resolver_solicitud(
  p_actor text, p_id uuid, p_decision text, p_comentario text,
  p_organizacion_id uuid default null, p_nombre_espacio text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_actor text := lower(trim(p_actor));
  v_comentario text := nullif(trim(coalesce(p_comentario, '')), '');
  v_solicitud public.solicitudes;
  v_org uuid;
  v_creada boolean := false;
  v_rol text;
  v_nombre_espacio text;
begin
  perform public.exigir_admin(v_actor);
  v_solicitud := public.solicitud_para_actor(v_actor, p_id);
  perform public.exigir_solicitud_pendiente(v_solicitud);

  if p_decision not in ('aceptar', 'rechazar') then
    raise exception 'Decisión inválida: aceptar o rechazar' using errcode = '22023';
  end if;
  if length(v_comentario) > 1000 then
    raise exception 'El comentario puede tener hasta 1000 caracteres' using errcode = '22023';
  end if;

  if p_decision = 'rechazar' then
    update public.solicitudes
    set estado = 'rechazada',
        aprobador_id = public.id_de_usuario(v_actor),
        tomada_at = coalesce(tomada_at, now()),
        comentario_aprobador = v_comentario,
        resuelta_at = now()
    where id = p_id
    returning * into v_solicitud;

    perform public.registrar_auditoria(v_actor, 'solicitud_rechazada', v_solicitud.solicitante_email,
      v_solicitud.organizacion_id,
      jsonb_build_object('numero', v_solicitud.numero, 'solicitud_id', v_solicitud.id, 'comentario', v_comentario));
    return public.solicitud_json(v_solicitud);
  end if;

  if v_solicitud.tipo <> 'registro_usuario' then
    raise exception 'Tipo de solicitud no soportado: %', v_solicitud.tipo using errcode = '22023';
  end if;

  if v_solicitud.organizacion_id is not null then
    v_org := v_solicitud.organizacion_id;
    perform public.admin_alta_usuario(v_actor, v_solicitud.solicitante_email,
      v_solicitud.solicitante_nombre, array[v_org]);
  else
    perform public.exigir_superadmin(v_actor);
    if p_organizacion_id is not null then
      if not exists (select 1 from public.organizaciones where id = p_organizacion_id) then
        raise exception 'El espacio elegido no existe' using errcode = '22023';
      end if;
      v_org := p_organizacion_id;
      perform public.admin_alta_usuario(v_actor, v_solicitud.solicitante_email,
        v_solicitud.solicitante_nombre, array[v_org]);
    else
      v_nombre_espacio := coalesce(nullif(trim(coalesce(p_nombre_espacio, '')), ''),
                                   v_solicitud.datos ->> 'nombre_espacio');
      v_org := (public.superadmin_guardar_organizacion(v_actor, null, v_nombre_espacio) ->> 'id')::uuid;
      perform public.superadmin_asignar_rol(v_actor, v_solicitud.solicitante_email,
        v_solicitud.solicitante_nombre, 'admin', array[v_org]);
      v_creada := true;
      v_rol := 'admin';
    end if;
  end if;

  update public.solicitudes
  set estado = 'aceptada',
      organizacion_id = v_org,
      datos = datos || jsonb_build_object('organizacion_creada', v_creada, 'rol_asignado', v_rol),
      aprobador_id = public.id_de_usuario(v_actor),
      tomada_at = coalesce(tomada_at, now()),
      comentario_aprobador = v_comentario,
      resuelta_at = now()
  where id = p_id
  returning * into v_solicitud;

  perform public.registrar_auditoria(v_actor, 'solicitud_aceptada', v_solicitud.solicitante_email, v_org,
    jsonb_build_object('numero', v_solicitud.numero, 'solicitud_id', v_solicitud.id, 'comentario', v_comentario));
  return public.solicitud_json(v_solicitud);
end $$;

-- ─────────────────────────────────────────────────────────
-- 7. Permisos de ejecución: sólo el backend (service_role)
-- ─────────────────────────────────────────────────────────

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.solicitud_json(public.solicitudes)',
    'public.solicitud_visible_para(text, public.solicitudes)',
    'public.solicitud_aprobadores(public.solicitudes)',
    'public.solicitud_para_actor(text, uuid)',
    'public.exigir_solicitud_pendiente(public.solicitudes)',
    'public.tiene_acceso(text)',
    'public.id_de_usuario(text)',
    'public.registro_estado(text)',
    'public.registro_crear_solicitud(text, text, uuid, text)',
    'public.registro_cancelar_solicitud(text, uuid)',
    'public.admin_listar_solicitudes(text, text)',
    'public.admin_tomar_solicitud(text, uuid)',
    'public.admin_resolver_solicitud(text, uuid, text, text, uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────
-- 8. RLS y GRANTs
--
-- Sin políticas a propósito, como auditoria_admin: sólo el backend accede.
-- ─────────────────────────────────────────────────────────

alter table public.solicitud_tipos enable row level security;
alter table public.solicitudes enable row level security;

grant select, insert, update, delete on public.solicitud_tipos, public.solicitudes to service_role;
revoke all on public.solicitud_tipos, public.solicitudes from anon, authenticated;
