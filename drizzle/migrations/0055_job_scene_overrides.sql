ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS cenas_count integer,
  ADD COLUMN IF NOT EXISTS take_duration integer;

COMMENT ON COLUMN public.jobs.cenas_count IS 'Numero de cenas deste video (NULL = herda do perfil). Usado pela automacao.';
COMMENT ON COLUMN public.jobs.take_duration IS 'Duracao de cada cena em segundos (NULL = herda do perfil). Usado pela automacao.';