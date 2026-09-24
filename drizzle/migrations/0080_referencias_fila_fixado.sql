ALTER TABLE public.video_analises DROP CONSTRAINT IF EXISTS video_analises_status_check;
ALTER TABLE public.video_analises ADD CONSTRAINT video_analises_status_check CHECK (status = ANY (ARRAY['na_fila','enviando','baixando','analisando','pronto','erro']));
ALTER TABLE public.referencia_videos ADD COLUMN IF NOT EXISTS fixado boolean NOT NULL DEFAULT false;
ALTER TABLE public.videos_nao_vinculados ADD COLUMN IF NOT EXISTS fixado boolean NOT NULL DEFAULT false;