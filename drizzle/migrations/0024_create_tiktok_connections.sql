-- Helpers de permissão por perfil (reutilizam o RBAC existente)
CREATE OR REPLACE FUNCTION public.can_edit_profile(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT private.has_permission(auth.uid(), _profile_id, 'perfis', 'editar');
$$;

CREATE OR REPLACE FUNCTION public.can_view_profile(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT private.has_permission(auth.uid(), _profile_id, 'perfis', 'visualizar')
      OR private.has_permission(auth.uid(), _profile_id, 'perfis', 'editar');
$$;

-- Conexões OAuth do TikTok Shop, uma por perfil. Os tokens nunca são expostos ao frontend:
-- não há GRANT para authenticated/anon; só o backend (service_role) lê/escreve.
CREATE TABLE public.tiktok_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  open_id text,
  seller_name text,
  access_token text,
  refresh_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  status text NOT NULL DEFAULT 'disconnected',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tiktok_connections_status_check CHECK (status IN ('connected', 'disconnected', 'error'))
);

GRANT ALL ON public.tiktok_connections TO service_role;

ALTER TABLE public.tiktok_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver conexões dos perfis permitidos"
  ON public.tiktok_connections FOR SELECT TO authenticated
  USING (public.can_view_profile(profile_id));

CREATE POLICY "Gerenciar conexões dos perfis editáveis"
  ON public.tiktok_connections FOR ALL TO authenticated
  USING (public.can_edit_profile(profile_id))
  WITH CHECK (public.can_edit_profile(profile_id));

CREATE TRIGGER tiktok_connections_set_updated_at
  BEFORE UPDATE ON public.tiktok_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- States de CSRF do fluxo OAuth. Também backend-only.
CREATE TABLE public.tiktok_oauth_states (
  state text PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  redirect_to text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.tiktok_oauth_states TO service_role;

ALTER TABLE public.tiktok_oauth_states ENABLE ROW LEVEL SECURITY;
