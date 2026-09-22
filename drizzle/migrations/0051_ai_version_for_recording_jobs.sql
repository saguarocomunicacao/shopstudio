-- Versão gerada por IA de um vídeo próprio ("Gravar eu mesmo").
-- A trilha de IA usa colunas próprias para nunca sobrescrever a gravação:
-- o job continua com seu status/etapa normais nas filas de rascunho.
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS ai_status text,
  ADD COLUMN IF NOT EXISTS ai_render_stage text,
  ADD COLUMN IF NOT EXISTS ai_render_id text,
  ADD COLUMN IF NOT EXISTS ai_render_error text,
  ADD COLUMN IF NOT EXISTS ai_render_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_video_url text,
  ADD COLUMN IF NOT EXISTS ai_video_path text,
  ADD COLUMN IF NOT EXISTS ai_video_thumbnail_url text,
  ADD COLUMN IF NOT EXISTS ai_video_storage_status text,
  ADD COLUMN IF NOT EXISTS ai_video_storage_error text,
  ADD COLUMN IF NOT EXISTS video_edited_path text,
  ADD COLUMN IF NOT EXISTS video_choice text NOT NULL DEFAULT 'gravado';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_video_choice_check') THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_video_choice_check
      CHECK (video_choice IN ('gravado', 'gravado_editado', 'ia'));
  END IF;
END $$;

-- Versão editada já existente passa a ter caminho próprio, preservando as três versões.
UPDATE public.jobs
   SET video_edited_path = video_path,
       video_choice = 'gravado_editado'
 WHERE formato = 'gravacao'
   AND video_original_path IS NOT NULL
   AND video_path IS NOT NULL
   AND video_path <> video_original_path;

COMMENT ON COLUMN public.jobs.video_choice IS 'Versão ativa escolhida pelo usuário: gravado | gravado_editado | ia. video_path espelha a escolha.';
COMMENT ON COLUMN public.jobs.ai_status IS 'Etapa da trilha de IA dentro do modal do vídeo próprio: cenas_geradas | gerando_video | video_pronto.';
COMMENT ON COLUMN public.jobs.video_edited_path IS 'Gravação editada preservada, mesmo quando a versão ativa é outra.';