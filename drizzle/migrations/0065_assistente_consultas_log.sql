CREATE TABLE public.assistente_consultas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid,
  profile_id uuid,
  pergunta text NOT NULL,
  resposta text,
  consultas jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.assistente_consultas TO authenticated;
GRANT ALL ON public.assistente_consultas TO service_role;
ALTER TABLE public.assistente_consultas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own select" ON public.assistente_consultas FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own insert" ON public.assistente_consultas FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE INDEX assistente_consultas_user_idx ON public.assistente_consultas(user_id, created_at DESC);