-- Administración > Notificaciones > Dispositivos: lista, por usuario del scope del
-- actor, los dispositivos con notificaciones push activadas.
--
-- Un dispositivo pertenece al usuario (no a una organización): si el usuario está
-- en varias organizaciones del scope se lista una sola vez, con todas ellas.
-- Nunca se devuelven endpoint, p256dh ni auth (son secretos de la suscripción);
-- sólo el host del endpoint, que identifica al servicio push (FCM, Mozilla, Apple).
-- Sólo lectura: no cambia el schema ni las políticas RLS.

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
        exists (select 1 from public.dispositivos_push d where d.email = u.email) as con_dispositivos,
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
                     'ultimo_uso_at', d.ultimo_uso_at
                   ) order by coalesce(d.ultimo_uso_at, d.created_at) desc), '[]'::jsonb)
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

revoke all on function public.admin_listar_dispositivos(text, uuid) from public, anon, authenticated;
grant execute on function public.admin_listar_dispositivos(text, uuid) to service_role;
