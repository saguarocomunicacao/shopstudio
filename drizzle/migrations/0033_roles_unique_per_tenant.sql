ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS roles_tenant_name_key ON public.roles (tenant_id, name);