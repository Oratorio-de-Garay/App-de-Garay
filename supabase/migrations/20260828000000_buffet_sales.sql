-- Ventas de buffet.
-- En las ferias del plato los productos son donaciones: no tienen costo ni
-- proveedor, sólo se venden. is_donated permite distinguirlos en reportes.

alter table public.buffet_products
  add column if not exists is_donated boolean not null default false;

create table if not exists public.buffet_sales (
  id uuid primary key default gen_random_uuid(),
  sale_date date not null default current_date,
  event_name text,
  payment_method text not null default 'efectivo',
  observation text,
  total_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- description guarda el nombre del producto/combo al momento de la venta, para
-- que el historial siga siendo legible si después se borra o renombra.
create table if not exists public.buffet_sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.buffet_sales(id) on delete cascade,
  product_id uuid references public.buffet_products(id) on delete set null,
  combo_id uuid references public.buffet_combos(id) on delete set null,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists buffet_sales_date_idx on public.buffet_sales (sale_date desc);
create index if not exists buffet_sale_items_sale_idx on public.buffet_sale_items (sale_id);

drop trigger if exists buffet_sales_updated_at on public.buffet_sales;
create trigger buffet_sales_updated_at before update on public.buffet_sales for each row execute function public.set_updated_at();

alter table public.buffet_sales enable row level security;
alter table public.buffet_sale_items enable row level security;

do $$ begin
  execute 'create policy "allow authenticated buffet sales" on public.buffet_sales for all to authenticated using (true) with check (true)';
  execute 'create policy "allow authenticated buffet sale items" on public.buffet_sale_items for all to authenticated using (true) with check (true)';
exception when duplicate_object then null;
end $$;

-- Los GRANT de Postgres son imprescindibles: sin ellos el acceso se rechaza
-- ("permission denied for table ...") antes incluso de evaluar las políticas RLS.
grant select, insert, update, delete on
  public.buffet_sales,
  public.buffet_sale_items
to anon, authenticated, service_role;
