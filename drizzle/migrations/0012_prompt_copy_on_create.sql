-- Prompts do perfil passam de "herança viva" para "cópia no nascimento".
ALTER TABLE public.profile_prompt_overrides
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'personalizado',
  ADD COLUMN IF NOT EXISTS origem_versao timestamptz;

-- A view de metadados passa a expor a data do padrão, para detectar cópias desatualizadas.
CREATE OR REPLACE VIEW public.prompt_templates_visible AS
SELECT key,
       title,
       description,
       placeholders,
       sort_order,
       CASE WHEN private.is_backoffice(auth.uid()) THEN body ELSE ''::text END AS body,
       updated_at
  FROM public.prompt_templates
 WHERE private.is_approved(auth.uid());

GRANT SELECT ON public.prompt_templates_visible TO authenticated;

-- Backfill: perfis que ainda herdavam recebem a cópia do padrão atual.
INSERT INTO public.profile_prompt_overrides (profile_id, key, body, origem, origem_versao)
SELECT p.id, t.key, t.body, 'copiado_do_padrao', t.updated_at
  FROM public.profiles p
 CROSS JOIN public.prompt_templates t
ON CONFLICT (profile_id, key) DO NOTHING;
