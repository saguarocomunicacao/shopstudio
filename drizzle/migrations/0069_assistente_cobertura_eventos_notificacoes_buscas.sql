-- Linha do tempo detalhada do job
CREATE TABLE public.job_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  tipo text NOT NULL,
  de_status text,
  para_status text,
  mensagem text,
  ator uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_eventos_job_idx ON public.job_eventos(job_id, created_at);
GRANT SELECT ON public.job_eventos TO authenticated;
GRANT ALL ON public.job_eventos TO service_role;
ALTER TABLE public.job_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver eventos do job" ON public.job_eventos FOR SELECT TO authenticated
  USING (public.can_view_profile(profile_id));

-- Notificações por usuário
CREATE TABLE public.notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  tipo text NOT NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  texto text NOT NULL,
  lida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notificacoes_user_idx ON public.notificacoes(user_id, created_at DESC);
GRANT SELECT, UPDATE ON public.notificacoes TO authenticated;
GRANT ALL ON public.notificacoes TO service_role;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver minhas notificacoes" ON public.notificacoes FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "marcar minhas notificacoes" ON public.notificacoes FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Buscas do Descobrir / Radar com resultados (retenção 30 dias)
CREATE TABLE public.buscas_produto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_id uuid,
  origem text NOT NULL DEFAULT 'descobrir',
  termo text,
  filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
  total integer NOT NULL DEFAULT 0,
  resultados jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX buscas_produto_profile_idx ON public.buscas_produto(profile_id, created_at DESC);
GRANT SELECT ON public.buscas_produto TO authenticated;
GRANT ALL ON public.buscas_produto TO service_role;
ALTER TABLE public.buscas_produto ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver buscas do perfil" ON public.buscas_produto FOR SELECT TO authenticated
  USING (profile_id IS NOT NULL AND public.can_view_profile(profile_id));

-- Trigger: eventos + notificações a partir das mudanças no job
CREATE OR REPLACE FUNCTION public.registrar_job_eventos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ordem text[] := ARRAY['novo','produto_escolhido','roteiro_pronto','gerando_cenas','cenas_geradas','gerando_video','video_pronto','rascunho_enviado','publicado'];
  i_old int; i_new int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO job_eventos(tenant_id, job_id, profile_id, tipo, para_status, ator)
    VALUES (NEW.tenant_id, NEW.id, NEW.profile_id, 'criado', NEW.status::text, auth.uid());
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    i_old := array_position(ordem, OLD.status::text);
    i_new := array_position(ordem, NEW.status::text);
    INSERT INTO job_eventos(tenant_id, job_id, profile_id, tipo, de_status, para_status, ator)
    VALUES (NEW.tenant_id, NEW.id, NEW.profile_id,
      CASE WHEN coalesce(i_new,0) < coalesce(i_old,0) THEN 'voltou' ELSE 'avancou' END,
      OLD.status::text, NEW.status::text, auth.uid());
    IF NEW.created_by IS NOT NULL AND NEW.status::text IN ('roteiro_pronto','cenas_geradas','video_pronto') AND coalesce(i_new,0) > coalesce(i_old,0) THEN
      INSERT INTO notificacoes(tenant_id, user_id, tipo, job_id, texto)
      VALUES (NEW.tenant_id, NEW.created_by, NEW.status::text, NEW.id,
        CASE NEW.status::text
          WHEN 'roteiro_pronto' THEN 'Roteiro pronto: ' || NEW.title
          WHEN 'cenas_geradas' THEN 'Cenas geradas: ' || NEW.title
          ELSE 'Vídeo pronto para revisão: ' || NEW.title END);
    END IF;
  END IF;

  IF NEW.render_started_at IS DISTINCT FROM OLD.render_started_at AND NEW.render_started_at IS NOT NULL THEN
    INSERT INTO job_eventos(tenant_id, job_id, profile_id, tipo, mensagem, ator)
    VALUES (NEW.tenant_id, NEW.id, NEW.profile_id, 'tentativa', 'Montagem iniciada', auth.uid());
  END IF;
  IF NEW.ai_render_started_at IS DISTINCT FROM OLD.ai_render_started_at AND NEW.ai_render_started_at IS NOT NULL THEN
    INSERT INTO job_eventos(tenant_id, job_id, profile_id, tipo, mensagem, ator)
    VALUES (NEW.tenant_id, NEW.id, NEW.profile_id, 'tentativa', 'Geração por IA iniciada', auth.uid());
  END IF;
  IF NEW.render_error IS DISTINCT FROM OLD.render_error AND NEW.render_error IS NOT NULL THEN
    INSERT INTO job_eventos(tenant_id, job_id, profile_id, tipo, mensagem, ator)
    VALUES (NEW.tenant_id, NEW.id, NEW.profile_id, 'erro', left(NEW.render_error, 300), auth.uid());
  END IF;
  IF NEW.ai_render_error IS DISTINCT FROM OLD.ai_render_error AND NEW.ai_render_error IS NOT NULL THEN
    INSERT INTO job_eventos(tenant_id, job_id, profile_id, tipo, mensagem, ator)
    VALUES (NEW.tenant_id, NEW.id, NEW.profile_id, 'erro', left(NEW.ai_render_error, 300), auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_job_eventos() FROM PUBLIC;

CREATE TRIGGER registrar_job_eventos_trg
AFTER INSERT OR UPDATE OF status, render_started_at, ai_render_started_at, render_error, ai_render_error ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.registrar_job_eventos();