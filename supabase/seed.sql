-- Datos mínimos para desarrollo local. Sólo lo carga `supabase db reset`
-- (stack local); NUNCA se aplica a producción.
--
-- Las organizaciones "Oratorio de Garay" y "Escuadra 3" y el superadmin
-- oratoriogarayy@gmail.com ya los crean las migraciones.

insert into public.niveles_grados_pibes (nivel) values ('Inicial'), ('Primario'), ('Secundario')
on conflict (nivel) do nothing;

insert into public.grados_pibes (nivel, grado)
select 'Primario', g from generate_series(1, 7) g
union all
select 'Secundario', g from generate_series(1, 6) g;

insert into public.edades (nombre, organizacion_id)
select e.nombre, o.id
from (values ('Chiquitos'), ('Medianos'), ('Grandes'), ('Gigantes')) as e(nombre)
cross join public.organizaciones o;

-- Un pibe de ejemplo por organización, para probar búsqueda y asistencias.
insert into public.pibes (nombre, apellido, grado_id, edad_id, entrego_ficha, organizacion_id)
select 'Pibe', 'De Prueba ' || o.nombre,
  (select id from public.grados_pibes where nivel = 'Primario' and grado = 3 limit 1),
  (select id from public.edades where organizacion_id = o.id and nombre = 'Medianos' limit 1),
  true, o.id
from public.organizaciones o;
