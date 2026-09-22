ALTER TABLE public.profile_video_settings ADD COLUMN IF NOT EXISTS avatar_description text NOT NULL DEFAULT '';

CREATE TABLE public.profile_avatars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT public.default_tenant_id() REFERENCES public.tenants(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  reference_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  description text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_avatars TO authenticated;
GRANT ALL ON public.profile_avatars TO service_role;

ALTER TABLE public.profile_avatars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "avatars_select" ON public.profile_avatars
  FOR SELECT TO authenticated
  USING (public.can_view_profile(profile_id));

CREATE POLICY "avatars_insert" ON public.profile_avatars
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_profile(profile_id));

CREATE POLICY "avatars_update" ON public.profile_avatars
  FOR UPDATE TO authenticated
  USING (public.can_edit_profile(profile_id))
  WITH CHECK (public.can_edit_profile(profile_id));

CREATE POLICY "avatars_delete" ON public.profile_avatars
  FOR DELETE TO authenticated
  USING (public.can_edit_profile(profile_id));

CREATE TRIGGER profile_avatars_updated_at
  BEFORE UPDATE ON public.profile_avatars
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX profile_avatars_profile_idx ON public.profile_avatars (profile_id, created_at DESC);

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS avatar_id uuid REFERENCES public.profile_avatars(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS avatar_reference_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS avatar_description text;

COMMENT ON COLUMN public.jobs.avatar_reference_urls IS 'Override de avatar valido apenas para este video; nao altera o perfil.';