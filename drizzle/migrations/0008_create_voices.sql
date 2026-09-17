ALTER TYPE public.etapa_consumo ADD VALUE IF NOT EXISTS 'narracao_elevenlabs';
ALTER TYPE public.unidade_tarifa ADD VALUE IF NOT EXISTS 'mil_caracteres';

CREATE TABLE public.voices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  fonte text NOT NULL CHECK (fonte IN ('clonada', 'elevenlabs_catalogo', 'azure_padrao')),
  voice_id text NOT NULL,
  genero text CHECK (genero IN ('masculino', 'feminino', 'neutro')),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  preview_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX voices_global_unique ON public.voices (fonte, voice_id) WHERE profile_id IS NULL;
CREATE UNIQUE INDEX voices_profile_unique ON public.voices (fonte, voice_id, profile_id) WHERE profile_id IS NOT NULL;
CREATE INDEX voices_profile_idx ON public.voices (profile_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.voices TO authenticated;
GRANT ALL ON public.voices TO service_role;

ALTER TABLE public.voices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "voices_select" ON public.voices FOR SELECT TO authenticated USING (true);
CREATE POLICY "voices_insert_admin" ON public.voices FOR INSERT TO authenticated WITH CHECK (private.is_app_admin(auth.uid()));
CREATE POLICY "voices_update_admin" ON public.voices FOR UPDATE TO authenticated USING (private.is_app_admin(auth.uid())) WITH CHECK (private.is_app_admin(auth.uid()));
CREATE POLICY "voices_delete_admin" ON public.voices FOR DELETE TO authenticated USING (private.is_app_admin(auth.uid()));

ALTER TABLE public.profile_video_settings ADD COLUMN voice_ref uuid REFERENCES public.voices(id) ON DELETE SET NULL;