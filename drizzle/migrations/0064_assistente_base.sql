ALTER TYPE public.etapa_consumo ADD VALUE IF NOT EXISTS 'assistente';

CREATE TABLE public.assistente_uso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  tenant_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.assistente_uso TO authenticated;
GRANT ALL ON public.assistente_uso TO service_role;
ALTER TABLE public.assistente_uso ENABLE ROW LEVEL SECURITY;
CREATE POLICY assistente_uso_select_own ON public.assistente_uso FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY assistente_uso_insert_own ON public.assistente_uso FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE INDEX assistente_uso_user_time ON public.assistente_uso (user_id, created_at DESC);