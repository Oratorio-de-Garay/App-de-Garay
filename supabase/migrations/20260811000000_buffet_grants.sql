-- The buffet_* tables were created with RLS policies but without the
-- underlying Postgres GRANTs, so every role (including service_role)
-- got "permission denied for table ..." before RLS was even evaluated.
-- This grants table + sequence access to anon/authenticated/service_role;
-- RLS policies (already in place) keep enforcing row-level access.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on
  public.buffet_categories,
  public.buffet_units,
  public.buffet_suppliers,
  public.buffet_products,
  public.buffet_product_costs,
  public.buffet_combos,
  public.buffet_combo_items,
  public.buffet_budgets,
  public.buffet_budget_items
to anon, authenticated, service_role;

grant usage, select on all sequences in schema public to anon, authenticated, service_role;
