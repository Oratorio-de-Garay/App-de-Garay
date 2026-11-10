-- Notificaciones push programadas.
--
-- Sobre 20261106000000_notificaciones_push.sql: un admin puede enviar la misma
-- notificación a varios usuarios a la vez, de inmediato o programada para una
-- fecha y hora futuras.
--
-- No hay un worker propio: en Vercel no existe un proceso permanente. La tabla
-- notificaciones_push es la cola:
--   * programar = insertar filas con estado 'programada' y programada_para.
--   * cada minuto pg_cron corre despachar_notificaciones_programadas(), que sólo
--     si hay algo vencido llama (pg_net) a POST /api/push/despachar del backend.
--   * el backend toma las vencidas con push_tomar_vencidas (for update skip
--     locked: dos despachos simultáneos no envían dos veces), envía y cierra con
--     push_cerrar_programada.
-- La URL y el secreto del backend viven en Supabase Vault (no en el repo). Ver
-- docs/SETUP.md.

-- ─────────────────────────────────────────────────────────
-- 1. Columnas y estados nuevos
-- ─────────────────────────────────────────────────────────

alter table public.notificaciones_push
  add column if not exists programada_para timestamptz,
  add column if not exists lote_id uuid,
  add column if not exists cancelada_at timestamptz,
  add column if not exists tomada_at timestamptz,
  add column if not exists motivo text check (char_length(motivo) <= 200);

alter table public.notificaciones_push drop constraint if exists notificaciones_push_estado_check;
alter table public.notificaciones_push add constraint notificaciones_push_estado_check
  check (estado in ('pendiente', 'programada', 'enviando', 'enviada', 'parcial',
                    'fallida', 'sin_dispositivos', 'cancelada'));

create index if not exists notificaciones_push_programadas_idx
  on public.notificaciones_push (programada_para) where estado = 'programada';

alter table public.auditoria_admin drop constraint if exists auditoria_admin_accion_check;
alter table public.auditoria_admin add constraint auditoria_admin_accion_check check (accion in (
  'usuario_creado', 'usuario_renombrado', 'usuario_eliminado',
  'membresia_agregada', 'membresia_quitada',
  'rol_asignado', 'rol_quitado',
  'organizacion_creada', 'organizacion_renombrada',
  'solicitud_creada', 'solicitud_aceptada', 'solicitud_rechazada', 'solicitud_cancelada',
  'notificacion_enviada', 'notificacion_programada', 'notificacion_cancelada'
));

-- ─────────────────────────────────────────────────────────
-- 2. Forma única de una notificación (suma los campos nuevos)
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
    'enviada_at', n.enviada_at,
    'programada_para', n.programada_para,
    'lote_id', n.lote_id,
    'cancelada_at', n.cancelada_at,
    'motivo', n.motivo
  )
$$;

-- ─────────────────────────────────────────────────────────
-- 3. Crear (inmediata o programada) para varios destinatarios
--
-- Una fila por destinatario, con el mismo lote_id: cada una conserva su estado
-- y contadores. Un destinatario fuera de la organización no aborta el lote: se
-- informa en 'rechazados' sin revelar si existe. Si ninguno es válido, error.
--
-- p_programada_para nulo = inmediata: las filas quedan 'pendiente' y se devuelven
-- los dispositivos para que el backend envíe ahora. Con fecha, quedan
-- 'programada' y las toma el despachador. La fecha tiene que ser posterior a
-- ahora; esta función es la autoridad (el cliente sólo la valida por comodidad).
-- ─────────────────────────────────────────────────────────

create or replace function public.admin_crear_notificaciones(
  p_actor text, p_organizacion_id uuid, p_destinatarios text[], p_titulo text, p_texto text,
  p_programada_para timestamptz default null
)
returns jsonb
language plpgsql
as $$
declare
  v_actor text := lower(trim(p_actor));
  v_titulo text := trim(coalesce(p_titulo, ''));
  v_texto text := trim(coalesce(p_texto, ''));
  v_programada boolean := p_programada_para is not null;
  v_scope uuid[];
  v_lote uuid := gen_random_uuid();
  v_validos text[];
  v_dest text;
  v_rechazados text[] := '{}';
  v_notif public.notificaciones_push;
  v_dispositivos jsonb;
  v_items jsonb := '[]'::jsonb;
begin
  v_scope := public.exigir_admin(v_actor);

  if p_organizacion_id is null or not (p_organizacion_id = any (v_scope)) then
    raise exception 'No administrás esa organización' using errcode = '42501';
  end if;
  if char_length(v_titulo) not between 1 and 65 then
    raise exception 'El título es obligatorio (hasta 65 caracteres)' using errcode = '22023';
  end if;
  if char_length(v_texto) not between 1 and 240 then
    raise exception 'El texto es obligatorio (hasta 240 caracteres)' using errcode = '22023';
  end if;
  if v_programada and p_programada_para <= now() then
    raise exception 'La fecha de envío tiene que ser posterior a ahora' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct lower(trim(e))) filter (where trim(e) <> ''), '{}')
    into v_validos
  from unnest(coalesce(p_destinatarios, '{}')) e;
  if cardinality(v_validos) = 0 then
    raise exception 'Elegí al menos un destinatario' using errcode = '22023';
  end if;
  if cardinality(v_validos) > 50 then
    raise exception 'Hasta 50 destinatarios por envío' using errcode = '22023';
  end if;

  foreach v_dest in array v_validos loop
    if not exists (
      select 1 from public.organizacion_miembros
      where email = v_dest and organizacion_id = p_organizacion_id
    ) then
      v_rechazados := v_rechazados || v_dest;
      continue;
    end if;

    if v_programada then
      v_dispositivos := '[]'::jsonb;
      insert into public.notificaciones_push (
        organizacion_id, remitente_email, destinatario_email, titulo, texto,
        estado, programada_para, lote_id
      ) values (
        p_organizacion_id, v_actor, v_dest, v_titulo, v_texto,
        'programada', p_programada_para, v_lote
      )
      returning * into v_notif;

      perform public.registrar_auditoria(v_actor, 'notificacion_programada', v_dest, p_organizacion_id,
        jsonb_build_object('notificacion_id', v_notif.id, 'titulo', v_titulo,
                           'programada_para', p_programada_para));
    else
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', d.id, 'endpoint', d.endpoint, 'p256dh', d.p256dh, 'auth', d.auth)), '[]'::jsonb)
        into v_dispositivos
      from public.dispositivos_push d
      where d.email = v_dest;

      insert into public.notificaciones_push (
        organizacion_id, remitente_email, destinatario_email, titulo, texto,
        estado, dispositivos_total, lote_id
      ) values (
        p_organizacion_id, v_actor, v_dest, v_titulo, v_texto,
        case when jsonb_array_length(v_dispositivos) = 0 then 'sin_dispositivos' else 'pendiente' end,
        jsonb_array_length(v_dispositivos), v_lote
      )
      returning * into v_notif;

      perform public.registrar_auditoria(v_actor, 'notificacion_enviada', v_dest, p_organizacion_id,
        jsonb_build_object('notificacion_id', v_notif.id, 'titulo', v_titulo,
                           'dispositivos', v_notif.dispositivos_total));
    end if;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'notificacion', public.notificacion_push_json(v_notif),
      'dispositivos', v_dispositivos
    ));
  end loop;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Usuario no encontrado' using errcode = 'P0002';
  end if;

  return jsonb_build_object('lote_id', v_lote, 'items', v_items, 'rechazados', to_jsonb(v_rechazados));
end $$;

-- ─────────────────────────────────────────────────────────
-- 4. Cancelar una programada (sólo mientras siga 'programada')
-- ─────────────────────────────────────────────────────────

create or replace function public.admin_cancelar_notificacion(p_actor text, p_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_actor text := lower(trim(p_actor));
  v_scope uuid[];
  v_notif public.notificaciones_push;
begin
  v_scope := public.exigir_admin(v_actor);

  select * into v_notif from public.notificaciones_push where id = p_id for update;
  if not found or not (v_notif.organizacion_id = any (v_scope)) then
    raise exception 'Notificación no encontrada' using errcode = 'P0002';
  end if;
  if v_notif.estado <> 'programada' then
    raise exception 'Sólo se pueden cancelar las notificaciones programadas' using errcode = '55000';
  end if;

  update public.notificaciones_push
  set estado = 'cancelada', cancelada_at = now()
  where id = p_id
  returning * into v_notif;

  perform public.registrar_auditoria(v_actor, 'notificacion_cancelada', v_notif.destinatario_email,
    v_notif.organizacion_id,
    jsonb_build_object('notificacion_id', v_notif.id, 'titulo', v_notif.titulo));

  return public.notificacion_push_json(v_notif);
end $$;

-- ─────────────────────────────────────────────────────────
-- 5. Despachador (lo llama el backend, sin actor: no hay un usuario detrás)
--
-- El scope se validó al programar; acá se re-valida la membresía del
-- destinatario, porque pudo perder el acceso entre medio.
-- ─────────────────────────────────────────────────────────

create or replace function public.push_tomar_vencidas(p_limite integer default 20)
returns jsonb
language plpgsql
as $$
declare
  r public.notificaciones_push;
  v_n public.notificaciones_push;
  v_dispositivos jsonb;
  v_items jsonb := '[]'::jsonb;
begin
  -- Rescate: si la función de Vercel murió a mitad de un envío, vuelven a la cola.
  update public.notificaciones_push
  set estado = 'programada', tomada_at = null
  where estado = 'enviando' and tomada_at < now() - interval '10 minutes';

  for r in
    select * from public.notificaciones_push
    where estado = 'programada' and programada_para <= now()
    order by programada_para
    limit least(greatest(coalesce(p_limite, 20), 1), 100)
    for update skip locked
  loop
    if not exists (
      select 1 from public.organizacion_miembros
      where email = r.destinatario_email and organizacion_id = r.organizacion_id
    ) then
      update public.notificaciones_push
      set estado = 'fallida', motivo = 'El destinatario ya no pertenece a la organización'
      where id = r.id;
      continue;
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', d.id, 'endpoint', d.endpoint, 'p256dh', d.p256dh, 'auth', d.auth)), '[]'::jsonb)
      into v_dispositivos
    from public.dispositivos_push d
    where d.email = r.destinatario_email;

    if jsonb_array_length(v_dispositivos) = 0 then
      update public.notificaciones_push
      set estado = 'sin_dispositivos', dispositivos_total = 0
      where id = r.id
      returning * into v_n;
    else
      update public.notificaciones_push
      set estado = 'enviando', tomada_at = now(),
          dispositivos_total = jsonb_array_length(v_dispositivos)
      where id = r.id
      returning * into v_n;
    end if;

    perform public.registrar_auditoria(r.remitente_email, 'notificacion_enviada',
      r.destinatario_email, r.organizacion_id,
      jsonb_build_object('notificacion_id', r.id, 'titulo', r.titulo,
                         'dispositivos', v_n.dispositivos_total, 'programada', true));

    if v_n.estado = 'enviando' then
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'notificacion', public.notificacion_push_json(v_n),
        'dispositivos', v_dispositivos
      ));
    end if;
  end loop;

  return v_items;
end $$;

create or replace function public.push_cerrar_programada(
  p_id uuid, p_exitosos uuid[], p_invalidos uuid[]
)
returns jsonb
language plpgsql
as $$
declare
  v_notif public.notificaciones_push;
  v_enviados integer := coalesce(cardinality(p_exitosos), 0);
begin
  select * into v_notif from public.notificaciones_push where id = p_id for update;
  if not found or v_notif.estado <> 'enviando' then
    raise exception 'Notificación no encontrada' using errcode = 'P0002';
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

-- ─────────────────────────────────────────────────────────
-- 6. Historial: las programadas primero
-- ─────────────────────────────────────────────────────────

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
    select jsonb_agg(public.notificacion_push_json(n) order by (n.estado in ('programada', 'enviando')) desc,
                                                                coalesce(n.programada_para, n.created_at) desc)
    from (
      select * from public.notificaciones_push
      where organizacion_id = any (v_scope)
        and (p_organizacion_id is null or organizacion_id = p_organizacion_id)
      order by (estado in ('programada', 'enviando')) desc,
               coalesce(programada_para, created_at) desc
      limit least(greatest(coalesce(p_limite, 50), 1), 200)
    ) n
  ), '[]'::jsonb);
end $$;

-- ─────────────────────────────────────────────────────────
-- 7. Disparador: lo corre pg_cron cada minuto
--
-- Si no hay nada vencido no hace nada (cero requests al backend). Si hay, llama
-- al backend con el secreto compartido. La URL y el secreto están en Vault
-- ('despacho_url', 'despacho_secreto'); sin ellos no hace nada. security definer
-- porque lee Vault; nadie más que pg_cron (postgres) lo ejecuta.
-- ─────────────────────────────────────────────────────────

create or replace function public.despachar_notificaciones_programadas()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_secreto text;
begin
  if not exists (
    select 1 from public.notificaciones_push
    where (estado = 'programada' and programada_para <= now())
       or (estado = 'enviando' and tomada_at < now() - interval '10 minutes')
  ) then
    return;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'despacho_url';
  select decrypted_secret into v_secreto from vault.decrypted_secrets where name = 'despacho_secreto';
  if v_url is null or v_secreto is null then
    raise warning 'Hay notificaciones vencidas pero faltan despacho_url / despacho_secreto en Vault';
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secreto,
                                  'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end $$;

-- ─────────────────────────────────────────────────────────
-- 8. Permisos de ejecución
-- ─────────────────────────────────────────────────────────

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.admin_crear_notificaciones(text, uuid, text[], text, text, timestamptz)',
    'public.admin_cancelar_notificacion(text, uuid)',
    'public.push_tomar_vencidas(integer)',
    'public.push_cerrar_programada(uuid, uuid[], uuid[])'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;

  -- El disparador no lo ejecuta ningún rol de la API.
  revoke all on function public.despachar_notificaciones_programadas()
    from public, anon, authenticated, service_role;
end $$;

-- ─────────────────────────────────────────────────────────
-- 9. Programar el cron (si la base tiene pg_cron / pg_net)
--
-- Si una extensión no está disponible la migración no falla: las notificaciones
-- inmediatas siguen andando y el despacho se puede disparar por otro medio
-- (ver docs/SETUP.md).
-- ─────────────────────────────────────────────────────────

do $$
begin
  begin
    create extension if not exists pg_net;
  exception when others then
    raise notice 'pg_net no disponible: %', sqlerrm;
  end;
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron no disponible: %', sqlerrm;
  end;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'despachar-notificaciones';
    perform cron.schedule('despachar-notificaciones', '* * * * *',
                          'select public.despachar_notificaciones_programadas()');
  end if;
exception when others then
  raise notice 'No se pudo programar el cron de notificaciones: %', sqlerrm;
end $$;
