-- Ventas de buffet transaccionales: stock con combos, edición, borrado y
-- aislamiento por organización. Correr con: supabase test db.
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

select public.superadmin_guardar_organizacion('oratoriogarayy@gmail.com', null, 'ZZ Buf A');
select public.superadmin_guardar_organizacion('oratoriogarayy@gmail.com', null, 'ZZ Buf B');
create temp table org as
  select (select id from public.organizaciones where nombre = 'ZZ Buf A') as a,
         (select id from public.organizaciones where nombre = 'ZZ Buf B') as b;

insert into public.buffet_eventos (nombre, fecha, organizacion_id)
  values ('ZZ Evento', '2026-11-14', (select a from org));
insert into public.buffet_products (name, stock_current, organizacion_id)
  values ('ZZ Pancho', 100, (select a from org)), ('ZZ Gaseosa', 50, (select a from org));
insert into public.buffet_combos (name, sale_price, organizacion_id)
  values ('ZZ Combo', 10, (select a from org));
insert into public.buffet_combo_items (combo_id, product_id, quantity, organizacion_id)
  select (select id from public.buffet_combos where name = 'ZZ Combo'), id, 1, (select a from org)
    from public.buffet_products where name in ('ZZ Pancho', 'ZZ Gaseosa');

create temp table venta (id uuid);
insert into venta
select (public.buffet_crear_venta(
  (select a from org),
  (select id from public.buffet_eventos where nombre = 'ZZ Evento'),
  null, 'efectivo', null, 40,
  jsonb_build_array(
    jsonb_build_object('product_id', (select id from public.buffet_products where name = 'ZZ Pancho'),
      'description', 'Pancho', 'quantity', 2, 'unit_price', 5, 'line_total', 10),
    jsonb_build_object('combo_id', (select id from public.buffet_combos where name = 'ZZ Combo'),
      'description', 'Combo', 'quantity', 3, 'unit_price', 10, 'line_total', 30)
  )) ->> 'id')::uuid;

select is((select stock_current from public.buffet_products where name = 'ZZ Pancho'), 95.00,
  'crear: 2 sueltos + 3 del combo descuentan 5 panchos');
select is((select stock_current from public.buffet_products where name = 'ZZ Gaseosa'), 47.00,
  'crear: el combo descuenta sus productos');
select is((select count(*)::int from public.buffet_sale_items where sale_id = (select id from venta)), 2,
  'crear: guarda los ítems');
select is(public.buffet_crear_venta((select b from org),
  (select id from public.buffet_eventos where nombre = 'ZZ Evento'),
  null, 'efectivo', null, 1, '[]'::jsonb), null,
  'crear: un evento de otra organización devuelve null');

select public.buffet_editar_venta((select a from org), (select id from venta), 'efectivo', null, 5,
  jsonb_build_array(jsonb_build_object('product_id', (select id from public.buffet_products where name = 'ZZ Pancho'),
    'description', 'Pancho', 'quantity', 1, 'unit_price', 5, 'line_total', 5)));
select is((select stock_current from public.buffet_products where name = 'ZZ Pancho'), 99.00,
  'editar: devuelve lo viejo y descuenta lo nuevo');
select is((select stock_current from public.buffet_products where name = 'ZZ Gaseosa'), 50.00,
  'editar: el combo quitado devuelve su stock');

select public.buffet_borrar_venta((select b from org), (select id from venta));
select is((select count(*)::int from public.buffet_sales where id = (select id from venta)), 1,
  'borrar: otra organización no puede borrar la venta');

select public.buffet_borrar_venta((select a from org), (select id from venta));
select is((select stock_current from public.buffet_products where name = 'ZZ Pancho'), 100.00,
  'borrar: devuelve el stock');

select * from finish();
rollback;
