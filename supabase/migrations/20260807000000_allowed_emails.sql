-- Allowlist of Google accounts (Classroom teachers) permitted to sign in.
create table if not exists public.allowed_emails (
  email text primary key,
  note text,
  created_at timestamptz not null default now()
);

-- Normalize to lowercase on write so lookups are case-insensitive.
create or replace function public.normalize_allowed_email()
returns trigger as $$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_normalize_allowed_email on public.allowed_emails;
create trigger trg_normalize_allowed_email
  before insert or update on public.allowed_emails
  for each row execute function public.normalize_allowed_email();

-- RLS: locked down by default. The backend reads this table with the
-- Supabase service role key, which bypasses RLS entirely, so no public
-- policies are needed (and none are added on purpose).
alter table public.allowed_emails enable row level security;

-- RLS bypass does not imply the base table GRANT — service_role still
-- needs explicit SELECT or reads fail with "permission denied" (42501).
grant select on public.allowed_emails to service_role;

-- Seed with a placeholder — replace with your teachers' real Google emails.
-- insert into public.allowed_emails (email, note) values
--   ('teacher1@gmail.com', 'Maestra 1°'),
--   ('teacher2@gmail.com', 'Maestro 2°');
