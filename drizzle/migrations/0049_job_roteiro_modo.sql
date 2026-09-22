ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS roteiro_modo text NOT NULL DEFAULT 'criar',
  ADD COLUMN IF NOT EXISTS roteiro_origem text;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_roteiro_modo_check CHECK (roteiro_modo IN ('criar','organizar'));

COMMENT ON COLUMN public.jobs.roteiro_modo IS 'criar = IA escreve o roteiro; organizar = IA apenas organiza o roteiro enviado pelo cliente';
COMMENT ON COLUMN public.jobs.roteiro_origem IS 'Texto bruto enviado pelo cliente no modo organizar (colado, ditado ou extraido de arquivo)';