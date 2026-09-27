-- Borra la vista de compatibilidad allowed_emails.
--
-- 20260926000000_roles_y_admin la creó para que el backend desplegado antes de
-- ese cambio (que consultaba allowed_emails) siguiera funcionando hasta el
-- deploy del backend nuevo, que usa public.usuarios. Ya está desplegado
-- (2026-09-27): la vista no la usa nadie.

drop view if exists public.allowed_emails;
