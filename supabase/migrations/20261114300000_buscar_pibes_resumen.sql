-- Búsqueda de pibes en una sola consulta.
--
-- Antes: GET /api/students/search llamaba a buscar_pibes (que escanea los pibes
-- de TODAS las organizaciones, porque la función no se inlinea y el filtro por
-- organización se aplica después) y por cada resultado hacía 2 consultas más
-- (visitas y última asistencia), más un GET /api/attendance/check por tarjeta.
--
-- Ahora: buscar_pibes_resumen(p_org, ...) filtra por organización adentro,
-- busca por palabras (sin importar tildes, mayúsculas ni el orden: "juan perez"
-- y "perez juan" encuentran a Juan Pérez), limita los resultados y devuelve
-- visitas, última asistencia y si ya está marcado en la fecha pedida.
--
-- Sólo la usa el backend (service_role).

create extension if not exists pg_trgm with schema extensions;

-- unaccent() es STABLE y no se puede usar en un índice; este envoltorio fija el
-- diccionario y se declara IMMUTABLE (el diccionario no cambia en la práctica).
create or replace function public.normalizar_busqueda(texto text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, texto));
$$;

create index if not exists idx_pibes_busqueda_trgm
  on public.pibes
  using gin (public.normalizar_busqueda(nombre || ' ' || apellido) extensions.gin_trgm_ops);

create index if not exists idx_asistencias_org_fecha
  on public.asistencias (organizacion_id, fecha);

create index if not exists idx_asistencias_pibe_fecha
  on public.asistencias (pibe_id, fecha desc);

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
  v_inicio timestamptz;
  v_fin timestamptz;
begin
  -- Un patrón LIKE por palabra; se escapan \ % _ para que se busquen literales.
  select coalesce(array_agg('%' || replace(replace(replace(tok, '\', '\\'), '%', '\%'), '_', '\_') || '%'), '{}')
    into v_patrones
    from unnest(regexp_split_to_array(
           public.normalizar_busqueda(btrim(coalesce(p_termino, ''))), '\s+')) as tok
   where tok <> '';

  if coalesce(array_length(v_patrones, 1), 0) = 0 then
    return;
  end if;

  if p_fecha is not null then
    v_inicio := p_fecha::timestamp at time zone 'UTC';
    v_fin := (p_fecha + 1)::timestamp at time zone 'UTC';
  end if;

  return query
  with encontrados as (
    select p.*
      from public.pibes as p
     where p.organizacion_id = p_org
       and public.normalizar_busqueda(p.nombre || ' ' || p.apellido) like all (v_patrones)
     order by p.nombre, p.apellido
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
   order by e.nombre, e.apellido;
end;
$$;

revoke all on function public.buscar_pibes_resumen(uuid, text, date, integer)
  from public, anon, authenticated;
grant execute on function public.buscar_pibes_resumen(uuid, text, date, integer)
  to service_role;
