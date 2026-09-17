ALTER TYPE public.etapa_consumo ADD VALUE IF NOT EXISTS 'roteiro_texto';
ALTER TYPE public.unidade_tarifa ADD VALUE IF NOT EXISTS 'token_input';
ALTER TYPE public.unidade_tarifa ADD VALUE IF NOT EXISTS 'token_output';
ALTER TABLE public.consumo_eventos ALTER COLUMN profile_id DROP NOT NULL;