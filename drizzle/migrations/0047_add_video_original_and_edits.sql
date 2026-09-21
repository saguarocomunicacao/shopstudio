ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS video_original_path text,
  ADD COLUMN IF NOT EXISTS video_edits jsonb;

COMMENT ON COLUMN public.jobs.video_original_path IS 'Gravação original, nunca sobrescrita por edições.';
COMMENT ON COLUMN public.jobs.video_edits IS 'Lista de operações aplicadas ao original para gerar o vídeo editado.';

UPDATE public.jobs
SET video_original_path = video_path
WHERE formato = 'gravacao' AND video_path IS NOT NULL AND video_original_path IS NULL;