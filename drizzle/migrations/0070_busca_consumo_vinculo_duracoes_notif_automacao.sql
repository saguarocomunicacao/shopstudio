ALTER TABLE public.buscas_produto ADD COLUMN consumo_evento_id uuid REFERENCES public.consumo_eventos(id) ON DELETE SET NULL;

-- Backfill único: casa cada busca com o evento de busca mais próximo (mesmo perfil, até 2 min, sem reuso).
WITH pares AS (
  SELECT DISTINCT ON (b.id) b.id AS busca_id, e.id AS evento_id
  FROM public.buscas_produto b
  JOIN public.consumo_eventos e
    ON e.etapa = 'busca_kalodata' AND e.profile_id = b.profile_id
   AND abs(extract(epoch FROM (e.created_at - b.created_at))) < 120
  ORDER BY b.id, abs(extract(epoch FROM (e.created_at - b.created_at)))
)
UPDATE public.buscas_produto b SET consumo_evento_id = p.evento_id FROM pares p WHERE b.id = p.busca_id;

ALTER TABLE public.jobs
  ADD COLUMN video_original_duracao numeric,
  ADD COLUMN video_edited_duracao numeric,
  ADD COLUMN ai_video_duracao numeric;

ALTER TABLE public.notificacoes ADD COLUMN origem text NOT NULL DEFAULT 'usuario';

CREATE OR REPLACE FUNCTION public.registrar_job_eventos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ordem text[] := ARRAY['novo','produto_escolhido','roteiro_pronto','gerando_cenas','cenas_geradas','gerando_video','video_pronto','rascunho_enviado','publicado'];
  i_old int; i_new int; txt text;
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
    IF NEW.status::text IN ('roteiro_pronto','cenas_geradas','video_pronto') AND coalesce(i_new,0) > coalesce(i_old,0) THEN
      txt := CASE NEW.status::text
          WHEN 'roteiro_pronto' THEN 'Roteiro pronto: ' || NEW.title
          WHEN 'cenas_geradas' THEN 'Cenas geradas: ' || NEW.title
          ELSE 'Vídeo pronto para revisão: ' || NEW.title END;
      IF NEW.automation_schedule_id IS NOT NULL OR NEW.created_by IS NULL THEN
        INSERT INTO notificacoes(tenant_id, user_id, tipo, job_id, texto, origem)
        SELECT DISTINCT NEW.tenant_id, upr.user_id, NEW.status::text, NEW.id, txt, 'automacao'
        FROM user_profile_roles upr JOIN roles r ON r.id = upr.role_id
        WHERE upr.tenant_id = NEW.tenant_id
          AND (upr.profile_id = NEW.profile_id OR upr.profile_id IS NULL)
          AND (r.is_admin OR lower(r.name) IN ('admin','administrador','gerente'));
      ELSE
        INSERT INTO notificacoes(tenant_id, user_id, tipo, job_id, texto, origem)
        VALUES (NEW.tenant_id, NEW.created_by, NEW.status::text, NEW.id, txt, 'usuario');
      END IF;
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