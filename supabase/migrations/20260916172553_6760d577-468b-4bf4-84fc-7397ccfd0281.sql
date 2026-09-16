CREATE TABLE public.profile_identities (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  tone text NOT NULL DEFAULT 'descontraido',
  language text NOT NULL DEFAULT 'pt-BR',
  style_notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_identities TO authenticated;
GRANT ALL ON public.profile_identities TO service_role;

ALTER TABLE public.profile_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY profile_identities_select ON public.profile_identities
  FOR SELECT TO authenticated
  USING (private.has_permission(auth.uid(), profile_id, 'perfis', 'visualizar'));

CREATE POLICY profile_identities_insert ON public.profile_identities
  FOR INSERT TO authenticated
  WITH CHECK (private.has_permission(auth.uid(), profile_id, 'perfis', 'editar'));

CREATE POLICY profile_identities_update ON public.profile_identities
  FOR UPDATE TO authenticated
  USING (private.has_permission(auth.uid(), profile_id, 'perfis', 'editar'))
  WITH CHECK (private.has_permission(auth.uid(), profile_id, 'perfis', 'editar'));

CREATE TRIGGER profile_identities_updated_at
  BEFORE UPDATE ON public.profile_identities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS caption text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS hashtags text[];