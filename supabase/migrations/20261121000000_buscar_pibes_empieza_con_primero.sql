-- Búsqueda de pibes: los que "empiezan con" lo buscado van antes que los que
-- sólo lo "contienen".
--
-- Una palabra del término "empieza" cuando algún nombre o apellido del pibe
-- arranca con ella ("ju" -> Juan, Juana; "pe" -> Juan Pérez por el apellido).
-- Si todas las palabras empiezan una palabra del nombre completo, el pibe va
-- primero; el resto (que sólo contiene el texto: "uan" -> Juan) va después.
-- Dentro de cada grupo se mantiene el orden por nombre y apellido. El orden se
-- aplica antes del límite, así que los que empiezan con el término nunca
-- quedan afuera por culpa de los que sólo lo contienen.
--
-- Misma firma y mismas columnas que antes: no cambia la API ni los tipos.

create or replace function public.buscar_pibes_resumen(
  p_org uuid,
  p_termino text,
  p_fecha date default null,
  p_limite integer default 30
)
returns table (
  id uuid,
  nombre varchar,
  apellido varchar,
  entrego_ficha boolean,
  observaciones text,
  telefono_emergencia bigint,
  grado_id bigint,
  grado_nivel varchar,
  grado_numero smallint,
  edad_id bigint,
  edad_nombre varchar,
  visitas bigint,
  ultima_asistencia timestamptz,
  marcado_hoy boolean
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_patrones text[];
  v_prefijos text[];
  v_inicio timestamptz;
  v_fin timestamptz;
begin
  -- Un patrón LIKE por palabra; se escapan \ % _ para que se busquen literales.
  -- v_patrones: la palabra en cualquier parte. v_prefijos: al comienzo de una
  -- palabra del nombre completo (se compara contra ' ' || nombre completo).
  select coalesce(array_agg('%' || palabras.esc || '%'), '{}'),
         coalesce(array_agg('% ' || palabras.esc || '%'), '{}')
    into v_patrones, v_prefijos
    from (
      select replace(replace(replace(tok, '\', '\\'), '%', '\%'), '_', '\_') as esc
        from unnest(regexp_split_to_array(
               public.normalizar_busqueda(btrim(coalesce(p_termino, ''))), '\s+')) as tok
       where tok <> ''
    ) as palabras;

  if coalesce(array_length(v_patrones, 1), 0) = 0 then
    return;
  end if;

  if p_fecha is not null then
    v_inicio := p_fecha::timestamp at time zone 'UTC';
    v_fin := (p_fecha + 1)::timestamp at time zone 'UTC';
  end if;

  return query
  with encontrados as (
    select p.*,
           case
             when (' ' || public.normalizar_busqueda(p.nombre || ' ' || p.apellido)) like all (v_prefijos)
               then 0
             else 1
           end as rango
      from public.pibes as p
     where p.organizacion_id = p_org
       and public.normalizar_busqueda(p.nombre || ' ' || p.apellido) like all (v_patrones)
     order by rango, p.nombre, p.apellido
     limit greatest(1, least(coalesce(p_limite, 30), 100))
  )
  select e.id,
         e.nombre,
         e.apellido,
         e.entrego_ficha,
         e.observaciones,
         e.telefono_emergencia,
         g.id,
         g.nivel,
         g.grado,
         ed.id,
         ed.nombre,
         coalesce(a.visitas, 0),
         a.ultima,
         coalesce(a.hoy, false)
    from encontrados as e
    left join public.grados_pibes as g on g.id = e.grado_id
    left join public.edades as ed on ed.id = e.edad_id
    left join lateral (
      select count(*) as visitas,
             max(x.fecha) as ultima,
             bool_or(v_inicio is not null and x.fecha >= v_inicio and x.fecha < v_fin) as hoy
        from public.asistencias as x
       where x.pibe_id = e.id
         and x.organizacion_id = p_org
    ) as a on true
   order by e.rango, e.nombre, e.apellido;
end;
$$;

-- create or replace conserva los permisos, pero se reafirman por claridad.
revoke all on function public.buscar_pibes_resumen(uuid, text, date, integer)
  from public, anon, authenticated;
grant execute on function public.buscar_pibes_resumen(uuid, text, date, integer)
  to service_role;
