CREATE OR REPLACE FUNCTION public.default_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
  SELECT COALESCE(private.current_tenant_id(), 'f7192d96-160f-4157-8599-eced5990bf8b'::uuid);
$$;

GRANT EXECUTE ON FUNCTION public.default_tenant_id() TO authenticated, anon, service_role;

ALTER TABLE public.profiles ALTER COLUMN tenant_id SET DEFAULT public.default_tenant_id();
ALTER TABLE public.products ALTER COLUMN tenant_id SET DEFAULT public.default_tenant_id();
ALTER TABLE public.profile_identities ALTER COLUMN tenant_id SET DEFAULT public.default_tenant_id();
ALTER TABLE public.profile_video_settings ALTER COLUMN tenant_id SET DEFAULT public.default_tenant_id();
ALTER TABLE public.profile_prompt_overrides ALTER COLUMN tenant_id SET DEFAULT public.default_tenant_id();
ALTER TABLE public.jobs ALTER COLUMN tenant_id SET DEFAULT public.default_tenant_id();
ALTER TABLE public.job_stage_events ALTER COLUMN tenant_id SET DEFAULT public.default_tenant_id();
ALTER TABLE public.job_shares ALTER COLUMN tenant_id SET DEFAULT public.default_tenant_id();
ALTER TABLE public.tiktok_connections ALTER COLUMN tenant_id SET DEFAULT public.default_tenant_id();
ALTER TABLE public.tiktok_oauth_states ALTER COLUMN tenant_id SET DEFAULT public.default_tenant_id();
ALTER TABLE public.consumo_eventos ALTER COLUMN tenant_id SET DEFAULT public.default_tenant_id();
ALTER TABLE public.voices ALTER COLUMN tenant_id SET DEFAULT public.default_tenant_id();
ALTER TABLE public.user_profile_roles ALTER COLUMN tenant_id SET DEFAULT public.default_tenant_id();
ALTER TABLE public.roles ALTER COLUMN tenant_id SET DEFAULT public.default_tenant_id();
ALTER TABLE public.role_permissions ALTER COLUMN tenant_id SET DEFAULT public.default_tenant_id();
ALTER TABLE public.app_users ALTER COLUMN tenant_id SET DEFAULT public.default_tenant_id();