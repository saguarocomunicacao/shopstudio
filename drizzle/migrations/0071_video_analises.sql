ALTER TYPE public.etapa_consumo ADD VALUE IF NOT EXISTS 'analise_video';

CREATE TABLE public.video_analises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_by uuid,
  origem text NOT NULL CHECK (origem IN ('arquivo','youtube')),
  storage_path text,
  mime_type text,
  youtube_url text,
  titulo text NOT NULL DEFAULT '',
  duracao numeric,
  pergunta text,
  status text NOT NULL DEFAULT 'enviando' CHECK (status IN ('enviando','analisando','pronto','erro')),
  erro text,
  resultado jsonb,
  frames jsonb NOT NULL DEFAULT '[]'::jsonb,
  custo_cents integer NOT NULL DEFAULT 0,
  consumo_evento_id uuid REFERENCES public.consumo_eventos(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX video_analises_profile_idx ON public.video_analises(profile_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_analises TO authenticated;
GRANT ALL ON public.video_analises TO service_role;
ALTER TABLE public.video_analises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ver analises do perfil" ON public.video_analises FOR SELECT TO authenticated
  USING (public.can_view_profile(profile_id) OR public.can_edit_pipeline(profile_id));
CREATE POLICY "editar analises do perfil" ON public.video_analises FOR UPDATE TO authenticated
  USING (public.can_edit_pipeline(profile_id)) WITH CHECK (public.can_edit_pipeline(profile_id));
CREATE POLICY "remover analises do perfil" ON public.video_analises FOR DELETE TO authenticated
  USING (public.can_edit_pipeline(profile_id));

CREATE TRIGGER video_analises_updated_at BEFORE UPDATE ON public.video_analises
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.video_analises;

CREATE POLICY "analises ler arquivos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'video-analises' AND public.can_view_profile(((storage.foldername(name))[2])::uuid));
CREATE POLICY "analises enviar arquivos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'video-analises' AND public.can_edit_pipeline(((storage.foldername(name))[2])::uuid));
CREATE POLICY "analises remover arquivos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'video-analises' AND public.can_edit_pipeline(((storage.foldername(name))[2])::uuid));