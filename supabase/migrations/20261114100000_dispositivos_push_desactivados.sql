-- Notificaciones push: un dispositivo que el servicio push da por vencido (404/410,
-- p. ej. el usuario las desactivó desde el navegador) se marca como desactivado
-- en vez de borrarse.
--
-- Así Administración > Notificaciones > Dispositivos distingue "nunca las activó"
-- de "las tenía y se desactivaron", y conserva navegador y fecha de alta.
--   - Los desactivados no reciben envíos ni cuentan como "con notificaciones".
--   - Volver a activarlas desde el mismo navegador reutiliza la fila (mismo
--     endpoint) y limpia la marca; con un endpoint nuevo se crea otra fila.
--   - Quitar el dispositivo a pedido del usuario (push_quitar_dispositivo) sigue
--     borrándolo.
--   - El tope de 20 por usuario descarta primero los desactivados.
-- Cambio aditivo: una columna nullable; las funciones se redefinen con
-- create or replace (mismas firmas, mismos permisos).

alter table public.dispositivos_push add column if not exists desactivado_at timestamptz;

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
        ultimo_uso_at = now(),
        desactivado_at = null
  returning id into v_id;

  -- Tope por usuario: se descartan los más viejos (los desactivados primero).
  delete from public.dispositivos_push d
  where d.email = v_email
    and d.id in (
      select id from public.dispositivos_push
      where email = v_email
      order by (desactivado_at is null) desc, coalesce(ultimo_uso_at, created_at) desc
      offset 20
    );

  return jsonb_build_object('id', v_id);
end $$;

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
  where d.email = v_dest and d.desactivado_at is null;

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

  update public.dispositivos_push
  set desactivado_at = now()
  where desactivado_at is null and email = v_notif.destinatario_email and id = any (coalesce(p_invalidos, '{}'));

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
      where d.email = v_dest and d.desactivado_at is null;

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
    where d.email = r.destinatario_email and d.desactivado_at is null;

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

  update public.dispositivos_push
  set desactivado_at = now()
  where desactivado_at is null and email = v_notif.destinatario_email and id = any (coalesce(p_invalidos, '{}'));

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

create or replace function public.admin_listar_dispositivos(
  p_actor text, p_organizacion_id uuid default null
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
    select jsonb_agg(x.fila order by x.con_dispositivos desc, lower(coalesce(nullif(x.nombre, ''), x.email)))
    from (
      select
        u.email,
        u.nombre,
        exists (select 1 from public.dispositivos_push d where d.email = u.email and d.desactivado_at is null) as con_dispositivos,
        jsonb_build_object(
          'email', u.email,
          'nombre', u.nombre,
          'organizaciones', (
            select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'nombre', o.nombre) order by o.nombre), '[]'::jsonb)
            from public.organizacion_miembros m2
            join public.organizaciones o on o.id = m2.organizacion_id
            where m2.email = u.email
              and m2.organizacion_id = any (v_scope)
              and (p_organizacion_id is null or m2.organizacion_id = p_organizacion_id)
          ),
          'dispositivos', (
            select coalesce(jsonb_agg(jsonb_build_object(
                     'id', d.id,
                     'user_agent', d.user_agent,
                     'servicio', substring(d.endpoint from '^https://([^/]+)'),
                     'created_at', d.created_at,
                     'ultimo_uso_at', d.ultimo_uso_at,
                     'desactivado_at', d.desactivado_at
                   ) order by (d.desactivado_at is null) desc, coalesce(d.ultimo_uso_at, d.created_at) desc), '[]'::jsonb)
            from public.dispositivos_push d
            where d.email = u.email
          )
        ) as fila
      from public.usuarios u
      where exists (
        select 1 from public.organizacion_miembros m
        where m.email = u.email
          and m.organizacion_id = any (v_scope)
          and (p_organizacion_id is null or m.organizacion_id = p_organizacion_id)
      )
    ) x
  ), '[]'::jsonb);
end $$;
