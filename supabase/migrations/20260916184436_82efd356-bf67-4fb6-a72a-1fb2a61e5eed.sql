CREATE TABLE IF NOT EXISTS public.profile_video_settings (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  avatar_mode text NOT NULL DEFAULT 'livre',
  avatar_reference_url text,
  takes_count integer NOT NULL DEFAULT 3,
  gemini_model text NOT NULL DEFAULT 'gemini-3.1-flash-image',
  veo_model text NOT NULL DEFAULT 'veo-3.1-fast-generate-001',
  take_duration integer NOT NULL DEFAULT 8,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_video_settings_avatar_mode_chk CHECK (avatar_mode IN ('fixo','livre')),
  CONSTRAINT profile_video_settings_takes_chk CHECK (takes_count BETWEEN 1 AND 5),
  CONSTRAINT profile_video_settings_duration_chk CHECK (take_duration IN (4,6,8))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_video_settings TO authenticated;
GRANT ALL ON public.profile_video_settings TO service_role;
ALTER TABLE public.profile_video_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pvs_select" ON public.profile_video_settings FOR SELECT TO authenticated
  USING (private.has_permission(auth.uid(), profile_id, 'perfis', 'visualizar'));
CREATE POLICY "pvs_insert" ON public.profile_video_settings FOR INSERT TO authenticated
  WITH CHECK (private.has_permission(auth.uid(), profile_id, 'perfis', 'editar'));
CREATE POLICY "pvs_update" ON public.profile_video_settings FOR UPDATE TO authenticated
  USING (private.has_permission(auth.uid(), profile_id, 'perfis', 'editar'))
  WITH CHECK (private.has_permission(auth.uid(), profile_id, 'perfis', 'editar'));

CREATE TRIGGER profile_video_settings_set_updated_at
  BEFORE UPDATE ON public.profile_video_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS render_stage text,
  ADD COLUMN IF NOT EXISTS scenes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS gemini_images_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS veo_takes_count integer NOT NULL DEFAULT 0;