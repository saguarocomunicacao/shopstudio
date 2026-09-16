CREATE OR REPLACE FUNCTION private.has_global_permission(_user_id uuid, _module text, _action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT private.is_app_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.user_profile_roles upr
    JOIN public.role_permissions rp ON rp.role_id = upr.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE upr.user_id = _user_id AND p.module = _module AND p.action = _action
  )
$$;
REVOKE ALL ON FUNCTION private.has_global_permission(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_global_permission(uuid, text, text) TO authenticated, service_role;

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  niche text NOT NULL DEFAULT '',
  price numeric(12,2) NOT NULL DEFAULT 0,
  commission numeric(5,2) NOT NULL DEFAULT 0,
  url text NOT NULL DEFAULT '',
  hype integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Ativo',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY products_select ON public.products FOR SELECT TO authenticated USING (private.has_global_permission(auth.uid(), 'produtos', 'visualizar'));
CREATE POLICY products_insert ON public.products FOR INSERT TO authenticated WITH CHECK (private.has_global_permission(auth.uid(), 'produtos', 'criar'));
CREATE POLICY products_update ON public.products FOR UPDATE TO authenticated USING (private.has_global_permission(auth.uid(), 'produtos', 'editar')) WITH CHECK (private.has_global_permission(auth.uid(), 'produtos', 'editar'));
CREATE POLICY products_delete ON public.products FOR DELETE TO authenticated USING (private.has_global_permission(auth.uid(), 'produtos', 'remover'));

CREATE TYPE public.job_status AS ENUM ('novo','produto_escolhido','roteiro_pronto','gerando_video','video_pronto','rascunho_enviado','publicado');

CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.job_status NOT NULL DEFAULT 'novo',
  title text NOT NULL DEFAULT '',
  script text,
  video_url text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_profile_idx ON public.jobs (profile_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY jobs_select ON public.jobs FOR SELECT TO authenticated USING (private.has_permission(auth.uid(), profile_id, 'pipeline', 'visualizar'));
CREATE POLICY jobs_insert ON public.jobs FOR INSERT TO authenticated WITH CHECK (private.has_permission(auth.uid(), profile_id, 'pipeline', 'criar'));
CREATE POLICY jobs_update ON public.jobs FOR UPDATE TO authenticated USING (private.has_permission(auth.uid(), profile_id, 'pipeline', 'editar')) WITH CHECK (private.has_permission(auth.uid(), profile_id, 'pipeline', 'editar'));
CREATE POLICY jobs_delete ON public.jobs FOR DELETE TO authenticated USING (private.has_permission(auth.uid(), profile_id, 'pipeline', 'remover'));

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER jobs_updated_at BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.products (name, niche, price, commission, hype, url, status) VALUES
  ('Bolsa Vitta', 'Moda', 89.90, 18, 96, '', 'Ativo'),
  ('Glow C10', 'Beleza', 64.90, 22, 93, '', 'Ativo'),
  ('Kit Organiza+', 'Casa', 119.90, 16, 91, '', 'Ativo'),
  ('Print Pocket', 'Gadgets', 149.90, 20, 89, '', 'Ativo'),
  ('Mic Go Duo', 'Eletrônicos', 179.90, 14, 86, '', 'Ativo'),
  ('Cloud Step', 'Calçados', 139.90, 17, 84, '', 'Ativo');