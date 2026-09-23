CREATE TABLE public.automation_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT public.default_tenant_id() REFERENCES public.tenants(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT 'Agenda de automação',
  ativa boolean NOT NULL DEFAULT false,
  videos_por_dia integer NOT NULL DEFAULT 1,
  horarios jsonb NOT NULL DEFAULT '["09:00"]'::jsonb,
  fonte text NOT NULL DEFAULT 'garimpo',
  filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
  avatar_modo text NOT NULL DEFAULT 'perfil',
  avatar_id uuid REFERENCES public.profile_avatars(id) ON DELETE SET NULL,
  voice_ref uuid REFERENCES public.voices(id) ON DELETE SET NULL,
  cenas_count integer,
  take_duration integer,
  qualidade text,
  teto_diario_cents integer,
  teto_mensal_cents integer,
  pausada_motivo text,
  ultimo_disparo_em timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_schedules_fonte_chk CHECK (fonte IN ('garimpo', 'radar')),
  CONSTRAINT automation_schedules_avatar_modo_chk CHECK (avatar_modo IN ('perfil', 'biblioteca', 'nenhum')),
  CONSTRAINT automation_schedules_videos_chk CHECK (videos_por_dia BETWEEN 1 AND 20)
);

COMMENT ON TABLE public.automation_schedules IS 'Agendas de geracao automatica de video por IA (Parte 1: apenas configuracao, nenhum disparo).';
COMMENT ON COLUMN public.automation_schedules.filtros IS 'Filtros do garimpo: comissao_min, preco_min, preco_max, receita_min, lancamento, periodo, ordenacao, palavra_chave.';
COMMENT ON COLUMN public.automation_schedules.horarios IS 'Lista de horarios HH:MM (fuso America/Sao_Paulo) em que a geracao comeca.';
COMMENT ON COLUMN public.automation_schedules.ultimo_disparo_em IS 'Reservado para a Parte 2 (execucao). Regra de escolha: proximo produto que atende aos filtros e que ainda NAO possui job/video criado para este profile_id (jobs.product_id).';
COMMENT ON COLUMN public.automation_schedules.pausada_motivo IS 'Preenchido pela Parte 2 quando a agenda pausa sozinha (ex.: teto de gasto atingido).';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_schedules TO authenticated;
GRANT ALL ON public.automation_schedules TO service_role;

ALTER TABLE public.automation_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "automation_select" ON public.automation_schedules
  FOR SELECT TO authenticated
  USING (public.can_view_profile(profile_id));

CREATE POLICY "automation_insert" ON public.automation_schedules
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_pipeline(profile_id));

CREATE POLICY "automation_update" ON public.automation_schedules
  FOR UPDATE TO authenticated
  USING (public.can_edit_pipeline(profile_id))
  WITH CHECK (public.can_edit_pipeline(profile_id));

CREATE POLICY "automation_delete" ON public.automation_schedules
  FOR DELETE TO authenticated
  USING (public.can_edit_pipeline(profile_id));

CREATE TRIGGER automation_schedules_updated_at
  BEFORE UPDATE ON public.automation_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX automation_schedules_profile_idx ON public.automation_schedules (profile_id, created_at DESC);
