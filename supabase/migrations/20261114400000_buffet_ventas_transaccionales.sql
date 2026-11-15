-- Ventas de buffet transaccionales.
--
-- Antes, POST/PATCH/DELETE /api/buffet/sales hacían entre 6 y 12 consultas
-- secuenciales desde el backend (con loops de await para expandir combos y
-- actualizar el stock producto por producto) y sin transacción: si algo fallaba
-- a mitad de camino quedaban ventas a medias, y dos ventas simultáneas podían
-- pisarse el stock (leer, sumar en JS, escribir).
--
-- Ahora cada operación es una función que corre en una sola transacción y
-- descuenta el stock con `stock_current = stock_current + delta` (atómico).
-- Se permite stock negativo a propósito (ferias del plato: donaciones).
--
-- Sólo las usa el backend (service_role), que valida la organización activa.

-- Índices que faltaban para las columnas por las que se filtra o se une.
create index if not exists buffet_combo_items_combo_idx
  on public.buffet_combo_items (combo_id);
create index if not exists buffet_budget_items_budget_idx
  on public.buffet_budget_items (budget_id);

-- Suma (p_sign = 1) o resta (p_sign = -1) al stock el equivalente de los ítems.
-- Cada ítem es {product_id?, combo_id?, quantity}; los combos se expanden a sus
-- productos. Si trae product_id manda ése, igual que antes.
create or replace function public.buffet_aplicar_stock(
  p_org uuid,
  p_items jsonb,
  p_sign integer
)
returns void
language sql
set search_path = ''
as $$
  with lineas as (
    select nullif(it ->> 'product_id', '')::uuid as product_id,
           nullif(it ->> 'combo_id', '')::uuid as combo_id,
           coalesce((it ->> 'quantity')::numeric, 0) as quantity
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as it
  ),
  expandido as (
    select l.product_id, l.quantity as quantity
      from lineas as l
     where l.product_id is not null
    union all
    select ci.product_id, l.quantity * ci.quantity
      from lineas as l
      join public.buffet_combo_items as ci
        on ci.combo_id = l.combo_id
       and ci.organizacion_id = p_org
     where l.product_id is null and l.combo_id is not null
  ),
  deltas as (
    select product_id, sum(quantity) as total
      from expandido
     where quantity <> 0
     group by product_id
  )
  update public.buffet_products as p
     set stock_current = p.stock_current + p_sign * d.total
    from deltas as d
   where p.id = d.product_id
     and p.organizacion_id = p_org;
$$;

-- Ítems de una venta con el formato que espera buffet_aplicar_stock.
create or replace function public.buffet_items_de_venta(p_org uuid, p_sale uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'product_id', i.product_id,
      'combo_id', i.combo_id,
      'quantity', i.quantity
    )),
    '[]'::jsonb)
  from public.buffet_sale_items as i
  where i.sale_id = p_sale and i.organizacion_id = p_org;
$$;

-- Inserta los ítems ({product_id, combo_id, description, quantity, unit_price,
-- line_total}) de una venta.
create or replace function public.buffet_insertar_items_venta(
  p_org uuid,
  p_sale uuid,
  p_items jsonb
)
returns void
language sql
set search_path = ''
as $$
  insert into public.buffet_sale_items
    (sale_id, organizacion_id, product_id, combo_id, description, quantity, unit_price, line_total)
  select p_sale,
         p_org,
         nullif(it ->> 'product_id', '')::uuid,
         nullif(it ->> 'combo_id', '')::uuid,
         coalesce(it ->> 'description', 'Sin descripción'),
         coalesce((it ->> 'quantity')::numeric, 1),
         coalesce((it ->> 'unit_price')::numeric, 0),
         coalesce((it ->> 'line_total')::numeric, 0)
    from jsonb_array_elements(p_items) as it;
$$;

-- Crea la venta con sus ítems y descuenta el stock. Devuelve {id} o null si el
-- evento no existe en la organización.
create or replace function public.buffet_crear_venta(
  p_org uuid,
  p_event_id uuid,
  p_sale_date date,
  p_payment_method text,
  p_observation text,
  p_total numeric,
  p_items jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_evento record;
  v_sale uuid;
begin
  select e.id, e.nombre, e.fecha
    into v_evento
    from public.buffet_eventos as e
   where e.id = p_event_id and e.organizacion_id = p_org;

  if not found then
    return null;
  end if;

  insert into public.buffet_sales
    (sale_date, event_id, event_name, payment_method, observation, total_amount, organizacion_id)
  values
    (coalesce(p_sale_date, v_evento.fecha),
     v_evento.id,
     -- Snapshot del nombre: el historial sigue legible si el evento se renombra.
     v_evento.nombre,
     coalesce(p_payment_method, 'efectivo'),
     p_observation,
     p_total,
     p_org)
  returning id into v_sale;

  perform public.buffet_insertar_items_venta(p_org, v_sale, p_items);
  perform public.buffet_aplicar_stock(p_org, p_items, -1);

  return jsonb_build_object('id', v_sale);
end;
$$;

-- Reemplaza los ítems de la venta: devuelve el stock de los viejos y descuenta
-- el de los nuevos. Devuelve {id} o null si la venta no existe en la organización.
create or replace function public.buffet_editar_venta(
  p_org uuid,
  p_sale uuid,
  p_payment_method text,
  p_observation text,
  p_total numeric,
  p_items jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  -- Bloquea la venta: dos ediciones simultáneas no se intercalan.
  select s.id into v_id
    from public.buffet_sales as s
   where s.id = p_sale and s.organizacion_id = p_org
     for update;

  if not found then
    return null;
  end if;

  perform public.buffet_aplicar_stock(p_org, public.buffet_items_de_venta(p_org, p_sale), 1);

  delete from public.buffet_sale_items
   where sale_id = p_sale and organizacion_id = p_org;

  perform public.buffet_insertar_items_venta(p_org, p_sale, p_items);
  perform public.buffet_aplicar_stock(p_org, p_items, -1);

  update public.buffet_sales
     set payment_method = coalesce(p_payment_method, 'efectivo'),
         observation = p_observation,
         total_amount = p_total
   where id = p_sale and organizacion_id = p_org;

  return jsonb_build_object('id', p_sale);
end;
$$;

-- Devuelve el stock de la venta y la borra (los ítems caen en cascada).
create or replace function public.buffet_borrar_venta(p_org uuid, p_sale uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select s.id into v_id
    from public.buffet_sales as s
   where s.id = p_sale and s.organizacion_id = p_org
     for update;

  if not found then
    return;
  end if;

  perform public.buffet_aplicar_stock(p_org, public.buffet_items_de_venta(p_org, p_sale), 1);

  delete from public.buffet_sales
   where id = p_sale and organizacion_id = p_org;
end;
$$;

do $$
declare
  f text;
begin
  for f in
    select p.oid::regprocedure::text
      from pg_proc as p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in (
         'buffet_aplicar_stock', 'buffet_items_de_venta', 'buffet_insertar_items_venta',
         'buffet_crear_venta', 'buffet_editar_venta', 'buffet_borrar_venta')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
