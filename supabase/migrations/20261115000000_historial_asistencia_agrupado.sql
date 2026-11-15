-- Historial de asistencia agrupado en SQL.
--
-- Antes, GET /api/attendance/dates y /api/attendance/top traían TODAS las
-- asistencias del año (y /top con join a pibes) y contaban en JavaScript. Ahora
-- la base devuelve ya agrupado: una fila por día, o una fila por pibe.
--
-- El día se toma en UTC, igual que hacía el backend (primeros 10 caracteres del
-- ISO de `fecha`). Un pibe cuenta una sola vez por día aunque tenga asistencias
-- duplicadas.
--
-- Sólo las usa el backend (service_role), que valida la organización activa.

create or replace function public.asistencia_fechas(p_org uuid, p_anio integer)
returns table (fecha date, total bigint)
language sql
stable
set search_path = ''
as $$
  select (a.fecha at time zone 'UTC')::date as fecha,
         count(distinct a.pibe_id) as total
    from public.asistencias as a
   where a.organizacion_id = p_org
     and a.fecha >= make_timestamptz(p_anio, 1, 1, 0, 0, 0, 'UTC')
     and a.fecha <  make_timestamptz(p_anio + 1, 1, 1, 0, 0, 0, 'UTC')
   group by 1
   order by 1 desc;
$$;

-- Devuelve los pibes cuyo total está entre los 3 primeros puestos (incluye los
-- empatados en el tercero) para que el backend desempate por nombre.
create or replace function public.asistencia_top(p_org uuid, p_anio integer)
returns table (id uuid, nombre varchar, apellido varchar, total bigint)
language sql
stable
set search_path = ''
as $$
  with por_pibe as (
    select a.pibe_id,
           count(distinct (a.fecha at time zone 'UTC')::date) as total
      from public.asistencias as a
     where a.organizacion_id = p_org
       and a.fecha >= make_timestamptz(p_anio, 1, 1, 0, 0, 0, 'UTC')
       and a.fecha <  make_timestamptz(p_anio + 1, 1, 1, 0, 0, 0, 'UTC')
     group by a.pibe_id
  ),
  rankeado as (
    select pp.pibe_id, pp.total, rank() over (order by pp.total desc) as puesto
      from por_pibe as pp
  )
  select p.id, p.nombre, p.apellido, r.total
    from rankeado as r
    join public.pibes as p on p.id = r.pibe_id
   where r.puesto <= 3
   order by r.total desc, p.nombre, p.apellido;
$$;

revoke all on function public.asistencia_fechas(uuid, integer) from public, anon, authenticated;
revoke all on function public.asistencia_top(uuid, integer) from public, anon, authenticated;
grant execute on function public.asistencia_fechas(uuid, integer) to service_role;
grant execute on function public.asistencia_top(uuid, integer) to service_role;
