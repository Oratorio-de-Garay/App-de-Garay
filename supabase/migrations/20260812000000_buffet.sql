create table if not exists public.buffet_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.buffet_units (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  abbreviation text,
  pack_size numeric(12,2) not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.buffet_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.buffet_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category_id uuid references public.buffet_categories(id) on delete set null,
  unit_id uuid references public.buffet_units(id) on delete set null,
  stock_current numeric(12,2) not null default 0,
  sale_price numeric(12,2) not null default 0,
  observation text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.buffet_product_costs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.buffet_products(id) on delete cascade,
  supplier_id uuid references public.buffet_suppliers(id) on delete set null,
  cost numeric(12,2) not null,
  pack_size numeric(12,2) not null default 1,
  observation text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.buffet_combos (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  sale_price numeric(12,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.buffet_combo_items (
  id uuid primary key default gen_random_uuid(),
  combo_id uuid not null references public.buffet_combos(id) on delete cascade,
  product_id uuid not null references public.buffet_products(id) on delete restrict,
  quantity numeric(12,2) not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.buffet_budgets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  client_name text,
  observation text,
  status text not null default 'borrador',
  total_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.buffet_budget_items (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.buffet_budgets(id) on delete cascade,
  product_id uuid references public.buffet_products(id) on delete set null,
  combo_id uuid references public.buffet_combos(id) on delete set null,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists buffet_categories_updated_at on public.buffet_categories;
create trigger buffet_categories_updated_at before update on public.buffet_categories for each row execute function public.set_updated_at();
drop trigger if exists buffet_units_updated_at on public.buffet_units;
create trigger buffet_units_updated_at before update on public.buffet_units for each row execute function public.set_updated_at();
drop trigger if exists buffet_suppliers_updated_at on public.buffet_suppliers;
create trigger buffet_suppliers_updated_at before update on public.buffet_suppliers for each row execute function public.set_updated_at();
drop trigger if exists buffet_products_updated_at on public.buffet_products;
create trigger buffet_products_updated_at before update on public.buffet_products for each row execute function public.set_updated_at();
drop trigger if exists buffet_product_costs_updated_at on public.buffet_product_costs;
create trigger buffet_product_costs_updated_at before update on public.buffet_product_costs for each row execute function public.set_updated_at();
drop trigger if exists buffet_combos_updated_at on public.buffet_combos;
create trigger buffet_combos_updated_at before update on public.buffet_combos for each row execute function public.set_updated_at();
drop trigger if exists buffet_budgets_updated_at on public.buffet_budgets;
create trigger buffet_budgets_updated_at before update on public.buffet_budgets for each row execute function public.set_updated_at();

alter table public.buffet_categories enable row level security;
alter table public.buffet_units enable row level security;
alter table public.buffet_suppliers enable row level security;
alter table public.buffet_products enable row level security;
alter table public.buffet_product_costs enable row level security;
alter table public.buffet_combos enable row level security;
alter table public.buffet_combo_items enable row level security;
alter table public.buffet_budgets enable row level security;
alter table public.buffet_budget_items enable row level security;

do $$ begin
  execute 'create policy "allow authenticated buffet categories" on public.buffet_categories for all to authenticated using (true) with check (true)';
  execute 'create policy "allow authenticated buffet units" on public.buffet_units for all to authenticated using (true) with check (true)';
  execute 'create policy "allow authenticated buffet suppliers" on public.buffet_suppliers for all to authenticated using (true) with check (true)';
  execute 'create policy "allow authenticated buffet products" on public.buffet_products for all to authenticated using (true) with check (true)';
  execute 'create policy "allow authenticated buffet product costs" on public.buffet_product_costs for all to authenticated using (true) with check (true)';
  execute 'create policy "allow authenticated buffet combos" on public.buffet_combos for all to authenticated using (true) with check (true)';
  execute 'create policy "allow authenticated buffet combo items" on public.buffet_combo_items for all to authenticated using (true) with check (true)';
  execute 'create policy "allow authenticated buffet budgets" on public.buffet_budgets for all to authenticated using (true) with check (true)';
  execute 'create policy "allow authenticated buffet budget items" on public.buffet_budget_items for all to authenticated using (true) with check (true)';
exception when duplicate_object then null;
end $$;
