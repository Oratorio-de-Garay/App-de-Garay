-- Notificaciones push (Web Push / VAPID).
--
-- Un admin envía un título y un texto a todos los dispositivos de un usuario de
-- una organización que administra. El envío es inmediato; el historial queda en
-- public.notificaciones_push (la programación futura se apoya en esa misma tabla).
--
-- Mismo modelo que 20260926000000_roles_y_admin.sql y 20260928000000_solicitudes.sql:
-- toda la lógica y el scope viven en funciones que reciben al actor, auditan en
-- la misma transacción y sólo puede ejecutar service_role. Ver
-- docs/ROLES_Y_PERMISOS.md.
--
-- Flujo de un envío (el backend hace el POST a los servicios push entre medio):
--   1. admin_preparar_notificacion: valida scope, crea el registro 'pendiente'
--      y devuelve los dispositivos del destinatario.
--   2. el backend envía con la librería web-push.
--   3. admin_cerrar_notificacion: guarda el resultado y borra las suscripciones
--      que el servicio push informó como vencidas (404/410).

-- ─────────────────────────────────────────────────────────
-- 1. Dispositivos suscriptos
--
-- Una fila por navegador/dispositivo. Pertenece al usuario, no a una
-- organización: el filtro por organización se aplica al enviar.
-- ─────────────────────────────────────────────────────────

create table if not exists public.dispositivos_push (
  id uuid primary key default gen_random_uuid(),
  email text not null references public.usuarios(email) on delete cascade on update cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 2048),
  p256dh text not null check (length(p256dh) between 1 and 512),
  auth text not null check (length(auth) between 1 and 512),
  user_agent text check (length(user_agent) <= 500),
  created_at timestamptz not null default now(),
  ultimo_uso_at timestamptz
);

create index if not exists dispositivos_push_email_idx on public.dispositivos_push (email);

-- ─────────────────────────────────────────────────────────
-- 2. Historial de notificaciones
--
-- Los emails son una "foto" del momento del envío, sin FK a usuarios ni a
-- organizacion_miembros: así el historial sobrevive si se borra al usuario o se
-- le quita el acceso. La pertenencia a la organización se valida en
-- admin_preparar_notificacion.
-- ─────────────────────────────────────────────────────────

create table if not exists public.notificaciones_push (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  organizacion_id uuid not null references public.organizaciones(id),
  remitente_email text not null,
  destinatario_email text not null,
  titulo text not null check (char_length(titulo) between 1 and 65),
  texto text not null check (char_length(texto) between 1 and 240),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'enviada', 'parcial', 'fallida', 'sin_dispositivos')),
  dispositivos_total integer not null default 0,
  enviados integer not null default 0,
  fallidos integer not null default 0,
  enviada_at timestamptz
);

create index if not exists notificaciones_push_org_idx
  on public.notificaciones_push (organizacion_id, created_at desc);

-- ─────────────────────────────────────────────────────────
-- 3. Auditoría: acción nueva
-- ─────────────────────────────────────────────────────────

alter table public.auditoria_admin drop constraint if exists auditoria_admin_accion_check;
alter table public.auditoria_admin add constraint auditoria_admin_accion_check check (accion in (
  'usuario_creado', 'usuario_renombrado', 'usuario_eliminado',
  'membresia_agregada', 'membresia_quitada',
  'rol_asignado', 'rol_quitado',
  'organizacion_creada', 'organizacion_renombrada',
  'solicitud_creada', 'solicitud_aceptada', 'solicitud_rechazada', 'solicitud_cancelada',
  'notificacion_enviada'
));

-- ─────────────────────────────────────────────────────────
-- 4. Helper: forma única de una notificación para el backend
-- ─────────────────────────────────────────────────────────

create or replace function public.notificacion_push_json(n public.notificaciones_push)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', n.id,
    'organizacion_id', n.organizacion_id,
    'organizacion_nombre', (select o.nombre from public.organizaciones o where o.id = n.organizacion_id),
    'remitente_email', n.remitente_email,
    'destinatario_email', n.destinatario_email,
    'destinatario_nombre', (select u.nombre from public.usuarios u where u.email = n.destinatario_email),
    'titulo', n.titulo,
    'texto', n.texto,
    'estado', n.estado,
    'dispositivos_total', n.dispositivos_total,
    'enviados', n.enviados,
    'fallidos', n.fallidos,
    'created_at', n.created_at,
    'enviada_at', n.enviada_at
  )
$$;

-- ─────────────────────────────────────────────────────────
-- 5. Dispositivos (los gestiona cada usuario sobre sí mismo)
--
-- p_email es el de la sesión: lo pone el backend después de validar el token,
-- nunca viene del body.
-- ─────────────────────────────────────────────────────────

create or replace function public.push_registrar_dispositivo(
  p_email text, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text
)
returns jsonb
language plpgsql
as $$
declare
  v_email text := lower(trim(p_email));
  v_endpoint text := trim(coalesce(p_endpoint, ''));
  v_id uuid;
begin
  if v_endpoint !~ '^https://' or length(v_endpoint) > 2048 then
    raise exception 'Suscripción inválida' using errcode = '22023';
  end if;
  if coalesce(trim(p_p256dh), '') = '' or coalesce(trim(p_auth), '') = '' then
    raise exception 'Suscripción inválida' using errcode = '22023';
  end if;
  if not exists (select 1 from public.usuarios where email = v_email) then
    raise exception 'Usuario no encontrado' using errcode = 'P0002';
  end if;

  -- Si el endpoint ya existía (mismo navegador, otra cuenta) se reasigna.
  insert into public.dispositivos_push (email, endpoint, p256dh, auth, user_agent, ultimo_uso_at)
  values (v_email, v_endpoint, trim(p_p256dh), trim(p_auth), left(p_user_agent, 500), now())
  on conflict (endpoint) do update
    set email = excluded.email,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        ultimo_uso_at = now()
  returning id into v_id;

  -- Tope por usuario: se descartan los más viejos.
  delete from public.dispositivos_push d
  where d.email = v_email
    and d.id in (
      select id from public.dispositivos_push
      where email = v_email
      order by coalesce(ultimo_uso_at, created_at) desc
      offset 20
    );

  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.push_quitar_dispositivo(p_email text, p_endpoint text)
returns jsonb
language plpgsql
as $$
declare
  v_borrados integer;
begin
  delete from public.dispositivos_push
  where email = lower(trim(p_email)) and endpoint = trim(coalesce(p_endpoint, ''));
  get diagnostics v_borrados = row_count;
  return jsonb_build_object('eliminados', v_borrados);
end $$;

-- ─────────────────────────────────────────────────────────
-- 6. Envío (admin y superadmin, dentro de su scope)
-- ─────────────────────────────────────────────────────────

-- Valida y crea el registro. Devuelve la notificación y los dispositivos a los
-- que hay que enviar. Un destinatario fuera de la organización se informa como
-- inexistente (no revela que existe).
create or replace function public.admin_preparar_notificacion(
  p_actor text, p_organizacion_id uuid, p_destinatario text, p_titulo text, p_texto text
)
returns jsonb
language plpgsql
as $$
declare
  v_actor text := lower(trim(p_actor));
  v_dest text := lower(trim(coalesce(p_destinatario, '')));
  v_titulo text := trim(coalesce(p_titulo, ''));
  v_texto text := trim(coalesce(p_texto, ''));
  v_scope uuid[];
  v_notif public.notificaciones_push;
  v_dispositivos jsonb;
begin
  v_scope := public.exigir_admin(v_actor);

  if p_organizacion_id is null or not (p_organizacion_id = any (v_scope)) then
    raise exception 'No administrás esa organización' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.organizacion_miembros
    where email = v_dest and organizacion_id = p_organizacion_id
  ) then
    raise exception 'Usuario no encontrado' using errcode = 'P0002';
  end if;
  if char_length(v_titulo) not between 1 and 65 then
    raise exception 'El título es obligatorio (hasta 65 caracteres)' using errcode = '22023';
  end if;
  if char_length(v_texto) not between 1 and 240 then
    raise exception 'El texto es obligatorio (hasta 240 caracteres)' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'endpoint', d.endpoint, 'p256dh', d.p256dh, 'auth', d.auth)), '[]'::jsonb)
    into v_dispositivos
  from public.dispositivos_push d
  where d.email = v_dest;

  insert into public.notificaciones_push (
    organizacion_id, remitente_email, destinatario_email, titulo, texto,
    estado, dispositivos_total
  ) values (
    p_organizacion_id, v_actor, v_dest, v_titulo, v_texto,
    case when jsonb_array_length(v_dispositivos) = 0 then 'sin_dispositivos' else 'pendiente' end,
    jsonb_array_length(v_dispositivos)
  )
  returning * into v_notif;

  perform public.registrar_auditoria(v_actor, 'notificacion_enviada', v_dest, p_organizacion_id,
    jsonb_build_object('notificacion_id', v_notif.id, 'titulo', v_titulo,
                       'dispositivos', v_notif.dispositivos_total));

  return jsonb_build_object(
    'notificacion', public.notificacion_push_json(v_notif),
    'dispositivos', v_dispositivos
  );
end $$;

-- Guarda el resultado del envío. p_exitosos y p_invalidos son ids de
-- dispositivos: los invalidos (el servicio push dijo 404/410) se borran.
create or replace function public.admin_cerrar_notificacion(
  p_actor text, p_id uuid, p_exitosos uuid[], p_invalidos uuid[]
)
returns jsonb
language plpgsql
as $$
declare
  v_actor text := lower(trim(p_actor));
  v_scope uuid[];
  v_notif public.notificaciones_push;
  v_enviados integer := coalesce(cardinality(p_exitosos), 0);
begin
  v_scope := public.exigir_admin(v_actor);

  select * into v_notif from public.notificaciones_push where id = p_id for update;
  if not found
     or v_notif.remitente_email <> v_actor
     or not (v_notif.organizacion_id = any (v_scope)) then
    raise exception 'Notificación no encontrada' using errcode = 'P0002';
  end if;
  if v_notif.estado <> 'pendiente' then
    raise exception 'La notificación ya fue cerrada' using errcode = '55000';
  end if;

  update public.dispositivos_push
  set ultimo_uso_at = now()
  where email = v_notif.destinatario_email and id = any (coalesce(p_exitosos, '{}'));

  delete from public.dispositivos_push
  where email = v_notif.destinatario_email and id = any (coalesce(p_invalidos, '{}'));

  update public.notificaciones_push
  set enviados = v_enviados,
      fallidos = greatest(dispositivos_total - v_enviados, 0),
      estado = case
        when v_enviados = 0 then 'fallida'
        when v_enviados >= dispositivos_total then 'enviada'
        else 'parcial'
      end,
      enviada_at = case when v_enviados > 0 then now() else null end
  where id = p_id
  returning * into v_notif;

  return public.notificacion_push_json(v_notif);
end $$;

-- Historial dentro del scope del actor. p_organizacion_id nulo = todas las suyas.
create or replace function public.admin_listar_notificaciones(
  p_actor text, p_organizacion_id uuid default null, p_limite integer default 50
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_scope uuid[];
begin
  v_scope := public.exigir_admin(lower(trim(p_actor)));
  return coalesce((
    select jsonb_agg(public.notificacion_push_json(n) order by n.created_at desc)
    from (
      select * from public.notificaciones_push
      where organizacion_id = any (v_scope)
        and (p_organizacion_id is null or organizacion_id = p_organizacion_id)
      order by created_at desc
      limit least(greatest(coalesce(p_limite, 50), 1), 200)
    ) n
  ), '[]'::jsonb);
end $$;

-- ─────────────────────────────────────────────────────────
-- 7. Permisos de ejecución: sólo el backend (service_role)
-- ─────────────────────────────────────────────────────────

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.notificacion_push_json(public.notificaciones_push)',
    'public.push_registrar_dispositivo(text, text, text, text, text)',
    'public.push_quitar_dispositivo(text, text)',
    'public.admin_preparar_notificacion(text, uuid, text, text, text)',
    'public.admin_cerrar_notificacion(text, uuid, uuid[], uuid[])',
    'public.admin_listar_notificaciones(text, uuid, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────
-- 8. RLS y GRANTs
--
-- Sin políticas a propósito, como auditoria_admin y solicitudes: sólo el
-- backend accede.
-- ─────────────────────────────────────────────────────────

alter table public.dispositivos_push enable row level security;
alter table public.notificaciones_push enable row level security;

grant select, insert, update, delete on public.dispositivos_push, public.notificaciones_push to service_role;
revoke all on public.dispositivos_push, public.notificaciones_push from anon, authenticated;
