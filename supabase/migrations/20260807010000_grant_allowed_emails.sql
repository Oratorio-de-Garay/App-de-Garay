-- The service_role key bypasses RLS but still needs the base table
-- privilege grant — RLS alone doesn't imply GRANT. Without this, the
-- backend's service-role client gets "permission denied for table
-- allowed_emails" (42501) even though RLS is correctly configured.
grant select on public.allowed_emails to service_role;
