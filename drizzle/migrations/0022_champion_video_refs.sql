ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS script_refs jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.kalodata_video_refs (
  category_id text PRIMARY KEY,
  videos jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.kalodata_video_refs TO authenticated;
GRANT ALL ON public.kalodata_video_refs TO service_role;

ALTER TABLE public.kalodata_video_refs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Backoffice lê o cache de vídeos campeões"
ON public.kalodata_video_refs
FOR SELECT
TO authenticated
USING (public.is_backoffice());

INSERT INTO public.app_config (key, value_num)
VALUES ('roteiro_usar_campeoes', 1)
ON CONFLICT (key) DO NOTHING;