CREATE TABLE public.assistente_conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  user_id uuid NOT NULL,
  titulo text NOT NULL DEFAULT 'Nova conversa',
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistente_conversas TO authenticated;
GRANT ALL ON public.assistente_conversas TO service_role;
ALTER TABLE public.assistente_conversas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own conversas" ON public.assistente_conversas FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX assistente_conversas_user_idx ON public.assistente_conversas(user_id, atualizado_em DESC);

CREATE TABLE public.assistente_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid NOT NULL REFERENCES public.assistente_conversas(id) ON DELETE CASCADE,
  papel text NOT NULL CHECK (papel IN ('user','assistant','aviso','erro')),
  conteudo text NOT NULL,
  tools_log jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistente_mensagens TO authenticated;
GRANT ALL ON public.assistente_mensagens TO service_role;
ALTER TABLE public.assistente_mensagens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own mensagens" ON public.assistente_mensagens FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assistente_conversas c WHERE c.id = conversa_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assistente_conversas c WHERE c.id = conversa_id AND c.user_id = auth.uid()));
CREATE INDEX assistente_mensagens_conv_idx ON public.assistente_mensagens(conversa_id, criado_em);