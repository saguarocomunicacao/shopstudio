CREATE TABLE public.prompt_templates (
  key text PRIMARY KEY,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  placeholders text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prompt_templates TO authenticated;
GRANT ALL ON public.prompt_templates TO service_role;

ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY prompt_templates_select ON public.prompt_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY prompt_templates_write_admin ON public.prompt_templates
  FOR ALL TO authenticated
  USING (private.is_app_admin(auth.uid()))
  WITH CHECK (private.is_app_admin(auth.uid()));

CREATE TRIGGER prompt_templates_updated_at
  BEFORE UPDATE ON public.prompt_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.profile_prompt_overrides (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  key text NOT NULL REFERENCES public.prompt_templates(key) ON DELETE CASCADE,
  body text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_prompt_overrides TO authenticated;
GRANT ALL ON public.profile_prompt_overrides TO service_role;

ALTER TABLE public.profile_prompt_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY ppo_select ON public.profile_prompt_overrides
  FOR SELECT TO authenticated
  USING (private.has_permission(auth.uid(), profile_id, 'perfis', 'visualizar'));
CREATE POLICY ppo_insert ON public.profile_prompt_overrides
  FOR INSERT TO authenticated
  WITH CHECK (private.has_permission(auth.uid(), profile_id, 'perfis', 'editar'));
CREATE POLICY ppo_update ON public.profile_prompt_overrides
  FOR UPDATE TO authenticated
  USING (private.has_permission(auth.uid(), profile_id, 'perfis', 'editar'))
  WITH CHECK (private.has_permission(auth.uid(), profile_id, 'perfis', 'editar'));
CREATE POLICY ppo_delete ON public.profile_prompt_overrides
  FOR DELETE TO authenticated
  USING (private.has_permission(auth.uid(), profile_id, 'perfis', 'editar'));

CREATE TRIGGER profile_prompt_overrides_updated_at
  BEFORE UPDATE ON public.profile_prompt_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();