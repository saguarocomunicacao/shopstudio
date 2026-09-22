ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS ai_video_thumbnail_path text;
COMMENT ON COLUMN public.jobs.ai_video_thumbnail_path IS 'Miniatura privada da versão gerada por IA do vídeo próprio.';