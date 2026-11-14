-- Notificaciones push: push_registrar_dispositivo avisa si la suscripción
-- necesita renovarse.
--
-- Contexto: el servicio push (FCM, etc.) puede dar por vencida una suscripción
-- (404/410) sin que el navegador lo note: el permiso sigue "Permitido" y la
-- suscripción local sigue existiendo. El dispositivo queda desactivado (o
-- borrado) en la base y el frontend se ve "activo", así que nunca se registra
-- de nuevo.
--
-- El frontend ahora re-registra su suscripción en cada carga. Para saber si la
-- que tiene es una vencida, la función devuelve además de `id`:
--   renovar = true  si el endpoint no existía o estaba desactivado antes de
--                   este registro (el servicio push ya lo había dado por vencido
--                   o la base no lo conocía). El frontend entonces crea una
--                   suscripción nueva y la registra.
--   renovar = false si ya estaba activo (nada que hacer).
-- Cambio aditivo: misma firma y permisos; sólo cambia el JSON devuelto.

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
  v_existia boolean;
  v_desactivado timestamptz;
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

  select true, desactivado_at into v_existia, v_desactivado
  from public.dispositivos_push where endpoint = v_endpoint;

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

  return jsonb_build_object(
    'id', v_id,
    'renovar', not coalesce(v_existia, false) or v_desactivado is not null
  );
end $$;
